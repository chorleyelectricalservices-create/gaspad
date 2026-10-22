// "Speak whole section": turn one spoken sentence into several field values.
// Offline keyword parser first; optional Gemini mapping (see mapWithGemini). Pure module, no DOM.
import { wordsToNumbers } from './voice.js';
import { normaliseForField, formatPostcode } from './fieldvoice.js';

// Spoken aliases per field key (last path segment). Longest alias wins; matched on word boundaries.
export const ALIASES = {
  // appliance
  location: ['location', 'room is', 'located in', 'position'],
  type: ['appliance type', 'type of appliance', 'type'],
  make: ['make', 'manufacturer', 'brand', 'made by'],
  model: ['model number', 'model'],
  serial: ['serial number', 'serial no', 'serial'],
  gcNo: ['gc number', 'g c number', 'gc no', 'gee see number', 'gc'],
  gasType: ['gas type', 'type of gas', 'fuel'],
  owned: ['landlords appliance', 'landlord appliance', 'landlord owned', 'owned by landlord', 'landlords'],
  inspected: ['appliance inspected', 'inspected'],
  flue: ['flue type', 'flu type', 'flue', 'flu'],
  pressure: ['operating pressure', 'burner pressure', 'working pressure', 'pressure'],
  heatInput: ['heat input', 'heat in put', 'kilowatts', 'kw input'],
  safetyDevice: ['safety devices', 'safety device', 'safety device operation', 'flame failure', 'ffd'],
  ventilation: ['ventilation', 'vent'],
  flueVisual: ['visual condition of flue', 'flue visual', 'flu visual', 'flue condition', 'flu condition', 'visual condition', 'termination'],
  spillage: ['spillage test', 'spillage', 'spill test'],
  flueFlow: ['flue flow test', 'flue flow', 'flu flow', 'flow test'],
  co: ['carbon monoxide', 'co reading', 'co ppm', 'co'],
  co2: ['carbon dioxide', 'co2'],
  ratio: ['co co2 ratio', 'combustion ratio', 'ratio'],
  safe: ['safe to use', 'appliance safe', 'safe'],
  notes: ['notes', 'note', 'comments', 'defect'],
  // people / places
  name: ['name'], company: ['company', 'agency', 'agent'], address: ['address'], phone: ['phone number', 'telephone', 'phone', 'mobile', 'number'],
  email: ['email address', 'email', 'e mail'], tenant: ['tenant name', 'tenant'], business: ['business name', 'business', 'company'],
  regNo: ['gas safe number', 'gas safe registration', 'registration number', 'reg number', 'reg no'], idCard: ['id card number', 'id card', 'card number', 'licence number'],
  // installation
  pipework: ['pipework visual', 'pipework', 'pipe work', 'visual inspection'], tightness: ['tightness test', 'tightness', 'tight test', 'drop test'],
  tightnessDetail: ['tightness details', 'test details'], ecv: ['emergency control valve', 'ecv', 'e c v', 'meter control'],
  bonding: ['equipotential bonding', 'main bonding', 'bonding', 'earth bonding'], coFitted: ['co alarm fitted', 'carbon monoxide alarm fitted', 'alarm fitted', 'co alarm', 'co detector', 'carbon monoxide alarm'],
  coTested: ['co alarm tested', 'alarm tested', 'alarms tested', 'tested'], coLocation: ['alarm location', 'alarm in', 'alarm located'],
  found: ['defects found', 'defects identified', 'defects', 'defect'], remedial: ['remedial action', 'remedial', 'action taken'],
  warningIssued: ['warning notice issued', 'warning notice', 'warning issued'], warningLabel: ['warning label attached', 'warning label', 'label attached', 'label'],
  warningCat: ['classification', 'category', 'classed as'], warningRef: ['warning reference', 'notice reference', 'notice number'],
  date: ['issue date', 'inspection date', 'date'], recipient: ['received by', 'recipient', 'signed by'], recipientRole: ['recipient is', 'role'],
};
const NUMERIC_TEXT = new Set(['model', 'serial', 'gcNo', 'regNo', 'idCard', 'warningRef']);
const YES = /^(yes|yeah|yep|yup|ok|okay|fine|correct|satisfactory|sat|good|fitted|working|present|accessible|attached|issued|true|y)\b/;
const NO = /^(no|nope|not|none fitted|unsatisfactory|unsat|bad|missing|absent|inaccessible|n)\b/;
const NA = /^(n ?a|not applicable|not tested|none|nil|no ?n ?a)\b/;
const PASS = /^(pass|passed|ok|okay|yes|good|fine|satisfactory|sat|working|correct|tight|no drop)\b/;
const FAIL = /^(fail|failed|failure|no|bad|unsatisfactory|unsat|dropped|not working|spilling|spills)\b/;

