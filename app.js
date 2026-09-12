const STORAGE_KEY = 'ion_tc_data';
// ── Init ───────────────────────────────────────────
async function init() {
  setSyncStatus('loading', '⏳ Loading data…');
  let loaded = null;
  if (ghToken()) {
    loaded = await ghLoad();
  }
  if (Array.isArray(loaded) && loaded.length > 0) {
    records = loaded;
    // mirror to localStorage as backup
    try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch(e) {}
    setSyncStatus('ok', '✅ Synced with GitHub');
  } else if (loaded === null) {
    // network/auth error — fall back to localStorage
    setSyncStatus('warn', '⚠️ Offline — using local data');
    loadFromLocal();
  } else {
    // empty repo file or no token — try localStorage
    loadFromLocal();
    if (!ghToken()) setSyncStatus('warn', '⚠️ No token — data saved locally only');
    else setSyncStatus('ok', '✅ GitHub connected (no data yet)');
  }
  populateIssueCategories();
  renderAll();
  startClock();
}

function loadFromLocal() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    records = saved ? JSON.parse(saved) : [];
    if (!Array.isArray(records)) records = [];
  } catch(e) { records = []; localStorage.removeItem(STORAGE_KEY); }
}

let _saveTimer = null;
function save() {
  // always write localStorage immediately
  try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch(e) {}
  // debounce GitHub save by 1.5s to avoid hammering API on rapid changes
  clearTimeout(_saveTimer);
  _saveTimer = setTimeout(async () => {
    if (!ghToken()) return;
    setSyncStatus('loading', '⏳ Saving…');
    const ok = await ghSave(records);
    setSyncStatus(ok ? 'ok' : 'warn', ok ? '✅ Saved to GitHub' : '⚠️ GitHub save failed — data in localStorage');
  }, 1500);
}

function setSyncStatus(type, msg) {
  const el = document.getElementById('sync-status');
  if (!el) return;
  el.textContent = msg;
  el.className = 'sync-status sync-' + type;
}

// ── Settings modal ──────────────────────────────────────
function openSettings() {
  document.getElementById('gh-token-input').value = ghToken();
  document.getElementById('settings-msg').textContent = '';
  document.getElementById('settings-modal').classList.add('open');
}
function closeSettings() { document.getElementById('settings-modal').classList.remove('open'); }
async function testAndSaveToken() {
  const t = document.getElementById('gh-token-input').value.trim();
  const msg = document.getElementById('settings-msg');
  if (!t) { msg.textContent = '❌ Token cannot be empty.'; msg.style.color='#c62828'; return; }
  msg.textContent = '⏳ Testing token…'; msg.style.color='#555';
  setGhToken(t);
  const data = await ghLoad();
  if (data === null) {
    msg.textContent = '❌ Connection failed. Check token and network.'; msg.style.color='#c62828';
  } else {
    msg.textContent = '✅ Connected! Reloading data…'; msg.style.color='#2e7d32';
    if (data.length > 0) { records = data; try { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); } catch(e){} }
    setTimeout(() => { closeSettings(); renderAll(); setSyncStatus('ok', '✅ Synced with GitHub'); }, 800);
  }
}
  'Camera Issue':              ['RTSP URL not working','Incorrect configuration','Time Sync Issue','Camera login Issue','Camera not working','Feed Fluctuations'],
  'NAS/DVR/NVR Related Issue': ['NAS/DVR/NVR Login Issue','Incorrect configuration','Time sync issue','Not Working'],
  'Internet Issue':            ['TCSiON URL not accessible','Slow internet speed','Internet Down from ISP','Connectivity Issue'],
  'IP Related Issue':          ['Camera IP change issue','NVR/DVR IP change issue','Proxy System IP Change'],
  'Proxy System Issue':        ['HDD crash issue','MBD issue','100% CPU/RAM utilization issue','LAN Cable issue','Time sync issue','OS crash issue','Restarted Proxy System','Firewall Enabled','MAC ID Changed','System Hanged'],
  'Encode Related Issue':      ['Camera Encode Not Supported','NVR/DVR Encode Not Supported','Camera Encode Changed','NVR/DVR Encode Changed','Encode Changed in Camera & NVR/DVR'],
  'Power Issue':               ['UPS Power Issue','Raw Power Issue','DG Power Issue','Camera Power Supply Issue','Network Switch Power Supply Issue','Proxy System Power Supply Issue'],
  'Operational Issue':         ['CCTV spoc not available for trouble shooting','No response from the Test Center','CMDB data not received','Incorrect CMDB','Camera Not Added','Proxy System Not Started','Blind Spot','Knowledge Gap','Landscape not done'],
  'iCamera Application Issue': ['iCamera service not starting Issue','iCamera application corrupt Issue','iCamera Proxy Up feeds not visible','MAC ID Changed','Service Restarted','Delay in Going Live (Unidentified Issue)'],
  'Network Related Issue':     ['Connection Issue','Ping Issue','LAN Cable issue','POE Switch Port Issue'],
  'SOE Related Issues':        ['Zscalar login issue','SOE OS installation issue','User admin Rights issue','SOE Credential not available'],
};

