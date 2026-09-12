const STORAGE_KEY = 'ion_tc_data';

// Issue categories from template Dropdown sheet
const ISSUE_CATEGORIES = {
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

let records = [];
let editingCode = null;
let pendingUpload = [];
let issueTcKey = null; // composite key: tcCode|examDate|client|post|shift

// ── Init ───────────────────────────────────────────────────
function init() {
  const saved = localStorage.getItem(STORAGE_KEY);
  records = saved ? JSON.parse(saved) : [];
  populateIssueCategories();
  populateAllHierarchies();
  renderAll();
  startClock();
}

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); }

function startClock() {
  const el = document.getElementById('live-clock');
  const tick = () => { el.textContent = new Date().toLocaleString(); };
  tick(); setInterval(tick, 1000);
}

// ── Unique key for a TC record ─────────────────────────────
function tcKey(r) { return `${r.tcCode}|${r.examDate}|${r.client}|${r.post}|${r.shift}`; }

// ── Hierarchy helpers ──────────────────────────────────────
function uniqueVals(field) {
  return [...new Set(records.map(r => r[field]).filter(Boolean))].sort();
}

function populateSelect(id, values, placeholder) {
  const el = document.getElementById(id);
  const cur = el.value;
  el.innerHTML = `<option value="">${placeholder}</option>` +
    values.map(v => `<option value="${v}"${v===cur?' selected':''}>${v}</option>`).join('');
}

function populateAllHierarchies() {
  ['d','s','r'].forEach(p => {
    populateSelect(`${p}-exam`,   uniqueVals('examDate'), 'All Exam Dates');
    populateSelect(`${p}-client`, uniqueVals('client'),   'All Clients');
    populateSelect(`${p}-post`,   uniqueVals('post'),     'All Posts');
    populateSelect(`${p}-shift`,  uniqueVals('shift'),    'All Shifts');
  });
}

function getHierFilter(prefix) {
  return {
    examDate: document.getElementById(`${prefix}-exam`).value,
    client:   document.getElementById(`${prefix}-client`).value,
    post:     document.getElementById(`${prefix}-post`).value,
    shift:    document.getElementById(`${prefix}-shift`).value,
  };
}

function applyHier(list, f) {
  return list.filter(r =>
    (!f.examDate || r.examDate === f.examDate) &&
    (!f.client   || r.client   === f.client)   &&
    (!f.post     || r.post     === f.post)     &&
    (!f.shift    || r.shift    === f.shift)
  );
}

function onHierChange(prefix) {
  if (prefix === 'd') renderDashboard();
  if (prefix === 's') renderStatus();
  if (prefix === 'r') renderRecords();
}

// ── Tab switching ──────────────────────────────────────────
function switchTab(name, btn) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  btn.classList.add('active');
  renderAll();
}

function filterStatusTab(status) {
  document.querySelectorAll('.tab')[1].click();
  document.getElementById('s-filter').value = status;
  renderStatus();
}

function renderAll() {
  populateAllHierarchies();
  renderDashboard();
  renderStatus();
  renderRecords();
}

// ── Dashboard ──────────────────────────────────────────────
function renderDashboard() {
  const filtered = applyHier(records, getHierFilter('d'));
  ['live','partial','offline'].forEach(s =>
    document.getElementById('count-'+s).textContent = filtered.filter(r => r.status===s).length
  );
  document.getElementById('count-total').textContent = filtered.length;

  const zones = {};
  filtered.forEach(r => {
    if (!zones[r.zone]) zones[r.zone] = {live:0,partial:0,offline:0};
    zones[r.zone][r.status]++;
  });
  document.getElementById('zone-tbody').innerHTML = Object.entries(zones).map(([z,c]) =>
    `<tr><td>${z}</td><td><span class="badge live">${c.live}</span></td><td><span class="badge partial">${c.partial}</span></td><td><span class="badge offline">${c.offline}</span></td><td>${c.live+c.partial+c.offline}</td></tr>`
  ).join('') || '<tr><td colspan="5" class="no-data">No data.</td></tr>';
}

