// GitHub API Storage — saves db.json directly into the repo
// Token is stored only in localStorage (never in code)

const GH_OWNER = 'Ravikants2';
const GH_REPO  = 'tc-status-dashboard';
const GH_FILE  = 'db.json';
const GH_BRANCH = 'main';
const TOKEN_KEY = 'ion_gh_token';

let _fileSha = null; // current SHA of db.json in repo

function ghToken() { return localStorage.getItem(TOKEN_KEY) || ''; }

function setGhToken(t) { localStorage.setItem(TOKEN_KEY, t.trim()); }

function ghHeaders() {
  return {
    'Authorization': `token ${ghToken()}`,
    'Content-Type': 'application/json',
    'Accept': 'application/vnd.github.v3+json'
  };
}

// Load db.json from repo — returns parsed array or []
async function ghLoad() {
  try {
    const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_FILE}?ref=${GH_BRANCH}&t=${Date.now()}`;
    const res = await fetch(url, { headers: ghHeaders() });
    if (res.status === 404) { _fileSha = null; return []; }
    if (!res.ok) throw new Error(`GitHub load failed: ${res.status}`);
    const json = await res.json();
    _fileSha = json.sha;
    const decoded = JSON.parse(atob(json.content.replace(/\n/g, '')));
    return Array.isArray(decoded) ? decoded : [];
  } catch (e) {
    console.warn('ghLoad error:', e);
    return null; // null = network/auth error, fall back to localStorage
  }
}

// Save records array to db.json in repo
async function ghSave(records) {
  if (!ghToken()) return false;
  try {
    const content = btoa(unescape(encodeURIComponent(JSON.stringify(records, null, 2))));
    const body = {
      message: `data: update db.json [${new Date().toISOString()}]`,
      content,
      branch: GH_BRANCH,
    };
    if (_fileSha) body.sha = _fileSha;
    const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_FILE}`;
    const res = await fetch(url, { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) });
    if (!res.ok) {
      const err = await res.json();
      // SHA conflict — reload SHA and retry once
      if (res.status === 409 || (err.message && err.message.includes('sha'))) {
        await refreshSha();
        body.sha = _fileSha;
        const retry = await fetch(url, { method: 'PUT', headers: ghHeaders(), body: JSON.stringify(body) });
        if (!retry.ok) throw new Error(`GitHub save retry failed: ${retry.status}`);
        const rj = await retry.json();
        _fileSha = rj.content.sha;
      } else {
        throw new Error(`GitHub save failed: ${res.status} ${err.message}`);
      }
    } else {
      const rj = await res.json();
      _fileSha = rj.content.sha;
    }
    return true;
  } catch (e) {
    console.warn('ghSave error:', e);
    return false;
  }
}

async function refreshSha() {
  try {
    const url = `https://api.github.com/repos/${GH_OWNER}/${GH_REPO}/contents/${GH_FILE}?ref=${GH_BRANCH}&t=${Date.now()}`;
    const res = await fetch(url, { headers: ghHeaders() });
    if (res.ok) { const j = await res.json(); _fileSha = j.sha; }
  } catch(e) { console.warn('refreshSha error:', e); }
}
