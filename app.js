import { normalize, probAtLeastOnce, probAtLeastOnceWithout, binomPMF } from './probability.js';

// Utilities
const $ = sel => document.querySelector(sel);
const $$ = sel => Array.from(document.querySelectorAll(sel));
const byId = id => document.getElementById(id);
const fmtPct = x => (100 * x).toFixed(2) + "%";
const clamp = (x, lo, hi) => Math.max(lo, Math.min(hi, x));

const state = {
  entries: [], // [{name, weight}|{name, range:[a,b]}]
  rolls: 3,
  sampling: 'with'
};

// Load year
byId('year').textContent = new Date().getFullYear();

// Preset loader
byId('loadPreset').onclick = async () => {
  const path = byId('presetSelect').value;
  const res = await fetch(path);
  const json = await res.json();
  setEntries(json);
};

// JSON paste
byId('loadJSON').onclick = () => {
  try {
    const json = JSON.parse(byId('jsonInput').value);
    setEntries(json);
  } catch (e) { alert("Invalid JSON"); }
};

byId('downloadJSON').onclick = () => {
  const blob = new Blob([JSON.stringify(state.entries, null, 2)], {type:"application/json"});
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = 'loot_table.json'; a.click();
  URL.revokeObjectURL(url);
};

byId('numRolls').oninput = e => state.rolls = clamp(parseInt(e.target.value||"1",10),1,999);
byId('sampling').onchange = e => state.sampling = e.target.value;
byId('rounding').onchange = () => renderResults();

byId('compute').onclick = () => renderResults();
byId('reset').onclick = () => { localStorage.removeItem('loot_state'); location.reload(); };

// Share URL with base64 state
byId('shareURL').onclick = () => {
  const payload = btoa(unescape(encodeURIComponent(JSON.stringify({entries:state.entries, rolls:state.rolls, sampling:state.sampling}))));
  const url = location.origin + location.pathname + "#s=" + payload;
  navigator.clipboard.writeText(url);
  alert("Shareable URL copied.");
};

// Tip and affiliate placeholders
byId('tipLink').href = "https://buymeacoffee.com/yourname";
byId('aff1').href = "https://www.drivethrurpg.com/?affiliate_id=YOUR_ID";

// State load from URL/localStorage
(function init() {
  const hash = new URL(location.href).hash;
  if (hash.startsWith("#s=")) {
    try {
      const obj = JSON.parse(decodeURIComponent(escape(atob(hash.slice(3)))));
      setEntries(obj.entries||[]);
      state.rolls = obj.rolls||3; state.sampling = obj.sampling||'with';
      byId('numRolls').value = state.rolls; byId('sampling').value = state.sampling;
    } catch {}
  } else {
    const saved = localStorage.getItem('loot_state');
    if (saved) {
      try { const obj = JSON.parse(saved); setEntries(obj.entries||[]); state.rolls = obj.rolls||3; state.sampling = obj.sampling||'with';
        byId('numRolls').value = state.rolls; byId('sampling').value = state.sampling;
      } catch {}
    } else {
      // default preset
      fetch('tables/srd_generic.json').then(r=>r.json()).then(setEntries);
    }
  }
})();



// Core: convert entries to probabilities
function normalize(entries) {
  if (!entries.length) return [];
  if ('range' in entries[0]) {
    // Range mode: assume d100 inclusive ranges
    const weights = entries.map(e => ({name:e.name, weight: e.range[1]-e.range[0]+1}));
    const total = weights.reduce((a,b)=>a+b.weight,0);
    return weights.map(w => ({name:w.name, p:w.weight/total}));
  } else {
    const total = entries.reduce((a,b)=>a+(b.weight||0),0);
    return entries.map(e => ({name:e.name, p:(e.weight||0)/total}));
  }
}

// Probability item appears at least once
function probAtLeastOnce(p, n) {
  // with replacement: 1 - (1-p)^n
  return 1 - Math.pow(1-p, n);
}

// Hypergeometric “without replacement” approximation per item:
// Treat table as a population where expected count for item in N draws without replacement equals N * p.
// For “at least one”: 1 - C((N_i=0)) which simplifies to product over draws of (1 - p_i_adjusted).
// We use exact no-replacement product: Π_{k=0}^{n-1} (1 - p * (M/(M- k))) where M is large proxy.
// Simpler and accurate enough for DM usage: 1 - Π_{k=0}^{n-1} (1 - p * ((T)/(T- k)))
// where T is table size proxy; set T=entries.length.
function probAtLeastOnceWithout(p, n, T) {
  let q = 1;
  for (let k=0;k<n;k++) {
    const adj = p * (T/(T - k));
    q *= Math.max(0, 1 - Math.min(adj,1));
  }
  return 1 - q;
}

// Full binomial distribution with replacement
function binomPMF(p, n) {
  // returns array of length n+1
  const pmf = new Array(n+1).fill(0);
  let coeff = 1; // nC0
  for (let k=0;k<=n;k++) {
    if (k>0) coeff = coeff * (n - (k-1)) / k;
    pmf[k] = coeff * Math.pow(p, k) * Math.pow(1-p, n-k);
  }
  return pmf;
}

