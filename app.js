const STORAGE_KEY = 'tc_data';

let records = [];
let editingCode = null;

// ── Bootstrap ──────────────────────────────────────────────
async function init() {
  const saved = localStorage.getItem(STORAGE_KEY);
  if (saved) {
    records = JSON.parse(saved);
  } else {
    const res = await fetch('data.json');
    records = await res.json();
    save();
  }
  render();
}

function save() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(records));
}

// ── Render ─────────────────────────────────────────────────
function render() {
  const q      = document.getElementById('search').value.toLowerCase();
  const filter = document.getElementById('filter').value;

  const filtered = records.filter(r => {
    const matchStatus = filter === 'all' || r.status === filter;
    const matchSearch = !q || Object.values(r).some(v => v.toLowerCase().includes(q));
    return matchStatus && matchSearch;
  });

  // summary counts
  ['live','partial','offline'].forEach(s => {
    document.getElementById('count-' + s).textContent =
      records.filter(r => r.status === s).length;
  });

  const tbody = document.getElementById('tbody');
  if (!filtered.length) {
    tbody.innerHTML = '<tr><td colspan="7" class="no-data">No records found.</td></tr>';
    return;
  }

  tbody.innerHTML = filtered.map(r => `
    <tr>
      <td>${r.tcCode}</td>
      <td>${r.tcName}</td>
      <td>${r.zone}</td>
      <td>${r.city}</td>
      <td>${r.state}</td>
      <td><span class="badge ${r.status}">${labelOf(r.status)}</span></td>
      <td>
        <button class="btn-primary btn-sm" onclick="openEdit('${r.tcCode}')">Edit</button>
        <button class="btn-danger btn-sm" onclick="deleteRecord('${r.tcCode}')">Delete</button>
      </td>
    </tr>`).join('');
}

function labelOf(s) {
  return s === 'partial' ? 'Partial Live' : s.charAt(0).toUpperCase() + s.slice(1);
}

// ── Modal helpers ──────────────────────────────────────────
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

function closeModal() {
  document.getElementById('modal').classList.remove('open');
}

// ── CRUD ───────────────────────────────────────────────────
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
    if (records.find(r => r.tcCode === data.tcCode)) {
      alert('TC Code already exists!');
      return;
    }
    records.push(data);
  } else {
    const idx = records.findIndex(r => r.tcCode === editingCode);
    records[idx] = { ...records[idx], ...data };
  }

  save();
  closeModal();
  render();
});

function deleteRecord(code) {
  if (!confirm(`Delete TC ${code}?`)) return;
  records = records.filter(r => r.tcCode !== code);
  save();
  render();
}

// ── Quick status toggle from table ─────────────────────────
function cycleStatus(code) {
  const order = ['live','partial','offline'];
  const r = records.find(x => x.tcCode === code);
  r.status = order[(order.indexOf(r.status) + 1) % 3];
  save();
  render();
}

// ── Wire up search / filter ────────────────────────────────
document.getElementById('search').addEventListener('input', render);
document.getElementById('filter').addEventListener('change', render);

init();