// ── Status tab ─────────────────────────────────────────────
function renderStatus() {
  const q = (document.getElementById('s-search').value||'').toLowerCase();
  const f = document.getElementById('s-filter').value;
  let list = applyHier(records, getHierFilter('s'));
  list = list.filter(r =>
    (f==='all' || r.status===f) &&
    (!q || Object.values(r).some(v => String(v).toLowerCase().includes(q)))
  );

  document.getElementById('status-tbody').innerHTML = list.length
    ? list.map(r => {
        const key = tcKey(r);
        const issueHtml = r.issue
          ? `<span class="issue-tag" title="${r.issue.category}: ${r.issue.sub||''}">${r.issue.category}</span>`
          : `<button class="btn-issue btn-sm" onclick="openIssue('${key}')">+ Issue</button>`;
        return `<tr>
          <td>${r.tcCode}</td><td>${r.tcName}</td><td>${r.zone}</td>
          <td>${r.city}</td><td>${r.state}</td><td>${r.tcType||''}</td>
          <td>${r.assignedTo||''}</td><td>${r.candidateCount||''}</td><td>${r.shift||''}</td>
          <td><span class="badge ${r.status}">${labelOf(r.status)}</span></td>
          <td><select class="status-select" onchange="updateStatus('${key}',this.value)">
            <option value="live"    ${r.status==='live'    ?'selected':''}>Live</option>
            <option value="partial" ${r.status==='partial' ?'selected':''}>Partial Live</option>
            <option value="offline" ${r.status==='offline' ?'selected':''}>Offline</option>
          </select></td>
          <td>${issueHtml}</td>
        </tr>`;
      }).join('')
    : '<tr><td colspan="12" class="no-data">No records found.</td></tr>';
}

function updateStatus(key, val) {
  const r = records.find(x => tcKey(x)===key);
  if (r) { r.status = val; save(); renderAll(); }
}