// CSV template columns matching the real Excel template
const CSV_COLUMNS = ['Zone','State','City','TC Type','TC Code','TC Name','Assigned To','Candidate Count','Shift'];

let records = [];
let editingKey = null;
let pendingUpload = [];
let issueTcKey = null;

// drill state per tab: { examDate, client, post, shift }
const drill = { d: {}, s: {} };

function startClock() {
  const el = document.getElementById('live-clock');
  const tick = () => { el.textContent = new Date().toLocaleString(); };
  tick(); setInterval(tick, 1000);
}

function tcKey(r) { return `${r.tcCode}|${r.examDate}|${r.client}|${r.post}|${r.shift}`; }
function labelOf(s) { return s === 'partial' ? 'Partial Live' : s.charAt(0).toUpperCase() + s.slice(1); }
function now() { return new Date().toLocaleString('en-IN', { day:'2-digit', month:'short', year:'numeric', hour:'2-digit', minute:'2-digit', second:'2-digit', hour12:true }); }

// ── Activity log ───────────────────────────────────────────
function addLog(r, type, detail) {
  if (!r.log) r.log = [];
  r.log.unshift({ type, detail, time: now() }); // newest first
}

// ── Tab switching ──────────────────────────────────────────
function switchTab(name, btn) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  btn.classList.add('active');
  renderAll();
}

function renderAll() {
  renderDrill('d');
  renderDrill('s');
  renderRecords();
}

// ── Drill-down engine (shared for Dashboard 'd' and Status 's') ──
function drillInto(prefix, level, value) {
  drill[prefix][level] = value;
  const order = ['examDate','client','post','shift','assignedTo'];
  const idx = order.indexOf(level);
  order.slice(idx + 1).forEach(l => delete drill[prefix][l]);
  renderDrill(prefix);
}

function drillBack(prefix, toLevel) {
  const order = ['examDate','client','post','shift','assignedTo'];
  const idx = toLevel === 'root' ? 0 : order.indexOf(toLevel) + 1;
  order.slice(idx).forEach(l => delete drill[prefix][l]);
  if (toLevel === 'root') drill[prefix] = {};
  renderDrill(prefix);
}

function filteredByDrill(prefix) {
  const d = drill[prefix];
  return records.filter(r =>
    (!d.examDate   || r.examDate   === d.examDate) &&
    (!d.client     || r.client     === d.client)   &&
    (!d.post       || r.post       === d.post)     &&
    (!d.shift      || r.shift      === d.shift)    &&
    (!d.assignedTo || d.assignedTo === '__ALL__' || r.assignedTo === d.assignedTo)
  );
}

