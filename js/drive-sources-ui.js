function injectDriveUI() {
  const tabs = document.querySelector('.admin-tabs');
  const dashboard = document.querySelector('#dashboard');
  if (!tabs || !dashboard || document.getElementById('driveSourcesPanel')) return;

  const tab = document.createElement('button');
  tab.className = 'admin-tab';
  tab.dataset.tab = 'driveSources';
  tab.textContent = '☁️ مصادر Drive';
  tabs.insertBefore(tab, tabs.querySelector('[data-tab="logs"]') || null);

  const panel = document.createElement('div');
  panel.id = 'driveSourcesPanel';
  panel.className = 'admin-panel hidden';
  panel.innerHTML = `
    <div class="panel-header"><div><h2>☁️ مصادر Google Drive</h2><p>الصق رابط ملف أو مجلد. الفحص لا يضيف شيئًا للموقع، وبعدها يعمل التصنيف الديناميكي لكل مصدر بشكل مستقل.</p></div></div>
    <div class="bulk-box">
      <h3>1. رابط المصدر</h3>
      <input id="driveUrl" type="url" placeholder="https://drive.google.com/file/d/... أو https://drive.google.com/drive/folders/...">
      <button id="inspectDriveBtn" class="btn primary">🔎 فحص الرابط فقط</button>
      <div id="driveMsg"></div>
    </div>
    <div class="bulk-box">
      <h3>2. Google Drive API Key</h3>
      <p class="admin-note">المفتاح يُحفظ محليًا على جهاز الأدمن فقط. لا نحتاجه لفتح ملف عام بالمعرف، لكنه مطلوب لاستعراض محتويات المجلد.</p>
      <input id="driveApiKey" type="password" placeholder="Google Drive API Key">
      <button id="saveDriveApiKey" class="btn secondary">حفظ المفتاح على هذا الجهاز</button>
    </div>
    <div class="bulk-box">
      <h3>3. اكتشاف وتصنيف المصادر</h3>
      <p class="admin-note">المجلد الواحد يمكن أن يحتوي علمي وأدبي وصناعي ومواد وتصنيفات مختلفة. النظام يقترح فقط ما يجد عليه دليلًا، وما لا يعرفه يتركه فارغًا.</p>
      <div id="driveResults" class="admin-list"></div>
    </div>
    <div class="bulk-box">
      <div class="panel-header"><div><h3>4. قيد المراجعة</h3><p>هذه العناصر موجودة في Registry فقط، ولا تظهر للطلاب حتى اعتمادها.</p></div><button id="refreshDriveReview" class="btn secondary">تحديث</button></div>
      <div id="driveReviewList" class="admin-list"></div>
    </div>`;
  dashboard.appendChild(panel);

  const activate = () => {
    document.querySelectorAll('.admin-panel').forEach(x => x.classList.add('hidden'));
    document.querySelectorAll('.admin-tab').forEach(x => x.classList.remove('active'));
    panel.classList.remove('hidden'); tab.classList.add('active');
    window.dispatchEvent(new CustomEvent('minhaj:drive-panel-open'));
  };
  tab.addEventListener('click', e => { e.preventDefault(); activate(); });
  tabs.addEventListener('click', e => { const other = e.target.closest('.admin-tab'); if (other && other !== tab) panel.classList.add('hidden'); });

  const style = document.createElement('style');
  style.textContent = `
    .drive-result-head{display:flex;justify-content:space-between;gap:12px;align-items:center;padding:12px;border-bottom:1px solid rgba(255,255,255,.08)}
    .drive-review-note{padding:12px;margin:10px 0;border-radius:12px;background:rgba(255,190,60,.08);border:1px solid rgba(255,190,60,.18)}
    .drive-items{display:grid;gap:8px;margin-top:10px}
    .drive-item,.drive-review-card{padding:12px;border:1px solid rgba(255,255,255,.08);border-radius:12px}
    .drive-item{display:grid;grid-template-columns:auto 1fr auto;gap:10px;align-items:center}
    .drive-review-card{display:grid;gap:10px}.drive-file-head{display:grid;grid-template-columns:auto auto 1fr auto;gap:10px;align-items:center}.drive-item-name{overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
    .drive-classify{display:grid;gap:10px}.drive-branch-wrap{display:flex;gap:12px;flex-wrap:wrap;align-items:center}.drive-branch-check{display:inline-flex;gap:6px;align-items:center}
    .drive-import-row{margin-top:12px;display:flex;justify-content:flex-start}.drive-review-actions{display:flex;gap:8px;flex-wrap:wrap}.drive-review-meta{opacity:.75;font-size:.9rem}
    .drive-dynamic-summary{padding:10px 12px;margin:10px 0;border-radius:10px;background:rgba(90,160,255,.08);border:1px solid rgba(90,160,255,.16);font-size:.92rem}
    .drive-dynamic-hint{font-size:.85rem;opacity:.86;padding:7px 9px;border-radius:8px;background:rgba(255,255,255,.035)}
    .drive-dynamic-hint[data-confidence="0"],.drive-dynamic-hint[data-confidence="33"]{color:#f0b36a}
    @media(max-width:700px){.drive-file-head{grid-template-columns:auto auto 1fr}.drive-file-head small{grid-column:3}.drive-review-actions button{flex:1}}
  `;
  document.head.appendChild(style);
  import('./drive-sources.js').catch(err => console.error('[Drive Sources]', err));
  import('./drive-dynamic-classifier.js').catch(err => console.error('[Drive Dynamic Classifier]', err));
}
if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', injectDriveUI, { once: true }); else injectDriveUI();
