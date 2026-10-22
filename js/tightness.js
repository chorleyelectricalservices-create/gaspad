// Tightness test & purge (domestic, IGEM/UP/1B style). Calculations are pure + unit tested.
// ⚠ Table values are typical published figures – an engineer MUST verify against the current IGEM/UP/1B
// before relying on them. Every value used is shown and editable on the form.
import { get, PF, YN, YNA } from './cp12.js';
import { party, propertySec, engineerSec, checker, checkEngineer, checkSigs, firstLine, today } from './common.js';

// Internal volume per metre (m³/m), from nominal internal bores: V = π/4 · ID²
const bore = mm => +(Math.PI / 4 * (mm / 1000) ** 2).toFixed(6);
export const PIPES = {
  'Copper 10mm': bore(8.6), 'Copper 15mm': bore(13.6), 'Copper 22mm': bore(20.2), 'Copper 28mm': bore(26.2), 'Copper 35mm': bore(32.6), 'Copper 42mm': bore(39.6),
  'Steel ½" (DN15)': bore(16.1), 'Steel ¾" (DN20)': bore(21.6), 'Steel 1" (DN25)': bore(27.3), 'Steel 1¼" (DN32)': bore(35.9),
  'PE 20mm': bore(16.4), 'PE 25mm': bore(20.4), 'PE 32mm': bore(26.2),
  'CSST DN12': bore(12.5), 'CSST DN15': bore(15.5), 'CSST DN22': bore(22.0),
};
export const METERS = {
  'U6/G4 diaphragm': { vol: 0.008, purge: 0.01 },
  'E6 ultrasonic': { vol: 0.0024, purge: 0.005 },
  'U16/G10': { vol: 0.025, purge: 0.03 },
  'No meter / LPG': { vol: 0, purge: 0 },
};
export const MAX_VOLUME = 0.035; // m³ – above this is outside IGEM/UP/1B domestic scope (use IGEM/UP/1A)

const n = v => { const x = parseFloat(String(v ?? '').replace(',', '.')); return Number.isFinite(x) ? x : NaN; };
const r5 = x => +x.toFixed(5);
export function pipeVolume(pipes = []) { return r5(pipes.reduce((s, p) => s + (PIPES[p.size] ?? (n(p.volPerM) || 0)) * (n(p.length) || 0), 0) || 0); }
export function meterVolume(meter) { return METERS[meter]?.vol ?? 0; }
export function installVolume(meter, pipes) { return r5(meterVolume(meter) + pipeVolume(pipes)); }

/**
 * Maximum permissible pressure drop (mbar) for a 2-minute tightness test, natural gas, domestic.
 * Defaults (VERIFY against IGEM/UP/1B): new installation/extension with no appliances connected = no perceptible drop (0);
 * existing installation, or new with appliances connected: U6/G4 diaphragm 4 mbar, E6 ultrasonic 8 mbar, U16 4 mbar.
 * LPG / no meter: 0 (no perceptible drop) – verify for your system. Any smell of gas = fail regardless.
 */
export function permittedDrop({ meter, instType, appliancesConnected, gas }) {
  if (gas === 'LPG' || meter === 'No meter / LPG') return { mpd: 0, note: 'LPG / no meter: no perceptible drop (verify for system)' };
  const isNew = instType === 'New' || instType === 'Extension';
  if (isNew && appliancesConnected !== 'Yes') return { mpd: 0, note: 'New pipework, appliances not connected: no perceptible drop' };
  const t = { 'U6/G4 diaphragm': 4, 'E6 ultrasonic': 8, 'U16/G10': 4 }[meter];
  if (t == null) return { mpd: 0, note: 'Select the meter type' };
  return { mpd: t, note: `${isNew ? 'New, appliances connected' : 'Existing installation'}, ${meter}: ${t} mbar max (and no smell of gas)` };
}
/** Pass/Fail from readings. Returns '' when not enough data. */
export function tightnessResult({ start, end, mpd, smell, resolution = 0.1 }) {
  const s = n(start), e = n(end), m = n(mpd); if (!Number.isFinite(s) || !Number.isFinite(e) || !Number.isFinite(m)) return { drop: '', result: '' };
  const drop = +(s - e).toFixed(2);
  const tol = m === 0 ? resolution / 2 : 1e-9; // "no perceptible drop" = less than half the gauge resolution
  const pass = drop <= m + tol && smell !== 'Yes';
  return { drop: String(drop), result: pass ? 'Pass' : 'Fail' };
}
/** Purge volume (m³): meter purge volume + 1.5 × pipework volume (verify factor/meter values against IGEM/UP/1B). */
export function purgeVolume(meter, pipes) { return r5((METERS[meter]?.purge ?? 0) + 1.5 * pipeVolume(pipes)); }