function renderDrill(prefix) {
  const d = drill[prefix];
  const bcEl   = document.getElementById(`${prefix}-breadcrumb`);
  const drillEl = document.getElementById(`${prefix}-drill`);
  const isStatus = prefix === 's';

  // ── Breadcrumb ──
  const crumbs = [{ label: '📅 All Dates', level: 'root' }];
  if (d.examDate)   crumbs.push({ label: d.examDate,  level: 'examDate' });
  if (d.client)     crumbs.push({ label: d.client,    level: 'client' });
  if (d.post)       crumbs.push({ label: d.post,      level: 'post' });
  if (d.shift)      crumbs.push({ label: d.shift,     level: 'shift' });
  if (d.assignedTo) crumbs.push({ label: d.assignedTo === '__ALL__' ? '👑 Admin View' : '👤 ' + d.assignedTo, level: 'assignedTo' });

  bcEl.innerHTML = crumbs.map((c, i) => {
    const isLast = i === crumbs.length - 1;
    return isLast
      ? `<span class="bc-item bc-active">${c.label}</span>`
      : `<span class="bc-item bc-link" onclick="drillBack('${prefix}','${c.level}')">${c.label}</span><span class="bc-sep">›</span>`;
  }).join('');

  // ── Determine what level to show next ──
  const base = filteredByDrill(prefix);

  if (!d.examDate) {
    const dates = [...new Set(records.map(r => r.examDate).filter(Boolean))].sort();
    if (!dates.length) { drillEl.innerHTML = '<p class="no-data">No data uploaded yet. Go to Upload tab to add TC data.</p>'; return; }
    drillEl.innerHTML = buildSummaryCards(prefix, 'examDate', dates, records, 'examDate');
    return;
  }
  // base is already filtered by examDate at this point
  if (!d.client) {
    const vals = [...new Set(base.map(r => r.client).filter(Boolean))].sort();
    drillEl.innerHTML = buildSummaryCards(prefix, 'client', vals, base, 'client');
    return;
  }
  if (!d.post) {
    const vals = [...new Set(base.map(r => r.post).filter(Boolean))].sort();
    drillEl.innerHTML = buildSummaryCards(prefix, 'post', vals, base, 'post');
    return;
  }
  if (!d.shift) {
    const vals = [...new Set(base.map(r => r.shift).filter(Boolean))].sort();
    drillEl.innerHTML = buildSummaryCards(prefix, 'shift', vals, base, 'shift');
    return;
  }

  // ── Shift level: show Assigned To cards ──
  if (!d.assignedTo) {
    drillEl.innerHTML = buildAssignedToCards(prefix, base);
    return;
  }

  // ── Assigned To level: show TC table ──
  const finalList = d.assignedTo === '__ALL__' ? base : base.filter(r => r.assignedTo === d.assignedTo);
  if (isStatus) {
    drillEl.innerHTML = buildStatusTable(finalList);
  } else {
    drillEl.innerHTML = buildDashboardView(finalList);
  }
}

