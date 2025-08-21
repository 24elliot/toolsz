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
    row.append(name, weight, range);
    name.oninput = () => { e.name = name.value; persist(); };
    weight.oninput = () => { e.weight = Number(weight.value||0); e.range = undefined; persist(); };
    range.oninput = () => {
      const m = range.value.match(/^\s*(\d+)\s*-\s*(\d+)\s*$/);
      if (m) { e.range = [Number(m[1]), Number(m[2])]; e.weight = undefined; persist(); }
    };
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