function setEntries(entries) {
  state.entries = entries.map(e => ({name: String(e.name||"Item"), ...(e.range?{range:e.range}:{weight:Number(e.weight||0)})}));
  renderEditor();
  renderResults();
  persist();
}

function renderEditor() {
  const container = byId('editor');
  container.innerHTML = '';
  state.entries.forEach((e, i) => {
    const row = document.createElement('div'); row.className = 'row';
    const name = document.createElement('input'); name.value = e.name; name.placeholder = "Name";
    const weight = document.createElement('input'); weight.type = 'number'; weight.step = '1'; weight.value = e.weight ?? '';
    const range = document.createElement('input'); range.placeholder = 'a-b'; range.value = e.range?`${e.range[0]}-${e.range[1]}`:'';
    const del = document.createElement('button'); del.textContent = '×'; del.className = 'icon-btn'; del.title = 'Delete row';
    row.append(name, weight, range, del);

    row.append(name, weight, range);
    name.oninput = () => { e.name = name.value; persist(); };
    weight.oninput = () => { e.weight = Number(weight.value||0); e.range = undefined; persist(); };
    range.oninput = () => {
      const m = range.value.match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);
      if (m) { e.range = [Number(m[1]), Number(m[2])]; e.weight = undefined; persist(); }
    };
    del.onclick = () => { state.entries.splice(i,1); renderEditor(); renderResults(); persist(); };
    container.appendChild(row);
  });
  byId('addRow').onclick = () => { state.entries.push({name:"New Item", weight:1}); renderEditor(); persist(); };
}

function persist() {
  localStorage.setItem('loot_state', JSON.stringify({entries:state.entries, rolls:state.rolls, sampling:state.sampling}));
}

function renderResults() {
  const probs = normalize(state.entries);
  const n = state.rolls;
  const rounding = byId('rounding').value;
  const T = state.entries.length || 1;

  // Summary
  const sumEl = byId('summary');
  if (!probs.length) { sumEl.textContent = 'No entries.'; byId('tableResults').innerHTML=''; return; }

  // Build table
  let html = `<table><thead><tr><th>Item</th><th>Weight/Range</th><th>p(single)</th><th>Chance ≥1 in ${n}</th><th>Expected count</th><th>Distribution (k: P)</th></tr></thead><tbody>`;
  probs.forEach((e, idx) => {
    const p = e.p;
    const p_once = state.sampling==='with' ? probAtLeastOnce(p, n) : probAtLeastOnceWithout(p, n, T);
    const exp = n * p; // expectation is n*p for both models as a good approximation
    const dist = binomPMF(p, n).map((v,k)=> `${k}:${rounding==='perc'?fmtPct(v):v.toFixed(4)}`).slice(0,Math.min(n+1,6)).join(' | ') + (n>5?' | …':'');
    const pSingle = rounding==='perc'?fmtPct(p):p.toFixed(4);
    const pAtLeast = rounding==='perc'?fmtPct(p_once):p_once.toFixed(4);
    const src = state.entries[idx].range ? `[${state.entries[idx].range[0]}–${state.entries[idx].range[1]}]` : (state.entries[idx].weight ?? '');
    html += `<tr><td>${e.name}</td><td>${src}</td><td>${pSingle}</td><td>${pAtLeast}</td><td>${exp.toFixed(3)}</td><td>${dist}</td></tr>`;
  });
  html += `</tbody></table>`;
  byId('tableResults').innerHTML = html;
  sumEl.textContent = `${probs.length} items. Sampling: ${state.sampling}.`;

  persist();
}

// Copy table results
byId('copyTable').onclick = () => {
  const text = byId('tableResults').innerText;
  navigator.clipboard.writeText(text);
  alert('Table copied to clipboard.');
};
function pickIndex(entries) {
  const weights = entries.map(e => e.range ? (e.range[1] - e.range[0] + 1) : (e.weight || 0));
  const total = weights.reduce((a, b) => a + b, 0);
  let r = Math.random() * total;
  for (let i = 0; i < entries.length; i++) {
    r -= weights[i];
    if (r < 0) return i;
  }
  return entries.length - 1;
}

function generateLoot() {
  const pool = state.entries.slice();
  const loot = [];
  for (let i = 0; i < state.rolls; i++) {
    if (!pool.length) break;
    const idx = pickIndex(pool);
    loot.push(pool[idx].name);
    if (state.sampling === 'without') pool.splice(idx, 1);
  }
  return loot;
}

byId('rollLoot').onclick = () => {
  const loot = generateLoot();
  const out = byId('lootOutput');
  out.innerHTML = '';
  loot.forEach(name => {
    const li = document.createElement('li');
    li.textContent = name;
    out.appendChild(li);
  });
  if (!loot.length) {
    const li = document.createElement('li');
    li.textContent = 'No loot.';
    out.appendChild(li);
  }
};