// ── Records tab ────────────────────────────────────────────
function renderRecords() {
  const q = (document.getElementById('r-search').value||'').toLowerCase();
  let list = applyHier(records, getHierFilter('r'));
  if (q) list = list.filter(r => Object.values(r).some(v => String(v).toLowerCase().includes(q)));

  document.getElementById('rec-tbody').innerHTML = list.length
    ? list.map(r => `<tr>
        <td>${r.tcCode}</td><td>${r.tcName}</td><td>${r.zone}</td>
        <td>${r.city}</td><td>${r.state}</td><td>${r.tcType||''}</td>
        <td>${r.assignedTo||''}</td><td>${r.candidateCount||''}</td>
        <td>${r.shift||''}</td><td>${r.client||''}</td><td>${r.post||''}</td><td>${r.examDate||''}</td>
        <td><span class="badge ${r.status}">${labelOf(r.status)}</span></td>
        <td>
          <button class="btn-primary btn-sm" onclick="openEdit('${tcKey(r)}')">Edit</button>
          <button class="btn-danger btn-sm" onclick="deleteRecord('${tcKey(r)}')">Delete</button>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="14" class="no-data">No records found.</td></tr>';
}

function labelOf(s) {
  return s==='partial' ? 'Partial Live' : s.charAt(0).toUpperCase()+s.slice(1);
}

// ── Add/Edit Modal ─────────────────────────────────────────
function openAdd() {
  editingCode = null;
  document.getElementById('modal-title').textContent = 'Add TC';
  document.getElementById('tc-form').reset();
  document.getElementById('tcCode').disabled = false;
  document.getElementById('modal').classList.add('open');
}

function openEdit(key) {
  editingCode = key;
  const r = records.find(x => tcKey(x)===key);
  document.getElementById('modal-title').textContent = 'Edit TC';
  ['tcCode','tcName','zone','state','city','tcType','assignedTo','candidateCount','examDate','client','post','shift','status']
    .forEach(f => { const el = document.getElementById(f); if(el) el.value = r[f]||''; });
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
  if (!editingCode) {
    if (records.find(r => tcKey(r)===tcKey(data))) { alert('TC already exists for this Exam/Client/Post/Shift!'); return; }
    records.push(data);
  } else {
    const idx = records.findIndex(r => tcKey(r)===editingCode);
    records[idx] = { ...records[idx], ...data };
  }
  save(); closeModal(); renderAll();
});

function deleteRecord(key) {
  if (!confirm('Delete this TC record?')) return;
  records = records.filter(r => tcKey(r)!==key);
  save(); renderAll();
}

// ── Issue Modal ────────────────────────────────────────────
function populateIssueCategories() {
  const sel = document.getElementById('issue-cat');
  sel.innerHTML = '<option value="">Select Category</option>' +
    Object.keys(ISSUE_CATEGORIES).map(c => `<option value="${c}">${c}</option>`).join('');
}

function renderSubIssues() {
  const cat = document.getElementById('issue-cat').value;
  const subs = ISSUE_CATEGORIES[cat] || [];
  document.getElementById('issue-sub').innerHTML =
    '<option value="">Select Sub Issue</option>' +
    subs.map(s => `<option value="${s}">${s}</option>`).join('');
}

function openIssue(key) {
  issueTcKey = key;
  const r = records.find(x => tcKey(x)===key);
  document.getElementById('issue-tc-label').textContent = `${r.tcCode} — ${r.tcName}`;
  document.getElementById('issue-cat').value = '';
  document.getElementById('issue-sub').innerHTML = '<option value="">Select Sub Issue</option>';
  document.getElementById('issue-remarks').value = '';
  if (r.issue) {
    document.getElementById('issue-cat').value = r.issue.category||'';
    renderSubIssues();
    document.getElementById('issue-sub').value = r.issue.sub||'';
    document.getElementById('issue-remarks').value = r.issue.remarks||'';
  }
  document.getElementById('issue-modal').classList.add('open');
}

function closeIssueModal() { document.getElementById('issue-modal').classList.remove('open'); }

function saveIssue() {
  const r = records.find(x => tcKey(x)===issueTcKey);
  if (!r) return;
  r.issue = {
    category: document.getElementById('issue-cat').value,
    sub:      document.getElementById('issue-sub').value,
    remarks:  document.getElementById('issue-remarks').value.trim(),
    time:     new Date().toLocaleString(),
  };
  save(); closeIssueModal(); renderAll();
}

// ── Upload tab ─────────────────────────────────────────────
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
  if (file.name.endsWith('.xlsx')) {
    reader.onload = e => parseXlsx(e.target.result, examDate, client, post);
    reader.readAsArrayBuffer(file);
  } else {
    reader.onload = e => {
      try {
        const rows = file.name.endsWith('.csv') ? parseCSV(e.target.result) : JSON.parse(e.target.result);
        pendingUpload = rows.map(r => enrichRow(r, examDate, client, post, r.shift||'Shift 1'));
        showPreview(file.name);
      } catch { alert('Invalid file format.'); }
    };
    reader.readAsText(file);
  }
}

// Parse xlsx using zip + XML (no external lib needed)
function parseXlsx(buffer, examDate, client, post) {
  try {
    // Use JSZip-free approach: convert to base64 and use a simple zip reader
    // Since we can't use JSZip in static site, we'll guide user to use CSV/JSON
    alert('For Excel upload, please export the sheet as CSV first, or use the JSON template. Direct .xlsx parsing requires a library not loaded here.');
  } catch(e) { alert('Could not parse xlsx: ' + e.message); }
}

function parseCSV(text) {
  const [header, ...rows] = text.trim().split('\n');
  const keys = header.split(',').map(k => k.trim());
  return rows.filter(r=>r.trim()).map(row => {
    const vals = row.split(',').map(v => v.trim());
    return Object.fromEntries(keys.map((k,i) => [k, vals[i]||'']));
  });
}

function enrichRow(r, examDate, client, post, shift) {
  return {
    tcCode:         String(r.tcCode||r['TC Code']||r.TC_Code||'').trim(),
    tcName:         String(r.tcName||r['TC Name']||r.TC_Name||'').trim(),
    zone:           String(r.zone||r.Zone||'').trim(),
    state:          String(r.state||r.State||'').trim(),
    city:           String(r.city||r.City||'').trim(),
    tcType:         String(r.tcType||r['TC Type']||r.TC_Type||'').trim(),
    assignedTo:     String(r.assignedTo||r['Assigned To']||'').trim(),
    candidateCount: String(r.candidateCount||r['Candidate Count']||'').trim(),
    examDate, client, post,
    shift:          String(r.shift||shift).trim(),
    status:         r.status||'offline',
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
  let added=0, updated=0;
  pendingUpload.forEach(r => {
    if (!r.tcCode) return;
    const key = tcKey(r);
    const idx = records.findIndex(x => tcKey(x)===key);
    if (idx>=0) { records[idx]={...records[idx],...r}; updated++; }
    else { records.push(r); added++; }
  });
  save(); cancelUpload(); renderAll();
  alert(`Import complete: ${added} added, ${updated} updated.`);
}

function cancelUpload() {
  pendingUpload=[];
  document.getElementById('upload-preview').classList.add('hidden');
  document.getElementById('upload-info').textContent='';
  document.getElementById('preview-tbody').innerHTML='';
  fileInput.value='';
}

function downloadTemplate(type) {
  const sample = [{
    tcCode:'9286', tcName:'iON Digital Zone iDZ Bhagalpur', zone:'East 1',
    state:'Bihar', city:'Bhagalpur', tcType:'iDZ', assignedTo:'Md. Haqique',
    candidateCount:'465', shift:'Shift 1', status:'offline'
  }];
  let content, mime, ext;
  if (type==='json') {
    content=JSON.stringify(sample,null,2); mime='application/json'; ext='json';
  } else {
    const keys=Object.keys(sample[0]);
    content=keys.join(',')+'\n'+sample.map(r=>keys.map(k=>r[k]).join(',')).join('\n');
    mime='text/csv'; ext='csv';
  }
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([content],{type:mime}));
  a.download=`tc_template.${ext}`; a.click();
}

init();
