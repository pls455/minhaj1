import { db } from './firebase.js';
import { collection, getDocs, query, limit, addDoc, serverTimestamp } from 'https://www.gstatic.com/firebasejs/12.17.1/firebase-firestore.js';

const norm=(s='')=>String(s).toLowerCase().normalize('NFKC').replace(/[أإآ]/g,'ا').replace(/ة/g,'ه').replace(/[\u064B-\u065F]/g,'').replace(/[^\u0600-\u06FFa-z0-9]+/g,' ').replace(/\s+/g,' ').trim();
const tokens=s=>new Set(norm(s).split(' ').filter(x=>x.length>=2));
const overlap=(a,b)=>{const A=tokens(a),B=tokens(b);if(!A.size||!B.size)return 0;let n=0;A.forEach(x=>B.has(x)&&n++);return n/Math.max(1,Math.min(A.size,B.size));};
let knowledge=null;

async function loadKnowledge(){
  if(knowledge)return knowledge;
  const get=async n=>(await getDocs(query(collection(db,n),limit(2000)))).docs.map(d=>({id:d.id,...d.data()}));
  const [branches,subjects,categories,resources,registry]=await Promise.all([
    get('branches'),get('subjects'),get('categories'),get('resources'),get('sourceRegistry')
  ]);
  const subjectEvidence=new Map(),categoryEvidence=new Map(),branchEvidence=new Map();
  const add=(map,id,text,weight=1)=>{if(!id||!text)return;const k=String(id);const a=map.get(k)||[];a.push({text,weight});map.set(k,a)};
  for(const r of [...resources,...registry]){
    const text=[r.title,r.name,r.detectedPath,r.description,r.url].filter(Boolean).join(' / ');
    add(subjectEvidence,r.subjectId,text,3);
    add(categoryEvidence,r.categoryId,text,3);
    for(const id of (r.branchIds||[]))add(branchEvidence,id,text,2);
  }
  knowledge={branches,subjects,categories,resources,registry,subjectEvidence,categoryEvidence,branchEvidence};
  return knowledge;
}

function candidateScore(item,text,evidence){
  const own=[item.name,item.slug,item.description].filter(Boolean).join(' ');
  let score=overlap(own,text)*0.55;
  const ev=evidence?.get(item.id)||[];
  for(const e of ev)score=Math.max(score,overlap(e.text,text)*Math.min(0.95,0.35+e.weight*.1));
  const n=norm(text),q=norm(item.name);
  if(q&&n.includes(q))score=Math.max(score,Math.min(0.98,.58+q.length/70));
  return Math.min(1,score);
}
function ranked(items,text,evidence){return items.filter(x=>x.active!==false).map(item=>({item,score:candidateScore(item,text,evidence)})).filter(x=>x.score>=.18).sort((a,b)=>b.score-a.score);}

function relationAllows(category,subject,branch){
  if(!category)return true;
  const ids=[category.subjectId,category.subjectID,category.subject,category.subjectIds,category.subjectIDs].flat().filter(Boolean).map(String);
  const bids=[category.branchId,category.branchID,category.branchIds,category.branchIDs].flat().filter(Boolean).map(String);
  if(subject&&ids.length&&!ids.includes(String(subject.id)))return false;
  if(branch&&bids.length&&!bids.includes(String(branch.id)))return false;
  if(subject){
    const sb=[subject.branchId,subject.branchID,subject.branchIds,subject.branchIDs].flat().filter(Boolean).map(String);
    if(sb.length&&branch&&!sb.includes(String(branch.id)))return false;
  }
  return true;
}

function classify(item,data){
  const path=(item.ancestors||[]).join(' / ');
  const text=[path,item.name,item.description].filter(Boolean).join(' / ');
  const ss=ranked(data.subjects,text,data.subjectEvidence);
  const bs=ranked(data.branches,text,data.branchEvidence);
  const cs=ranked(data.categories,text,data.categoryEvidence);
  const subject=ss[0], branch=bs[0];
  const compatible=cs.filter(c=>relationAllows(c.item,subject?.item,branch?.item));
  const category=compatible[0]||null;
  const margin=(arr)=>arr.length<2?(arr[0]?.score||0):Math.max(0,(arr[0].score-arr[1].score));
  const confidence={subject:subject?.score||0,branch:branch?.score||0,category:category?.score||0};
  const ambiguity=Math.max(margin(ss),margin(bs),margin(compatible));
  const strongSubject=confidence.subject>=.62&&ambiguity>=.06;
  const strongCategory=confidence.category>=.58;
  const strongBranch=confidence.branch>=.72;
  const conflicts=[];
  if(category&&!relationAllows(category.item,subject?.item,branch?.item))conflicts.push('المادة/الفرع لا يتوافقان مع التصنيف');
  if(subject&&branch){
    const sb=[subject.item.branchId,subject.item.branchID,subject.item.branchIds,subject.item.branchIDs].flat().filter(Boolean).map(String);
    if(sb.length&&!sb.includes(String(branch.item.id)))conflicts.push('المادة لا ترتبط بالفرع المقترح');
  }
  return {
    subjectId:strongSubject?subject.item.id:'',categoryId:strongCategory?category.item.id:'',branchIds:strongBranch?[branch.item.id]:[],
    confidence:{subject:Math.round(confidence.subject*100),category:Math.round(confidence.category*100),branch:Math.round(confidence.branch*100)},
    overall:Math.round((confidence.subject+confidence.category+confidence.branch)/3*100),
    conflicts,needsReview:!!conflicts.length||!strongSubject||!strongCategory,
    evidence:{path,name:item.name,subject:subject?.item.name||'',category:category?.item.name||'',branch:branch?.item.name||''}
  };
}