function buildAssignedToCards(prefix, base) {
  const people = [...new Set(base.map(r => r.assignedTo).filter(Boolean))].sort();
  let html = `<div class="section-title">Assigned To</div><div class="drill-grid">`;

  // Admin consolidated card
  const live = base.filter(r => r.status==='live').length;
  const partial = base.filter(r => r.status==='partial').length;
  const offline = base.filter(r => r.status==='offline').length;
  html += `<div class="drill-card admin-card" onclick="drillInto('${prefix}','assignedTo','__ALL__')">
    <div class="drill-card-title">👑 Admin View <span class="admin-badge">All</span></div>
    <div class="drill-card-stats">
      <span class="ds live">🟢 ${live}</span>
      <span class="ds partial">🟡 ${partial}</span>
      <span class="ds offline">🔴 ${offline}</span>
    </div>
    <div class="drill-card-total">${base.length} TCs — Consolidated</div>
  </div>`;

  people.forEach(p => {
    const sub = base.filter(r => r.assignedTo === p);
    const l = sub.filter(r => r.status==='live').length;
    const pl = sub.filter(r => r.status==='partial').length;
    const of = sub.filter(r => r.status==='offline').length;
    const safe = p.replace(/'/g,"\\'");
    html += `<div class="drill-card" onclick="drillInto('${prefix}','assignedTo','${safe}')">
      <div class="drill-card-title">👤 ${p}</div>
      <div class="drill-card-stats">
        <span class="ds live">🟢 ${l}</span>
        <span class="ds partial">🟡 ${pl}</span>
        <span class="ds offline">🔴 ${of}</span>
      </div>
      <div class="drill-card-total">${sub.length} TCs</div>
    </div>`;
  });
  html += '</div>';
  return html;
}

function buildSummaryCards(prefix, level, vals, allBase, field) {
  const levelLabels = { examDate: 'Exam Date', client: 'Client', post: 'Post', shift: 'Shift' };
  let html = `<div class="section-title">${levelLabels[level]}</div><div class="drill-grid">`;
  vals.forEach(v => {
    const subset = allBase.filter(r => r[field] === v);
    const live    = subset.filter(r => r.status === 'live').length;
    const partial = subset.filter(r => r.status === 'partial').length;
    const offline = subset.filter(r => r.status === 'offline').length;
    html += `
      <div class="drill-card" onclick="drillInto('${prefix}','${level}','${v.replace(/'/g,"\\'")}')">
        <div class="drill-card-title">${v}</div>
        <div class="drill-card-stats">
          <span class="ds live">🟢 ${live}</span>
          <span class="ds partial">🟡 ${partial}</span>
          <span class="ds offline">🔴 ${offline}</span>
        </div>
        <div class="drill-card-total">${subset.length} TCs</div>
      </div>`;
  });
  html += '</div>';
  return html;
}

function buildDashboardView(list) {
  const live    = list.filter(r => r.status === 'live').length;
  const partial = list.filter(r => r.status === 'partial').length;
  const offline = list.filter(r => r.status === 'offline').length;

  // summary cards
  let html = `<div class="summary">
    <div class="card live"><span>${live}</span><p>Live</p></div>
    <div class="card partial"><span>${partial}</span><p>Partial Live</p></div>
    <div class="card offline"><span>${offline}</span><p>Offline</p></div>
    <div class="card total"><span>${list.length}</span><p>Total TCs</p></div>
  </div>`;

  // zone table
  const zones = {};
  list.forEach(r => {
    if (!zones[r.zone]) zones[r.zone] = { live:0, partial:0, offline:0 };
    zones[r.zone][r.status]++;
  });
  html += `<div class="section-title">Zone-wise Summary</div>
  <div class="table-wrap"><table>
    <thead><tr><th>Zone</th><th>Live</th><th>Partial Live</th><th>Offline</th><th>Total</th></tr></thead>
    <tbody>`;
  Object.entries(zones).forEach(([z, c]) => {
    html += `<tr><td>${z}</td>
      <td><span class="badge live">${c.live}</span></td>
      <td><span class="badge partial">${c.partial}</span></td>
      <td><span class="badge offline">${c.offline}</span></td>
      <td>${c.live + c.partial + c.offline}</td></tr>`;
  });
  html += '</tbody></table></div>';
  return html;
}

function buildStatusTable(list) {
  // search + filter toolbar (inline, not persistent)
  let html = `<div class="toolbar" style="margin-bottom:12px">
    <input id="st-search" type="text" placeholder="Search TC Code, Name, City…" oninput="filterStatusTable()" />
    <select id="st-filter" onchange="filterStatusTable()">
      <option value="all">All Status</option>
      <option value="live">Live</option>
      <option value="partial">Partial Live</option>
      <option value="offline">Offline</option>
    </select>
  </div>
  <div class="table-wrap" id="st-table-wrap">`;
  html += renderStatusRows(list);
  html += '</div>';
  // store current list for filter
  window._statusList = list;
  return html;
}

function filterStatusTable() {
  const q = (document.getElementById('st-search')?.value || '').toLowerCase();
  const f = document.getElementById('st-filter')?.value || 'all';
  const list = (window._statusList || []).filter(r =>
    (f === 'all' || r.status === f) &&
    (!q || Object.values(r).some(v => String(v).toLowerCase().includes(q)))
  );
  const wrap = document.getElementById('st-table-wrap');
  if (wrap) wrap.innerHTML = renderStatusRows(list);
}

function renderStatusRows(list) {
  if (!list.length) return '<p class="no-data">No records found.</p>';
  let html = `<table><thead><tr>
    <th>TC Code</th><th>TC Name</th><th>Zone</th><th>City</th><th>State</th>
    <th>TC Type</th><th>Assigned To</th><th>Candidates</th>
    <th>Status</th><th>Change Status</th><th>Remarks</th><th>Issue</th><th>Timeline</th>
  </tr></thead><tbody>`;
  list.forEach(r => {
    const key = tcKey(r);
    const issueHtml = r.issue
      ? `<span class="issue-tag" title="${r.issue.category}: ${r.issue.sub || ''}" onclick="openIssue('${key}')" style="cursor:pointer">${r.issue.category}</span>`
      : `<button class="btn-issue btn-sm" onclick="openIssue('${key}')">+ Issue</button>`;
    const safeRemarks = (r.remarks || '').replace(/"/g, '&quot;').replace(/</g,'&lt;');
    const logCount = (r.log || []).length;
    const tlBadge = logCount ? `<span class="tl-count">${logCount}</span>` : '';
    html += `<tr>
      <td>${r.tcCode}</td><td>${r.tcName}</td><td>${r.zone}</td>
      <td>${r.city}</td><td>${r.state}</td><td>${r.tcType || ''}</td>
      <td>${r.assignedTo || ''}</td><td>${r.candidateCount || ''}</td>
      <td><span class="badge ${r.status}">${labelOf(r.status)}</span></td>
      <td><select class="status-select" onchange="updateStatus('${key}',this.value)">
        <option value="live"    ${r.status==='live'    ?'selected':''}>Live</option>
        <option value="partial" ${r.status==='partial' ?'selected':''}>Partial Live</option>
        <option value="offline" ${r.status==='offline' ?'selected':''}>Offline</option>
      </select></td>
      <td><input class="remarks-input" value="${safeRemarks}" placeholder="Add remarks…"
           onblur="saveRemarks('${key}',this.value)" /></td>
      <td>${issueHtml}</td>
      <td><button class="btn-tl btn-sm" onclick="openTimeline('${key}')" title="View Timeline">🕐${tlBadge}</button></td>
    </tr>`;
  });
  html += '</tbody></table>';
  return html;
}

// ── Timeline Modal ─────────────────────────────────────────
function openTimeline(key) {
  const r = records.find(x => tcKey(x) === key);
  if (!r) return;
  document.getElementById('tl-title').textContent = `${r.tcCode} — ${r.tcName}`;
  const log = r.log || [];
  const body = document.getElementById('tl-body');
  if (!log.length) {
    body.innerHTML = '<p class="no-data" style="padding:20px">No activity recorded yet.</p>';
  } else {
    body.innerHTML = log.map((e, i) => {
      const icon = e.type === 'status' ? '🔄' : e.type === 'issue' ? '⚠️' : '📝';
      const cls  = e.type === 'status' ? 'tl-status' : e.type === 'issue' ? 'tl-issue' : 'tl-remarks';
      return `<div class="tl-item ${i === 0 ? 'tl-latest' : ''}">
        <div class="tl-dot ${cls}"></div>
        <div class="tl-content">
          <div class="tl-detail">${icon} ${e.detail}</div>
          <div class="tl-time">${e.time}</div>
        </div>
      </div>`;
    }).join('');
  }
  document.getElementById('tl-modal').classList.add('open');
}

function closeTimeline() { document.getElementById('tl-modal').classList.remove('open'); }

function saveRemarks(key, val) {
  const r = records.find(x => tcKey(x) === key);
  if (!r) return;
  const trimmed = val.trim();
  if (trimmed === (r.remarks || '').trim()) return; // no change
  r.remarks = trimmed;
  if (trimmed) addLog(r, 'remarks', `Remarks updated: "${trimmed}"`);
  save();
}

function updateStatus(key, val) {
  const r = records.find(x => tcKey(x) === key);
  if (!r) return;
  const prev = r.status;
  r.status = val;
  addLog(r, 'status', `Status changed: ${labelOf(prev)} → ${labelOf(val)}`);
  save();
  const idx = (window._statusList || []).findIndex(x => tcKey(x) === key);
  if (idx >= 0) window._statusList[idx] = r;
  const wrap = document.getElementById('st-table-wrap');
  if (wrap) wrap.innerHTML = renderStatusRows(window._statusList || []);
}

// ── Records tab ────────────────────────────────────────────
function renderRecords() {
  const q = (document.getElementById('r-search')?.value || '').toLowerCase();
  let list = q ? records.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q))) : [...records];

  document.getElementById('rec-tbody').innerHTML = list.length
    ? list.map(r => `<tr>
        <td>${r.tcCode}</td><td>${r.tcName}</td><td>${r.zone}</td>
        <td>${r.city}</td><td>${r.state}</td><td>${r.tcType || ''}</td>
        <td>${r.assignedTo || ''}</td><td>${r.candidateCount || ''}</td>
        <td>${r.shift || ''}</td><td>${r.client || ''}</td><td>${r.post || ''}</td><td>${r.examDate || ''}</td>
        <td><span class="badge ${r.status}">${labelOf(r.status)}</span></td>
        <td>
          <button class="btn-primary btn-sm" onclick="openEdit('${tcKey(r)}')">Edit</button>
          <button class="btn-danger btn-sm" onclick="deleteRecord('${tcKey(r)}')">Delete</button>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="14" class="no-data">No records found.</td></tr>';
}

// ── Add/Edit Modal ─────────────────────────────────────────
function openAdd() {
  editingKey = null;
  document.getElementById('modal-title').textContent = 'Add TC';
  document.getElementById('tc-form').reset();
  document.getElementById('tcCode').disabled = false;
  document.getElementById('modal').classList.add('open');
}

function openEdit(key) {
  editingKey = key;
  const r = records.find(x => tcKey(x) === key);
  document.getElementById('modal-title').textContent = 'Edit TC';
  ['tcCode','tcName','zone','state','city','tcType','assignedTo','candidateCount','examDate','client','post','shift','status']
    .forEach(f => { const el = document.getElementById(f); if (el) el.value = r[f] || ''; });
  document.getElementById('tcCode').disabled = true;
  document.getElementById('modal').classList.add('open');
}

function closeModal() { document.getElementById('modal').classList.remove('open'); }

document.getElementById('tc-form').addEventListener('submit', e => {
  e.preventDefault();
  const data = {
    tcCode:         document.getElementById('tcCode').value.trim(),
    tcName:         document.getElementById('tcName').value.trim(),
    zone:           document.getElementById('zone').value.trim(),
    state:          document.getElementById('state').value.trim(),
    city:           document.getElementById('city').value.trim(),
    tcType:         document.getElementById('tcType').value.trim(),
    assignedTo:     document.getElementById('assignedTo').value.trim(),
    candidateCount: document.getElementById('candidateCount').value.trim(),
    examDate:       document.getElementById('examDate').value,
    client:         document.getElementById('client').value.trim(),
    post:           document.getElementById('post').value.trim(),
    shift:          document.getElementById('shift').value,
    status:         document.getElementById('status').value,
  };
  if (!editingKey) {
    if (records.find(r => tcKey(r) === tcKey(data))) { alert('TC already exists for this Exam/Client/Post/Shift!'); return; }
    records.push(data);
  } else {
    const idx = records.findIndex(r => tcKey(r) === editingKey);
    records[idx] = { ...records[idx], ...data };
  }
  save(); closeModal(); renderAll();
});

function deleteRecord(key) {
  if (!confirm('Delete this TC record?')) return;
  records = records.filter(r => tcKey(r) !== key);
  save(); renderAll();
}

// ── Issue Modal ────────────────────────────────────────────
function populateIssueCategories() {
  document.getElementById('issue-cat').innerHTML =
    '<option value="">Select Category</option>' +
    Object.keys(ISSUE_CATEGORIES).map(c => `<option value="${c}">${c}</option>`).join('');
}

function renderSubIssues() {
  const cat = document.getElementById('issue-cat').value;
  document.getElementById('issue-sub').innerHTML =
    '<option value="">Select Sub Issue</option>' +
    (ISSUE_CATEGORIES[cat] || []).map(s => `<option value="${s}">${s}</option>`).join('');
}

function openIssue(key) {
  issueTcKey = key;
  const r = records.find(x => tcKey(x) === key);
  document.getElementById('issue-tc-label').textContent = `${r.tcCode} — ${r.tcName}`;
  document.getElementById('issue-cat').value = r.issue?.category || '';
  renderSubIssues();
  document.getElementById('issue-sub').value = r.issue?.sub || '';
  document.getElementById('issue-remarks').value = r.issue?.remarks || '';
  document.getElementById('issue-modal').classList.add('open');
}

function closeIssueModal() { document.getElementById('issue-modal').classList.remove('open'); }

function saveIssue() {
  const r = records.find(x => tcKey(x) === issueTcKey);
  if (!r) return;
  const cat = document.getElementById('issue-cat').value;
  const sub = document.getElementById('issue-sub').value;
  const rem = document.getElementById('issue-remarks').value.trim();
  r.issue = { category: cat, sub, remarks: rem, time: now() };
  addLog(r, 'issue', `Issue logged: ${cat}${sub ? ' › ' + sub : ''}${rem ? ' — ' + rem : ''}`);
  save(); closeIssueModal(); renderAll();
}

// ── Upload ─────────────────────────────────────────────────
const fileInput = document.getElementById('file-input');
const dropZone  = document.getElementById('drop-zone');

fileInput.addEventListener('change', e => handleFile(e.target.files[0]));
dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => { e.preventDefault(); dropZone.classList.remove('dragover'); handleFile(e.dataTransfer.files[0]); });

function handleFile(file) {
  if (!file) return;
  const examDate = document.getElementById('up-exam').value;
  const client   = document.getElementById('up-client').value.trim();
  const post     = document.getElementById('up-post').value.trim();
  if (!examDate || !client || !post) { alert('Please fill Exam Date, Client and Post before uploading.'); return; }

  const reader = new FileReader();
  reader.onload = e => {
    try {
      const rows = file.name.endsWith('.csv') ? parseCSV(e.target.result) : JSON.parse(e.target.result);
      pendingUpload = rows.map(r => enrichRow(r, examDate, client, post));
      showPreview(file.name);
    } catch { alert('Invalid file format. Please use CSV or JSON.'); }
  };
  reader.readAsText(file);
}

function parseCSV(text) {
  // RFC-4180 compliant parser — handles quoted fields with commas inside
  const lines = text.trim().split(/\r?\n/);
  const keys  = splitCSVLine(lines[0]);
  return lines.slice(1).filter(l => l.trim()).map(line => {
    const vals = splitCSVLine(line);
    return Object.fromEntries(keys.map((k, i) => [k, vals[i] !== undefined ? vals[i] : '']));
  });
}

function splitCSVLine(line) {
  const result = [];
  let cur = '', inQ = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQ && line[i+1] === '"') { cur += '"'; i++; }
      else inQ = !inQ;
    } else if (ch === ',' && !inQ) {
      result.push(cur.trim()); cur = '';
    } else cur += ch;
  }
  result.push(cur.trim());
  return result;
}

function enrichRow(r, examDate, client, post) {
  return {
    tcCode:         String(r['TC Code']         || r.tcCode         || '').trim(),
    tcName:         String(r['TC Name']          || r.tcName         || '').trim(),
    zone:           String(r['Zone']             || r.zone           || '').trim(),
    state:          String(r['State']            || r.state          || '').trim(),
    city:           String(r['City']             || r.city           || '').trim(),
    tcType:         String(r['TC Type']          || r.tcType         || '').trim(),
    assignedTo:     String(r['Assigned To']      || r.assignedTo     || '').trim(),
    candidateCount: String(r['Candidate Count']  || r.candidateCount || '').trim(),
    shift:          String(r['Shift']            || r.shift          || 'Shift 1').trim(),
    examDate, client, post,
    status: r.status || 'offline',
  };
}

function showPreview(name) {
  document.getElementById('upload-info').textContent = `File: ${name} — ${pendingUpload.length} records`;
  document.getElementById('preview-tbody').innerHTML = pendingUpload.map(r =>
    `<tr><td>${r.shift}</td><td>${r.tcCode}</td><td>${r.tcName}</td><td>${r.zone}</td><td>${r.city}</td><td>${r.state}</td><td>${r.tcType}</td><td>${r.assignedTo}</td><td>${r.candidateCount}</td></tr>`
  ).join('');
  document.getElementById('upload-preview').classList.remove('hidden');
}

function confirmUpload() {
  let added = 0, updated = 0;
  pendingUpload.forEach(r => {
    if (!r.tcCode) return;
    const key = tcKey(r);
    const idx = records.findIndex(x => tcKey(x) === key);
    if (idx >= 0) { records[idx] = { ...records[idx], ...r }; updated++; }
    else { records.push(r); added++; }
  });
  save(); cancelUpload(); renderAll();
  alert(`Import complete: ${added} added, ${updated} updated.`);
}

function cancelUpload() {
  pendingUpload = [];
  document.getElementById('upload-preview').classList.add('hidden');
  document.getElementById('upload-info').textContent = '';
  document.getElementById('preview-tbody').innerHTML = '';
  fileInput.value = '';
}

// ── Download template — exact columns from Excel template ──
function downloadTemplate(type) {
  const sample = [
    { Zone:'East 1', State:'Bihar', City:'Bhagalpur', 'TC Type':'iDZ', 'TC Code':'9286', 'TC Name':'iON Digital Zone iDZ Bhagalpur', 'Assigned To':'Md. Haqique', 'Candidate Count':'465', Shift:'Shift 1' },
    { Zone:'East 1', State:'Bihar', City:'Gaya',      'TC Type':'LISP','TC Code':'33901','TC Name':'Shree Ganesh Innovative',          'Assigned To':'Md. Haqique', 'Candidate Count':'260', Shift:'Shift 1' },
    { Zone:'East 1', State:'Bihar', City:'Patna',     'TC Type':'iDZ', 'TC Code':'9000', 'TC Name':'iON Digital Zone iDZ Sandalpur',   'Assigned To':'Md. Haqique', 'Candidate Count':'470', Shift:'Shift 2' },
  ];
  let content, mime, ext;
  if (type === 'json') {
    content = JSON.stringify(sample, null, 2); mime = 'application/json'; ext = 'json';
  } else {
    content = CSV_COLUMNS.join(',') + '\n' +
      sample.map(r => CSV_COLUMNS.map(k => `"${(r[k]||'').toString().replace(/"/g,'""')}"`).join(',')).join('\n');
    mime = 'text/csv'; ext = 'csv';
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = `tc_template.${ext}`; a.click();
}

init();
