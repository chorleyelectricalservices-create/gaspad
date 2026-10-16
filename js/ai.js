// AI photo reading via the engineer's own Google Gemini key. The key lives ONLY in this
// phone's localStorage – never in backups, never in the repo. The phone calls Google directly.
export const KEY_LS = 'gaspad.geminiKey';
export const KEY_URL = 'https://aistudio.google.com/apikey';
export const GEMINI_FALLBACK = ['gemini-3.8-flash', 'gemini-3.6-flash', 'gemini-3.5-flash-lite'];
const ls = () => (typeof localStorage !== 'undefined' ? localStorage : null);
export const getKey = () => ls()?.getItem(KEY_LS) || '';
export function setKey(v) { v = String(v || '').trim(); v ? ls()?.setItem(KEY_LS, v) : ls()?.removeItem(KEY_LS); }
export class AiError extends Error { constructor(code, msg, detail = '') { super(msg); this.code = code; this.detail = detail; } }

const clean = v => (v == null ? '' : String(v).trim());
const num = v => { const m = clean(v).replace(',', '.').match(/\d+(\.\d+)?/); return m ? m[0] : ''; };
const oneOf = (v, opts) => { const s = clean(v).toLowerCase(); return opts.find(o => o.toLowerCase() === s) || ''; };

export const BADGE_FIELDS = ['make', 'model', 'type', 'serial', 'gcNo', 'heatInput', 'gasType', 'pressure', 'flue'];
export const BADGE_LABELS = { make: 'Make', model: 'Model', type: 'Appliance type', serial: 'Serial no.', gcNo: 'GC no.', heatInput: 'Heat input kW', gasType: 'Gas type', pressure: 'Burner/operating pressure mbar', flue: 'Flue type' };

export const BADGE_PROMPT = `You are reading a photo of a UK gas appliance data badge / data plate (boiler, fire, cooker, water heater).
Return ONLY JSON: {"make":"","model":"","type":"","serial":"","gcNo":"","heatInput":"","gasType":"","pressure":"","flue":"","unreadable":[],"notes":""}
Rules:
- make = manufacturer (e.g. "Worcester Bosch", "Vaillant", "Ideal", "Baxi", "Glow-worm"). model = model name/number as printed.
- type: one of "Combi boiler","System boiler","Regular boiler","Back boiler","Gas fire","Cooker","Hob","Oven","Water heater","Warm air heater","Tumble dryer","Range cooker","Other". Only if the badge or model makes it clear.
- serial = serial number exactly. gcNo = GC / G.C. number formatted NN-NNN-NN.
- heatInput = MAXIMUM heat input in kW (gross or net as printed; prefer Qn max input, NOT output). Number only.
- gasType: "Natural gas" (G20, 2H, I2H, NG) or "LPG" (G30/G31, 3P, 3B/P, propane, butane).
- pressure = burner/operating/setting pressure in mbar if printed (not supply pressure 20 mbar unless only that is printed). Number only.
- flue: "RS" if room sealed / C-type (C13, C33, C53...), "OF" if open flue B-type (B11, B11BS, B22...), "FL" if flueless A-type. Leave blank if unclear.
- NEVER guess. If not clearly legible leave "" and add the field name to "unreadable".`;

export const FORM_PROMPT = `You are reading a photo or scan of a UK Landlord Gas Safety Record (CP12) or similar gas paperwork.
Return ONLY JSON:
{"landlord":{"name":"","company":"","address":"","phone":"","email":""},
 "property":{"tenant":"","address":"","phone":""},
 "engineer":{"name":"","business":"","address":"","phone":"","regNo":"","idCard":""},
 "appliances":[{"location":"","type":"","make":"","model":"","serial":"","gcNo":"","flue":"","pressure":"","heatInput":"","owned":"","inspected":"","safetyDevice":"","ventilation":"","flueVisual":"","spillage":"","flueFlow":"","co":"","co2":"","ratio":"","safe":""}],
 "install":{"pipework":"","tightness":"","ecv":"","bonding":"","coFitted":"","coTested":""},
 "defects":{"found":"","remedial":"","warningIssued":""}}
Rules: addresses as multi-line text with \\n between lines. flue one of OF,RS,BF,FL. Yes/No fields "Yes","No","N/A"; test results "Pass","Fail","N/A".
Numbers as digits only. Leave anything not clearly legible as "". Never guess.`;