const GAUGES = ['Electronic (0.1 mbar)', 'Electronic (0.01 mbar)', 'Water gauge (0.5 mbar)'];
const SIGS = [{ k: 'engineer', l: 'Engineer' }, { k: 'recipient', l: 'Customer / responsible person' }];
const SECTIONS = [
  party('customer', 'Customer', 'Customer name'), propertySec(), engineerSec(),
  { id: 'inst', title: 'Installation', fields: [
    { k: 'inst.type', l: 'Installation', t: 'seg', opts: ['New', 'Existing', 'Extension'], al: ['installation type', 'installation'] },
    { k: 'inst.gas', l: 'Gas', t: 'seg', opts: ['Natural gas', 'LPG'], al: ['gas type', 'gas'] },
    { k: 'inst.meter', l: 'Meter type', t: 'seg', opts: Object.keys(METERS), al: ['meter type', 'meter'] },
    { k: 'inst.appliances', l: 'Appliances connected during test', t: 'seg', opts: YN, al: ['appliances connected'] },
    { k: 'inst.reason', l: 'Reason for test', t: 'text', ph: 'e.g. new boiler, gas escape, CP12', al: ['reason for test', 'reason'] } ] },
  { id: 'vol', title: 'Installation volume', fields: [
    { k: 'vol.meter', l: 'Meter volume (m³)', t: 'calc' }, { k: 'vol.pipe', l: 'Pipework volume (m³)', t: 'calc' },
    { k: 'vol.total', l: 'Installation volume (m³)', t: 'calc' }, { k: 'vol.note', l: 'Scope', t: 'calc' } ] },
  { id: 'test', title: 'Tightness test', fields: [
    { k: 't.medium', l: 'Test medium', t: 'seg', opts: ['Gas', 'Air'], al: ['test medium', 'medium'] },
    { k: 't.gauge', l: 'Gauge type / resolution', t: 'list', opts: GAUGES, al: ['gauge type', 'gauge'] },
    { k: 't.strength', l: 'Strength test (new / extension only)', t: 'seg', opts: PF, al: ['strength test', 'strength'] },
    { k: 't.strengthP', l: 'Strength test pressure (mbar)', t: 'num', al: ['strength pressure'] },
    { k: 't.letby', l: 'Let-by test (ECV closed, 1 min, no rise)', t: 'seg', opts: PF, al: ['let by test', 'let by', 'letby'] },
    { k: 't.testP', l: 'Test pressure (mbar)', t: 'num', al: ['test pressure'] },
    { k: 't.stab', l: 'Stabilisation period', t: 'text', al: ['stabilisation', 'stabilization'] },
    { k: 't.duration', l: 'Test duration', t: 'text', al: ['test duration', 'duration'] },
    { k: 't.start', l: 'Start pressure (mbar)', t: 'num', al: ['start pressure', 'start reading', 'start'] },
    { k: 't.end', l: 'End pressure (mbar)', t: 'num', al: ['end pressure', 'finish pressure', 'end reading', 'end', 'finish'] },
    { k: 't.drop', l: 'Pressure drop (mbar)', t: 'calc' },
    { k: 't.mpd', l: 'Max permitted drop (mbar) – check IGEM/UP/1B', t: 'num', al: ['permitted drop', 'max drop', 'mpd'] },
    { k: 't.mpdNote', l: 'Permitted drop basis', t: 'calc' },
    { k: 't.smell', l: 'Smell of gas present', t: 'seg', opts: YN, al: ['smell of gas', 'smell'] },
    { k: 't.result', l: 'Tightness test result (auto)', t: 'calc' } ] },
  { id: 'purge', title: 'Purge', fields: [
    { k: 'p.volume', l: 'Purge volume (m³) – check IGEM/UP/1B', t: 'calc' },
    { k: 'p.method', l: 'Purge method', t: 'list', opts: ['Via appliance burner', 'Test burner', 'Purge hose to outside', 'Not required'], al: ['purge method', 'method'] },
    { k: 'p.confirm', l: 'Purge confirmed by', t: 'list', opts: ['Gas detector ≥ 90% gas', 'Stable flame at burner', 'Combustion analyser'], al: ['confirmed by', 'purge confirmed'] },
    { k: 'p.done', l: 'Purge complete', t: 'seg', opts: YNA, al: ['purge complete', 'purged'] },
    { k: 'p.notes', l: 'Notes', t: 'area', al: ['notes'] } ] },
  { id: 'issue', title: 'Issue', fields: [
    { k: 'issue.date', l: 'Test date', t: 'date' }, { k: 'issue.recipient', l: 'Received by (name)', t: 'text', al: ['received by', 'recipient'] } ] },
];
const PIPE_FIELDS = [
  { k: 'size', l: 'Pipe size / material', t: 'list', opts: Object.keys(PIPES), al: ['size', 'pipe'] },
  { k: 'length', l: 'Length (m)', t: 'num', al: ['length', 'metres', 'meters'] },
  { k: 'volPerM', l: 'Volume per m (m³) – only if size not listed', t: 'num', al: ['volume per metre'] },
  { k: 'vol', l: 'Run volume (m³)', t: 'calc' },
];
export function compute(d) {
  const meter = get(d, 'inst.meter'), pipes = d.pipes || [];
  pipes.forEach(p => { const v = (PIPES[p.size] ?? (parseFloat(p.volPerM) || 0)) * (parseFloat(p.length) || 0); p.vol = v ? String(+v.toFixed(5)) : ''; });
  d.vol ??= {}; d.t ??= {}; d.p ??= {};
  d.vol.meter = meter ? String(meterVolume(meter)) : ''; d.vol.pipe = String(pipeVolume(pipes)); d.vol.total = String(installVolume(meter, pipes));
  d.vol.note = +d.vol.total > MAX_VOLUME ? `Over ${MAX_VOLUME} m³ – outside IGEM/UP/1B domestic scope (use IGEM/UP/1A)` : 'Within IGEM/UP/1B domestic scope (≤ 0.035 m³)';
  const pd = permittedDrop({ meter, instType: get(d, 'inst.type'), appliancesConnected: get(d, 'inst.appliances'), gas: get(d, 'inst.gas') });
  if (d.t.mpdAuto !== false) d.t.mpd = String(pd.mpd);
  d.t.mpdNote = d.t.mpdAuto === false ? `Entered by engineer (table default: ${pd.mpd} mbar)` : pd.note;
  const res = /0\.01/.test(d.t.gauge || '') ? 0.01 : /0\.5/.test(d.t.gauge || '') ? 0.5 : 0.1;
  const r = tightnessResult({ start: d.t.start, end: d.t.end, mpd: d.t.mpd, smell: d.t.smell, resolution: res });
  d.t.drop = r.drop; d.t.result = r.result;
  d.p.volume = meter || pipes.length ? String(purgeVolume(meter, pipes)) : '';
}
function defaults(settings = {}) {
  const d = { customer: {}, property: {}, engineer: { ...(settings.engineer || {}) }, inst: { type: 'Existing', gas: 'Natural gas', meter: 'U6/G4 diaphragm', appliances: 'Yes' },
    vol: {}, t: { medium: 'Gas', gauge: 'Electronic (0.1 mbar)', testP: '20', stab: '1 minute', duration: '2 minutes' }, p: {}, issue: { date: today() }, pipes: [{ size: 'Copper 22mm', length: '' }], sigs: {} };
  compute(d); return d;
}
function check(d) {
  const { out, p } = checker();
  if (!get(d, 'customer.name')) p('bad', 'Customer name missing', 'details');
  if (!get(d, 'property.address')) p('bad', 'Property address missing', 'details');
  checkEngineer(d, p);
  if (!get(d, 'inst.meter')) p('bad', 'Meter type not set', 'test');
  if (!(d.pipes || []).some(x => parseFloat(x.length) > 0)) p('warn', 'No pipework lengths entered – volume is meter only', 'pipes');
  if (+get(d, 'vol.total') > MAX_VOLUME) p('warn', 'Installation volume over 0.035 m³ – outside IGEM/UP/1B domestic scope', 'test');
  if (['New', 'Extension'].includes(get(d, 'inst.type')) && !get(d, 't.strength')) p('warn', 'New/extended pipework – strength test result not recorded', 'test');
  if (!get(d, 't.letby')) p('warn', 'Let-by test not recorded', 'test');
  if (!get(d, 't.start') || !get(d, 't.end')) p('bad', 'Start and end pressures needed', 'test');
  if (!get(d, 't.smell')) p('bad', 'Smell of gas not answered', 'test');
  if (get(d, 't.result') === 'Fail') p('warn', 'Tightness test FAILED – find and repair the escape, then retest. Consider a warning notice.', 'test');
  if (!get(d, 'p.done')) p('warn', 'Purge not recorded', 'test');
  if (!get(d, 'issue.date')) p('bad', 'Test date missing', 'sign');
  checkSigs(d, p, SIGS); return out;
}
export const TIGHTNESS = { id: 'tightness', code: 'TT', title: 'Tightness test & purge record', short: 'Tightness & purge', icon: 'gauge', active: true, party: 'customer',
  SECTIONS, SIGS, compute, defaults, check,
  ROWS: { key: 'pipes', title: 'Pipe run', add: '＋ Add pipe run', fields: PIPE_FIELDS, newRow: () => ({ size: 'Copper 15mm', length: '' }) },
  TABS: [{ id: 'details', label: 'Details', icon: 'user', sections: ['customer', 'property', 'engineer'] }, { id: 'pipes', label: 'Pipework', icon: 'pipe', rows: true, sections: ['inst', 'vol'] },
    { id: 'test', label: 'Test', icon: 'gauge', sections: ['test', 'purge'] }, { id: 'sign', label: 'Sign', icon: 'sign', sections: ['issue'] }],
  summary: d => [firstLine(d.property?.address), d.customer?.name, d.t?.result && `Test: ${d.t.result}`].filter(Boolean).join(' · ') };