export function normText(raw) {
  let t = ' ' + String(raw || '').toLowerCase().replace(/[’']/g, '').replace(/[,;:]+|\.(?=\s|$)/g, ' , ').replace(/\s+/g, ' ') + ' ';
  t = t.replace(/\bc\.?\s?o\.?\s?(2|two|to|too)\b/g, 'co2').replace(/\bc02\b/g, 'co2').replace(/\bsee o(h)? (two|2)\b/g, 'co2')
    .replace(/\bsee o(h)?\b/g, 'co').replace(/\bc\.? ?o\b\.?/g, 'co').replace(/\bco 2 (?=\d)/g, 'co2 ')
    .replace(/\bflu\b/g, 'flue').replace(/\bgas safe\b/g, 'gas safe');
  return t.replace(/\s+/g, ' ').trim();
}

/** fields: [{k:'app.0.make'|'landlord.name', t, opts}] → [{k, raw, val}] */
export function parseSpeech(transcript, fields) {
  const text = normText(transcript); const hits = [];
  const keyOf = f => f.k.split('.').pop();
  const aliasList = fields.filter(f => f.t !== 'calc').flatMap(f => (f.al || ALIASES[keyOf(f)] || labelAliases(f)).filter(Boolean).map(a => ({ f, a: normText(a) })))
    .sort((x, y) => y.a.length - x.a.length);
  const taken = new Array(text.length).fill(false);
  for (const { f, a } of aliasList) {
    const re = new RegExp(`(?:^|\\s)(${a.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})(?=\\s|$)`, 'g'); let m;
    while ((m = re.exec(text))) { const s = m.index + m[0].length - m[1].length, e = s + m[1].length;
      if (taken.slice(s, e).some(Boolean)) continue; for (let i = s; i < e; i++) taken[i] = true; hits.push({ f, s, e }); }
  }
  hits.sort((x, y) => x.s - y.s);
  // free-text fields (notes, defects) keep going over other keywords unless a comma/full stop separates them
  for (let i = 0; i < hits.length; i++) if (hits[i].f.t === 'area')
    while (hits[i + 1] && hits[i + 1].f.t !== 'area' && !/,\s*$/.test(text.slice(hits[i].e, hits[i + 1].s))) hits.splice(i + 1, 1);
  const out = []; const seen = new Set();
  hits.forEach((h, i) => {
    let raw = text.slice(h.e, hits[i + 1]?.s ?? text.length).replace(/^\s*(is|was|are|equals|of|at|=|:)\s+/, '').replace(/[\s,.]+$/, '').replace(/^[\s,.]+/, '').replace(/^(is|was|are)\s+/, '').trim();
    if (!raw) return; const val = normValue(h.f, raw); if (val === '' || val == null) return;
    if (seen.has(h.f.k)) { const o = out.find(x => x.k === h.f.k); o.raw = raw; o.val = val; return; }
    seen.add(h.f.k); out.push({ k: h.f.k, label: h.f.l, raw, val });
  });
  return out;
}

export const labelAliases = f => { const l = String(f.l || '').toLowerCase().replace(/\(.*?\)/g, '').replace(/[^a-z0-9₂ ]+/g, ' ').replace(/₂/g, '2').replace(/\s+/g, ' ').trim(); return l ? [l] : []; };
/** Best list option by matching words/numbers ("copper 22" -> "Copper 22mm"). Numbers must agree. */
export function bestOpt(opts, r) {
  const rw = new Set(wordsToNumbers(r).toLowerCase().split(/[^a-z0-9.]+/).filter(Boolean)); let best = '', score = 0;
  for (const o of opts) { const toks = o.toLowerCase().split(/[^a-z0-9.]+/).filter(t => t.length >= 2 || /\d/.test(t)).map(t => t.replace(/^(\d+(?:\.\d+)?)(mm|m)$/, '$1'));
    const nums = toks.filter(t => /^\d/.test(t)); if (nums.length && !nums.some(t => rw.has(t))) continue;
    const sc = toks.filter(t => rw.has(t)).length; if (sc > score) { score = sc; best = o; } }
  return best;
}
const cap = s => s.charAt(0).toUpperCase() + s.slice(1);
export function normValue(f, raw) {
  const k = f.k.split('.').pop(); const r = raw.trim(); const opts = f.opts || [];
  if (f.t === 'seg' || f.t === 'list') {
    if (k === 'flue') { if (/room ?seal|^r ?s\b|^are s\b|^c ?type/.test(r)) return 'RS'; if (/balanced|^b ?f\b/.test(r)) return 'BF'; if (/flue ?less|^f ?l\b|^a ?type/.test(r)) return 'FL'; if (/open|^o ?f\b|^oh f|conventional|^b ?type/.test(r)) return 'OF'; return ''; }
    if (k === 'gasType' || (opts.includes('LPG') && opts.includes('Natural gas'))) return /lpg|l p g|propane|butane|bottled/.test(r) ? 'LPG' : /natural|^ng\b|mains|g ?20/.test(r) ? 'Natural gas' : '';
    if (k === 'warningCat' || opts.includes('ID')) return /immediately|^i ?d\b/.test(r) ? 'ID' : /at risk|^a ?r\b/.test(r) ? 'AR' : NA.test(r) ? 'N/A' : '';
    if (k === 'recipientRole') return /tenant/.test(r) ? 'Tenant' : /agent/.test(r) ? 'Agent' : /landlord|owner/.test(r) ? 'Landlord' : '';
    if (f.t === 'list') { const hit = opts.find(o => r.includes(o.toLowerCase())) || bestOpt(opts, r); return hit || cap(r); }
    if (opts.includes('Pass')) return NA.test(r) ? 'N/A' : PASS.test(r) ? 'Pass' : FAIL.test(r) ? 'Fail' : '';
    if (opts.includes('Yes')) return NA.test(r) && opts.includes('N/A') ? 'N/A' : NO.test(r) && !/^not? ?applicable/.test(r) ? 'No' : YES.test(r) ? 'Yes' : '';
    const lo = o => o.toLowerCase();
    return opts.find(o => lo(o) === r) || opts.find(o => r.startsWith(lo(o))) || opts.find(o => lo(o).split(/[\s/()]+/).some(w => w.length >= 2 && new RegExp(`\\b${w.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`).test(r))) || '';
  }
  if (f.t === 'num') { const n = wordsToNumbers(r).replace(/(\d) point (\d)/g, '$1.$2').match(/\d+(\.\d+)?|\.\d+/); return n ? (n[0].startsWith('.') ? '0' + n[0] : n[0]) : ''; }
  if (f.t === 'email') return normaliseForField('email', r);
  if (f.t === 'tel') return normaliseForField('phone', r);
  if (f.t === 'date') return '';
  if (NUMERIC_TEXT.has(k)) { let v = wordsToNumbers(r).replace(/(\d) (?=\d)/g, '$1').replace(/(\d) ([a-z]{1,3})\b/g, '$1$2');
    if (k === 'gcNo') { const d = v.replace(/\D/g, ''); if (d.length === 7) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`; }
    return /^(model|serial)$/.test(k) ? v.toUpperCase().replace(/^([A-Z]+)(?=\d)/, '$1') : v.toUpperCase(); }
  if (f.t === 'addr') return r.replace(/\s*,\s*/g, '\n').split('\n').map(l => formatPostcode(l) || cap(l.replace(/\b([a-z]{1,2}\d[a-z\d]?)\s?(\d[a-z]{2})\b/g, m => formatPostcode(m) || m))).join('\n').replace(/\b\w/g, c => c.toUpperCase());
  const t = normaliseForField('text', r);
  return ['name', 'tenant', 'recipient', 'make', 'business', 'company'].includes(k) ? t.replace(/\b\w/g, c => c.toUpperCase()) : t;
}

/** Prompt for Gemini to map a transcript to fields. */
export function geminiPrompt(transcript, fields) {
  return `A UK gas engineer dictated values for a gas safety form. Map the transcript to these fields. Return ONLY JSON {"<key>":"<value>",...} with only the fields that were actually said.
Fields (key: label [allowed values]):
${fields.map(f => `${f.k}: ${f.l}${f.opts ? ` [${f.opts.join(' | ')}]` : f.t === 'num' ? ' [number only]' : ''}`).join('\n')}
Rules: use allowed values exactly. Flue: room sealed=RS, open flue=OF, balanced flue=BF, flueless=FL. Numbers as digits ("nine point one" = 9.1). Addresses as lines separated by \\n with the postcode formatted like PR7 1AB. Don't invent anything.
Transcript: """${String(transcript).slice(0, 3000)}"""`;
}
/** Normalise Gemini's {key:value} into rows, validating allowed values. */
export function fromGemini(json, fields) {
  const out = []; if (!json || typeof json !== 'object') return out;
  for (const f of fields) { let v = json[f.k]; if (v == null || String(v).trim() === '') continue; v = String(v).trim();
    if (f.opts && f.t === 'seg') { const o = f.opts.find(x => x.toLowerCase() === v.toLowerCase()) || normValue(f, v.toLowerCase()); if (!o) continue; v = o; }
    if (f.t === 'num') { const n = v.match(/\d+(\.\d+)?/); if (!n) continue; v = n[0]; }
    out.push({ k: f.k, label: f.l, raw: v, val: v }); }
  return out;
}