export function extractJson(text) {
  const t = clean(text).replace(/^```(?:json)?/i, '').replace(/```$/, '').trim();
  try { return JSON.parse(t); } catch {}
  const a = t.indexOf('{'), b = t.lastIndexOf('}');
  if (a >= 0 && b > a) { try { return JSON.parse(t.slice(a, b + 1)); } catch {} }
  throw new AiError('bad', 'The AI reply was not readable. Try again with a clearer, straight-on photo.');
}
const TYPES = ['Combi boiler', 'System boiler', 'Regular boiler', 'Back boiler', 'Gas fire', 'Cooker', 'Hob', 'Oven', 'Water heater', 'Warm air heater', 'Tumble dryer', 'Range cooker', 'Other'];
export function normGc(v) { const d = clean(v).replace(/\D/g, ''); return d.length === 7 ? `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}` : clean(v).toUpperCase().replace(/^G\.?C\.?\s*(NO\.?)?\s*/i, ''); }
export function normGas(v) { const s = clean(v).toLowerCase(); if (!s) return ''; if (/lpg|g3[01]|propane|butane|3p|3b/.test(s)) return 'LPG'; if (/natural|g20|2h|ng\b|g25/.test(s)) return 'Natural gas'; return ''; }
export function normFlue(v) { const s = clean(v).toUpperCase(); if (FLUE_OK.includes(s)) return s; if (/ROOM SEAL|^C\d/.test(s)) return 'RS'; if (/OPEN|^B\d/.test(s)) return 'OF'; if (/FLUELESS|^A/.test(s)) return 'FL'; if (/BALANCED/.test(s)) return 'BF'; return ''; }
const FLUE_OK = ['OF', 'RS', 'BF', 'FL'];
export function normBadge(raw) {
  if (!raw || typeof raw !== 'object') throw new AiError('bad', 'No data badge details found.');
  const out = { make: clean(raw.make).slice(0, 60), model: clean(raw.model).slice(0, 80), type: oneOf(raw.type, TYPES), serial: clean(raw.serial).slice(0, 40),
    gcNo: normGc(raw.gcNo).slice(0, 20), heatInput: num(raw.heatInput), gasType: normGas(raw.gasType), pressure: num(raw.pressure), flue: normFlue(raw.flue) };
  const unreadable = (Array.isArray(raw.unreadable) ? raw.unreadable : []).map(clean).filter(f => BADGE_FIELDS.includes(f));
  return { values: out, unreadable, notes: clean(raw.notes) };
}
const YNA = ['Yes', 'No', 'N/A'], PFA = ['Pass', 'Fail', 'N/A'];
export function normForm(raw) {
  if (!raw || typeof raw !== 'object') throw new AiError('bad', 'Nothing readable on that page.');
  const o = (x, ks) => Object.fromEntries(ks.map(k => [k, clean(x?.[k])]).filter(([, v]) => v));
  const yn = v => oneOf(v === 'Y' ? 'Yes' : v === 'N' ? 'No' : v, YNA), pf = v => oneOf(/^(pass|ok|sat)/i.test(clean(v)) ? 'Pass' : /^(fail|unsat)/i.test(clean(v)) ? 'Fail' : v, PFA);
  const out = { landlord: o(raw.landlord, ['name', 'company', 'address', 'phone', 'email']), property: o(raw.property, ['tenant', 'address', 'phone']),
    engineer: o(raw.engineer, ['name', 'business', 'address', 'phone', 'regNo', 'idCard']), install: {}, defects: o(raw.defects, ['found', 'remedial']) };
  const i = raw.install || {}; for (const k of ['pipework', 'ecv', 'bonding', 'coFitted', 'coTested']) if (yn(i[k])) out.install[k] = yn(i[k]); if (pf(i.tightness)) out.install.tightness = pf(i.tightness);
  if (yn(raw.defects?.warningIssued)) out.defects.warningIssued = yn(raw.defects.warningIssued);
  out.appliances = (Array.isArray(raw.appliances) ? raw.appliances : []).filter(a => a && typeof a === 'object').map(a => {
    const r = { ...o(a, ['location', 'make', 'model', 'serial']), type: oneOf(a.type, TYPES), gcNo: normGc(a.gcNo), flue: normFlue(a.flue),
      pressure: num(a.pressure), heatInput: num(a.heatInput), co: num(a.co), co2: num(a.co2), ratio: num(a.ratio) };
    for (const k of ['owned', 'inspected', 'ventilation', 'safe']) r[k] = yn(a[k]);
    for (const k of ['safetyDevice', 'flueVisual', 'spillage', 'flueFlow']) r[k] = pf(a[k]);
    return Object.fromEntries(Object.entries(r).filter(([, v]) => v));
  }).filter(a => Object.keys(a).length);
  return out;
}

