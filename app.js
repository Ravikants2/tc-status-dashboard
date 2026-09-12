const STORAGE_KEY = 'tc_data';
let records = [];
let editingCode = null;
let pendingUpload = [];

// ── Init ───────────────────────────────────────────────────
async function init() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    records = JSON.parse(saved);
  } else {
    const res = await fetch('data.json');
    records = await res.json();
    save();
  }
  renderAll();
  startClock();
}

function save() { localStorage.setItem(STORAGE_KEY, JSON.stringify(records)); }

function startClock() {
  const el = document.getElementById('live-clock');
  const tick = () => { el.textContent = new Date().toLocaleString(); };
  tick(); setInterval(tick, 1000);
}

// ── Tab switching ──────────────────────────────────────────
function switchTab(name, btn) {
  document.querySelectorAll('.tab-content').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.getElementById('tab-' + name).classList.add('active');
  btn.classList.add('active');
  renderAll();
}

function switchTabByStatus(status) {
  const btn = document.querySelectorAll('.tab')[1];
  switchTab('status', btn);
  document.getElementById('filter').value = status;
  renderStatus();
}

// ── Render all ─────────────────────────────────────────────
function renderAll() {
  renderDashboard();
  renderStatus();
  renderRecords();
}

// ── Dashboard ──────────────────────────────────────────────
function renderDashboard() {
  ['live','partial','offline'].forEach(s => {
    document.getElementById('count-' + s).textContent = records.filter(r => r.status === s).length;
  });
  document.getElementById('count-total').textContent = records.length;

  const zones = {};
  records.forEach(r => {
    if (!zones[r.zone]) zones[r.zone] = { live:0, partial:0, offline:0 };
    zones[r.zone][r.status]++;
  });

  document.getElementById('zone-tbody').innerHTML = Object.entries(zones).map(([z, c]) =>
    `<tr>
      <td>${z}</td>
      <td><span class="badge live">${c.live}</span></td>
      <td><span class="badge partial">${c.partial}</span></td>
      <td><span class="badge offline">${c.offline}</span></td>
      <td>${c.live + c.partial + c.offline}</td>
    </tr>`
  ).join('') || '<tr><td colspan="5" class="no-data">No data.</td></tr>';
}