function applyCard(card,c){
  const s=card.querySelector('[data-subject]');const cat=card.querySelector('[data-category]');
  if(s&&c.subjectId)s.value=c.subjectId;
  if(cat&&c.categoryId)cat.value=c.categoryId;
  const checks=[...card.querySelectorAll('[data-branch-id]')];checks.forEach(x=>x.checked=false);for(const id of c.branchIds){const x=checks.find(y=>y.dataset.branchId===id);if(x)x.checked=true;}
  let hint=card.querySelector('.drive-dynamic-hint');if(!hint){hint=document.createElement('div');hint.className='drive-dynamic-hint';card.querySelector('.drive-auto-hint')?.after(hint);}
  const pct=c.overall;
  hint.textContent=c.conflicts.length?`🚫 تعارض: ${c.conflicts.join(' • ')}`:c.needsReview?`⚠️ اقتراح ديناميكي • ${pct}% • يحتاج تحققًا`: `✓ تصنيف ديناميكي قوي • ${pct}%`;
  hint.dataset.confidence=String(pct);
}

async function apply(){
  const root=document.getElementById('driveResults');if(!root)return;
  const data=await loadKnowledge();
  const cards=[...root.querySelectorAll('.drive-review-card[data-review-index]')];let strong=0,review=0;
  cards.forEach(card=>{const item={name:card.querySelector('.drive-file-head strong')?.textContent||'',ancestors:(card.querySelector('.drive-path')?.textContent||'').replace(/^📂\s*/,'').split(' / ').filter(Boolean)};const c=classify(item,data);applyCard(card,c);c.needsReview?review++:strong++;});
  let stat=root.querySelector('.drive-dynamic-summary');if(!stat){stat=document.createElement('div');stat.className='drive-dynamic-summary';root.prepend(stat);}stat.textContent=`🧠 محرك التصنيف: ${strong} واضح • ${review} يحتاج تحقق • يعتمد على المسار + الملف + المعرفة المتراكمة، ولا يخترع فرعًا أو مادة بلا دليل.`;
}

async function guardImport(event){
  const root=document.getElementById('driveResults');if(!root)return;
  const data=await loadKnowledge();const cards=[...root.querySelectorAll('.drive-review-card[data-review-index]')].filter(c=>c.querySelector('[data-drive-index]')?.checked);
  const bad=[];
  for(const card of cards){const item={name:card.querySelector('.drive-file-head strong')?.textContent||'',ancestors:(card.querySelector('.drive-path')?.textContent||'').replace(/^📂\s*/,'').split(' / ').filter(Boolean)};const c=classify(item,data);const sid=card.querySelector('[data-subject]')?.value||'';const cid=card.querySelector('[data-category]')?.value||'';const selectedBranch=card.querySelector('[data-branch-id]:checked')?.dataset.branchId||'';if(cid&&sid){const cat=data.categories.find(x=>x.id===cid),sub=data.subjects.find(x=>x.id===sid),br=data.branches.find(x=>x.id===selectedBranch);if(!relationAllows(cat,sub,br))bad.push(item.name+' : تعارض بين المادة/الفرع/التصنيف');}if(c.conflicts.length)bad.push(item.name+' : '+c.conflicts.join('، '));}
  if(bad.length){event.preventDefault();event.stopImmediatePropagation();alert('تم إيقاف الإضافة للمراجعة بسبب تعارضات:\n\n'+bad.slice(0,8).join('\n')+'\n\nالمصدر الجديد لا يُرفض لأنه مجهول، فقط التصنيف المتعارض يحتاج تصحيحًا.');return false;}
}

async function guardApprove(event){
  const card=event.target.closest('.drive-review-card[data-pending-id]');if(!card)return;
  const data=await loadKnowledge();const sid=card.querySelector('[data-review-subject]')?.value||'';const cid=card.querySelector('[data-review-category]')?.value||'';const bid=card.querySelector('[data-branch-id]:checked')?.dataset.branchId||'';
  const sub=data.subjects.find(x=>x.id===sid),cat=data.categories.find(x=>x.id===cid),br=data.branches.find(x=>x.id===bid);
  if(!sub||!cat||!relationAllows(cat,sub,br)){event.preventDefault();event.stopImmediatePropagation();alert('🚫 التصنيف غير متوافق. تم منع النشر حتى لا يدخل المصدر في مادة أو تصنيف خاطئ.');return false;}
  setTimeout(()=>learnFromApproval(card,data).catch(()=>{}),900);
}

async function learnFromApproval(card,data){
  const sid=card.querySelector('[data-review-subject]')?.value||'',cid=card.querySelector('[data-review-category]')?.value||'',bid=card.querySelector('[data-branch-id]:checked')?.dataset.branchId||'';
  const title=card.querySelector('.drive-file-head strong')?.textContent||'';const path=card.querySelector('.drive-review-meta')?.textContent||'';
  if(!sid&&!cid)return;
  try{await addDoc(collection(db,'classificationKnowledge'),{sourceTitle:title,sourcePath:path,subjectId:sid||null,categoryId:cid||null,branchIds:bid?[bid]:[],signals:[title,path].filter(Boolean),createdAt:serverTimestamp(),kind:'approved_source'});knowledge=null;}catch(e){console.warn('[Classification learning]',e);}
}

const start=()=>{const root=document.getElementById('driveResults');if(!root)return;const observer=new MutationObserver(()=>{clearTimeout(root.__dynamicTimer);root.__dynamicTimer=setTimeout(()=>apply().catch(console.error),120);});observer.observe(root,{childList:true,subtree:true});apply().catch(console.error);document.addEventListener('click',e=>{if(e.target.closest('#importDriveItems'))guardImport(e);if(e.target.closest('[data-approve]'))guardApprove(e);},{capture:true});};
if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',start,{once:true});else start();