export function buildRequest(model, key, b64, mime, prompt, noThinking) {
  return { url: `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent`,
    init: { method: 'POST', headers: { 'Content-Type': 'application/json', 'x-goog-api-key': key },
      body: JSON.stringify({ contents: [{ role: 'user', parts: [{ inline_data: { mime_type: mime, data: b64 } }, { text: prompt }] }],
        generationConfig: { responseMimeType: 'application/json', ...(noThinking ? {} : { thinkingConfig: { thinkingLevel: 'low' } }) } }) } };
}
function httpErr(status, m) {
  if ((status === 400 && /api key/i.test(m)) || status === 401 || status === 403) return new AiError('key', 'Your Gemini API key was rejected. Check it in Settings.');
  if (status === 404) return new AiError('model', `Model not found – clear the model name in Settings to use the default. ${m}`);
  if (status === 429) return new AiError('quota', 'Gemini rate limit or free quota reached. Wait a minute and try again.');
  if (status >= 500) return new AiError('busy', `Gemini is overloaded (error ${status}). Try again in a few minutes.`);
  return new AiError('http', `Gemini error ${status}${m ? ': ' + m : ''}`);
}

/** Send one image to Gemini with a prompt; returns parsed JSON. deps: {fetch,key,model,onStatus,signal,online,delayScale} */
export async function askGemini(dataUrl, prompt, deps = {}) {
  const key = deps.key ?? getKey();
  if (!key) throw new AiError('nokey', 'No Gemini API key yet. Add your own free key in Settings → AI photo reading.');
  if ((deps.online ?? (typeof navigator === 'undefined' || navigator.onLine !== false)) === false) throw new AiError('offline', 'You’re offline – photo reading needs a signal. Enter the details by hand or try again later.');
  const m = String(dataUrl || '').match(/^data:([^;,]+)?(?:;base64)?,(.*)$/); if (!m || !m[2]) throw new AiError('bad', 'No photo.');
  const mime = m[1] || 'image/jpeg', b64 = m[2];
  const models = deps.model ? [deps.model] : GEMINI_FALLBACK; const f = deps.fetch || globalThis.fetch; const st = deps.onStatus || (() => {});
  let last;
  for (const model of models) {
    for (let attempt = 0; attempt < 3; attempt++) {
      if (deps.signal?.aborted) throw new AiError('cancel', 'Cancelled.');
      st(attempt ? `Gemini busy, retrying (${model})…` : `Reading photo with ${model}…`);
      let noThinking = false, res, raw;
      for (let k = 0; k < 2; k++) {
        const { url, init } = buildRequest(model, key, b64, mime, prompt, noThinking);
        try { res = await f(url, { ...init, signal: deps.signal }); raw = await res.text(); }
        catch (e) { if (deps.signal?.aborted) throw new AiError('cancel', 'Cancelled.'); throw new AiError('offline', 'Couldn’t reach Google. Check your signal and try again.', String(e?.message || e)); }
        if (res.status === 400 && /thinking/i.test(raw) && !noThinking) { noThinking = true; continue; } break;
      }
      let data = null; try { data = JSON.parse(raw); } catch {}
      if (res.ok) {
        const c = data?.candidates?.[0];
        if (!c && data?.promptFeedback?.blockReason) throw new AiError('bad', `Gemini refused the photo (${data.promptFeedback.blockReason}).`);
        const text = (c?.content?.parts || []).map(p => p.text || '').join('');
        if (!text) throw new AiError('bad', 'Gemini gave an empty answer. Try a clearer photo.');
        return { json: extractJson(text), model };
      }
      last = httpErr(res.status, data?.error?.message || ''); last.detail = String(raw).slice(0, 500);
      if (![429, 500, 502, 503, 504].includes(res.status)) throw last;
      await new Promise(r => setTimeout(r, [2000, 5000, 0][attempt] * (deps.delayScale ?? 1)));
    }
  }
  throw last;
}
export async function scanBadge(dataUrl, deps) { const { json, model } = await askGemini(dataUrl, BADGE_PROMPT, deps); return { ...normBadge(json), model }; }
export async function importForm(dataUrl, deps) { const { json, model } = await askGemini(dataUrl, FORM_PROMPT, deps); return { ...normForm(json), model }; }

/** Plan applying badge values to an appliance: [{k, old, val, on}] – fills blanks on by default, changes off. */
export function badgePlan(app, values) {
  return BADGE_FIELDS.filter(k => values[k]).map(k => ({ k, old: clean(app[k]), val: values[k], on: !clean(app[k]) || clean(app[k]) === values[k] || (k === "gasType" && app[k] === "Natural gas") }))
;
}