// ── Status tab ─────────────────────────────────────────────
function renderStatus() {
  const q = (document.getElementById('search').value || '').toLowerCase();
  const f = document.getElementById('filter').value;
  const filtered = records.filter(r =>
    (f === 'all' || r.status === f) &&
    (!q || Object.values(r).some(v => v.toLowerCase().includes(q)))
  );

  document.getElementById('status-tbody').innerHTML = filtered.length
    ? filtered.map(r => `
      <tr>
        <td>${r.tcCode}</td><td>${r.tcName}</td><td>${r.zone}</td>
        <td>${r.city}</td><td>${r.state}</td>
        <td><span class="badge ${r.status}">${labelOf(r.status)}</span></td>
        <td>
          <select class="status-select" onchange="updateStatus('${r.tcCode}', this.value)">
            <option value="live"    ${r.status==='live'    ?'selected':''}>Live</option>
            <option value="partial" ${r.status==='partial' ?'selected':''}>Partial Live</option>
            <option value="offline" ${r.status==='offline' ?'selected':''}>Offline</option>
          </select>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="7" class="no-data">No records found.</td></tr>';
}

function updateStatus(code, val) {
  records.find(r => r.tcCode === code).status = val;
  save(); renderAll();
}

// ── Records tab ────────────────────────────────────────────
function renderRecords() {
  const q = (document.getElementById('rec-search').value || '').toLowerCase();
  const filtered = records.filter(r =>
    !q || Object.values(r).some(v => v.toLowerCase().includes(q))
  );

  document.getElementById('rec-tbody').innerHTML = filtered.length
    ? filtered.map(r => `
      <tr>
        <td>${r.tcCode}</td><td>${r.tcName}</td><td>${r.zone}</td>
        <td>${r.city}</td><td>${r.state}</td>
        <td><span class="badge ${r.status}">${labelOf(r.status)}</span></td>
        <td>
          <button class="btn-primary btn-sm" onclick="openEdit('${r.tcCode}')">Edit</button>
          <button class="btn-danger btn-sm" onclick="deleteRecord('${r.tcCode}')">Delete</button>
        </td>
      </tr>`).join('')
    : '<tr><td colspan="7" class="no-data">No records found.</td></tr>';
}

function labelOf(s) {
  return s === 'partial' ? 'Partial Live' : s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Modal ──────────────────────────────────────────────────
function openAdd() {
  editingCode = null;
  document.getElementById('modal-title').textContent = 'Add TC';
  document.getElementById('tc-form').reset();
  document.getElementById('tcCode').disabled = false;
  document.getElementById('modal').classList.add('open');
}

function openEdit(code) {
  editingCode = code;
  const r = records.find(x => x.tcCode === code);
  document.getElementById('modal-title').textContent = 'Edit TC';
  ['tcCode','tcName','zone','city','state','status'].forEach(f => {
    document.getElementById(f).value = r[f];
  });
  document.getElementById('tcCode').disabled = true;
  document.getElementById('modal').classList.add('open');
}

function closeModal() { document.getElementById('modal').classList.remove('open'); }

document.getElementById('tc-form').addEventListener('submit', e => {
  e.preventDefault();
  const data = {
    tcCode : document.getElementById('tcCode').value.trim().toUpperCase(),
    tcName : document.getElementById('tcName').value.trim(),
    zone   : document.getElementById('zone').value.trim(),
    city   : document.getElementById('city').value.trim(),
    state  : document.getElementById('state').value.trim(),
    status : document.getElementById('status').value,
  };
  if (!editingCode) {
    if (records.find(r => r.tcCode === data.tcCode)) { alert('TC Code already exists!'); return; }
    records.push(data);
  } else {
    const idx = records.findIndex(r => r.tcCode === editingCode);
    records[idx] = { ...records[idx], ...data };
  }
  save(); closeModal(); renderAll();
});

function deleteRecord(code) {
  if (!confirm(`Delete TC ${code}?`)) return;
  records = records.filter(r => r.tcCode !== code);
  save(); renderAll();
}

// ── Upload tab ─────────────────────────────────────────────
const fileInput = document.getElementById('file-input');
const dropZone  = document.getElementById('drop-zone');

fileInput.addEventListener('change', e => handleFile(e.target.files[0]));

dropZone.addEventListener('dragover', e => { e.preventDefault(); dropZone.classList.add('dragover'); });
dropZone.addEventListener('dragleave', () => dropZone.classList.remove('dragover'));
dropZone.addEventListener('drop', e => {
  e.preventDefault(); dropZone.classList.remove('dragover');
  handleFile(e.dataTransfer.files[0]);
});

function handleFile(file) {
  if (!file) return;
  const reader = new FileReader();
  reader.onload = e => {
    try {
      pendingUpload = file.name.endsWith('.csv') ? parseCSV(e.target.result) : JSON.parse(e.target.result);
      showPreview(file.name);
    } catch { alert('Invalid file format.'); }
  };
  reader.readAsText(file);
}

function parseCSV(text) {
  const [header, ...rows] = text.trim().split('\n');
  const keys = header.split(',').map(k => k.trim());
  return rows.map(row => {
    const vals = row.split(',').map(v => v.trim());
    return Object.fromEntries(keys.map((k, i) => [k, vals[i] || '']));
  });
}

function showPreview(name) {
  document.getElementById('upload-info').textContent = `File: ${name} — ${pendingUpload.length} records found`;
  document.getElementById('preview-tbody').innerHTML = pendingUpload.map(r =>
    `<tr><td>${r.tcCode||''}</td><td>${r.tcName||''}</td><td>${r.zone||''}</td><td>${r.city||''}</td><td>${r.state||''}</td><td>${r.status||''}</td></tr>`
  ).join('');
  document.getElementById('upload-preview').classList.remove('hidden');
}

function confirmUpload() {
  let added = 0, updated = 0;
  pendingUpload.forEach(r => {
    if (!r.tcCode) return;
    r.tcCode = r.tcCode.toUpperCase();
    const idx = records.findIndex(x => x.tcCode === r.tcCode);
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

function downloadTemplate(type) {
  const sample = [{ tcCode:'TC001', tcName:'Alpha TC', zone:'North', city:'Delhi', state:'Delhi', status:'live' }];
  let content, mime, ext;
  if (type === 'json') {
    content = JSON.stringify(sample, null, 2); mime = 'application/json'; ext = 'json';
  } else {
    const keys = Object.keys(sample[0]);
    content = keys.join(',') + '\n' + sample.map(r => keys.map(k => r[k]).join(',')).join('\n');
    mime = 'text/csv'; ext = 'csv';
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([content], { type: mime }));
  a.download = `tc_template.${ext}`; a.click();
}

// ── Search listeners ───────────────────────────────────────
document.getElementById('search').addEventListener('input', renderStatus);
document.getElementById('filter').addEventListener('change', renderStatus);
document.getElementById('rec-search').addEventListener('input', renderRecords);

init();
