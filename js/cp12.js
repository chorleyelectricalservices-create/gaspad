// CP12 – Landlord Gas Safety Record (Gas Safety (Installation and Use) Regulations 1998, reg 36).
// Pure module: schema, defaults, calcs and checks. No DOM.

export const YN = ['Yes', 'No'];
export const YNA = ['Yes', 'No', 'N/A'];
export const PF = ['Pass', 'Fail', 'N/A'];
export const FLUES = ['OF', 'RS', 'BF', 'FL'];
export const FLUE_NAMES = { OF: 'Open flue', RS: 'Room sealed', BF: 'Balanced flue', FL: 'Flueless' };
export const APPLIANCE_TYPES = ['Combi boiler', 'System boiler', 'Regular boiler', 'Back boiler', 'Gas fire', 'Cooker', 'Hob', 'Oven', 'Water heater', 'Warm air heater', 'Tumble dryer', 'Range cooker', 'Other'];
export const GAS_TYPES = ['Natural gas', 'LPG', 'Butane', 'Propane'];

// Appliance row fields (k, label, type, opts, extra)
export const APPLIANCE_FIELDS = [
  { k: 'location', l: 'Location', t: 'text', ph: 'e.g. Kitchen' },
  { k: 'type', l: 'Appliance type', t: 'list', opts: APPLIANCE_TYPES },
  { k: 'make', l: 'Make', t: 'text' },
  { k: 'model', l: 'Model', t: 'text' },
  { k: 'serial', l: 'Serial no.', t: 'text' },
  { k: 'gcNo', l: 'GC no.', t: 'text', ph: 'e.g. 47-311-90' },
  { k: 'gasType', l: 'Gas type', t: 'seg', opts: ['Natural gas', 'LPG'] },
  { k: 'owned', l: 'Landlord’s appliance', t: 'seg', opts: YN },
  { k: 'inspected', l: 'Appliance inspected', t: 'seg', opts: YN },
  { k: 'flue', l: 'Flue type', t: 'seg', opts: FLUES },
  { k: 'pressure', l: 'Operating pressure (mbar)', t: 'num' },
  { k: 'heatInput', l: 'Heat input (kW)', t: 'num' },
  { k: 'safetyDevice', l: 'Safety device(s) operation', t: 'seg', opts: PF },
  { k: 'ventilation', l: 'Ventilation satisfactory', t: 'seg', opts: YNA },
  { k: 'flueVisual', l: 'Visual condition of flue/termination', t: 'seg', opts: PF },
  { k: 'spillage', l: 'Spillage test', t: 'seg', opts: PF },
  { k: 'flueFlow', l: 'Flue flow test', t: 'seg', opts: PF },
  { k: 'co', l: 'Combustion CO (ppm)', t: 'num' },
  { k: 'co2', l: 'Combustion CO₂ (%)', t: 'num' },
  { k: 'ratio', l: 'CO/CO₂ ratio', t: 'num', ph: 'auto from CO & CO₂' },
  { k: 'safe', l: 'Appliance safe to use', t: 'seg', opts: YN },
  { k: 'notes', l: 'Appliance notes / defects', t: 'area' },
];

// Main form sections (keys are dotted paths into job.data)
export const SECTIONS = [
  { id: 'landlord', title: 'Landlord', fields: [
    { k: 'landlord.name', l: 'Landlord name', t: 'text' },
    { k: 'landlord.company', l: 'Company (if agent)', t: 'text' },
    { k: 'landlord.address', l: 'Landlord address', t: 'addr' },
    { k: 'landlord.phone', l: 'Phone', t: 'tel' },
    { k: 'landlord.email', l: 'Email', t: 'email' } ] },
  { id: 'property', title: 'Property (installation address)', fields: [
    { k: 'property.tenant', l: 'Tenant name (optional)', t: 'text' },
    { k: 'property.address', l: 'Property address', t: 'addr' },
    { k: 'property.phone', l: 'Tenant phone (optional)', t: 'tel' } ] },
  { id: 'engineer', title: 'Engineer', fields: [
    { k: 'engineer.name', l: 'Engineer name', t: 'text' },
    { k: 'engineer.business', l: 'Business name', t: 'text' },
    { k: 'engineer.address', l: 'Business address', t: 'addr' },
    { k: 'engineer.phone', l: 'Phone', t: 'tel' },
    { k: 'engineer.regNo', l: 'Gas Safe reg no.', t: 'text', im: 'numeric' },
    { k: 'engineer.idCard', l: 'Engineer ID card no.', t: 'text', im: 'numeric' } ] },
  { id: 'install', title: 'Installation checks', fields: [
    { k: 'install.pipework', l: 'Gas installation pipework – visual inspection satisfactory', t: 'seg', opts: YNA },
    { k: 'install.tightness', l: 'Gas tightness test', t: 'seg', opts: PF },
    { k: 'install.tightnessDetail', l: 'Tightness test details (optional)', t: 'text', ph: 'e.g. 20 mbar, 2 min, 0 drop' },
    { k: 'install.ecv', l: 'Emergency control valve (ECV) accessible', t: 'seg', opts: YNA },
    { k: 'install.bonding', l: 'Protective equipotential bonding satisfactory', t: 'seg', opts: YNA },
    { k: 'install.coFitted', l: 'CO alarm(s) fitted', t: 'seg', opts: YNA },
    { k: 'install.coTested', l: 'CO alarm(s) tested and satisfactory', t: 'seg', opts: YNA },
    { k: 'install.coLocation', l: 'CO alarm location(s)', t: 'text' } ] },
  { id: 'defects', title: 'Defects & remedial action', fields: [
    { k: 'defects.found', l: 'Defects identified', t: 'area' },
    { k: 'defects.remedial', l: 'Remedial action taken', t: 'area' },
    { k: 'defects.warningIssued', l: 'Warning notice issued', t: 'seg', opts: YN },
    { k: 'defects.warningLabel', l: 'Warning label attached', t: 'seg', opts: YNA },
    { k: 'defects.warningCat', l: 'Classification', t: 'seg', opts: ['ID', 'AR', 'N/A'] },
    { k: 'defects.warningRef', l: 'Warning notice ref (optional)', t: 'text' } ] },
  { id: 'issue', title: 'Issue', fields: [
    { k: 'issue.date', l: 'Date of inspection / issue', t: 'date' },
    { k: 'issue.nextDue', l: 'Next safety check due by', t: 'date', hint: 'Auto: issue date + 12 months (editable)' },
    { k: 'issue.recipient', l: 'Received by (name)', t: 'text' },
    { k: 'issue.recipientRole', l: 'Recipient is', t: 'seg', opts: ['Landlord', 'Agent', 'Tenant'] } ] },
];

export const TABS = [
  { id: 'details', label: 'Details', sections: ['landlord', 'property', 'engineer'] },
  { id: 'appliances', label: 'Appliances' },
  { id: 'install', label: 'Checks', sections: ['install', 'defects'] },
  { id: 'sign', label: 'Sign & issue', sections: ['issue'] },
];

export const get = (o, path) => path.split('.').reduce((a, k) => (a == null ? a : a[k]), o);
export function set(o, path, v) { const ks = path.split('.'); let a = o; for (const k of ks.slice(0, -1)) a = a[k] ??= {}; a[ks.at(-1)] = v; }

export const isoDate = d => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
/** Issue date + 12 months (clamps 29 Feb / 31st to month end). */
export function plus12m(iso) {
  const m = String(iso || '').match(/^(\d{4})-(\d{2})-(\d{2})$/); if (!m) return '';
  const y = +m[1] + 1, mo = +m[2], d = +m[3]; const last = new Date(y, mo, 0).getDate();
  return `${y}-${m[2]}-${String(Math.min(d, last)).padStart(2, '0')}`;
}
/** CO/CO2 ratio, e.g. co=40 ppm, co2=9.1 % -> "0.0004" */
export function coRatio(co, co2) {
  const a = parseFloat(co), b = parseFloat(co2); if (!(a >= 0) || !(b > 0)) return '';
  const r = a / (b * 10000); return r.toFixed(4);
}
export function newAppliance() { return { gasType: 'Natural gas', owned: 'Yes', inspected: 'Yes' }; }

export function defaults(settings = {}) {
  const today = isoDate(new Date()); const e = settings.engineer || {};
  return { landlord: {}, property: {}, engineer: { ...e },
    install: {}, defects: {}, issue: { date: today, nextDue: plus12m(today), recipientRole: 'Landlord' },
    appliances: [newAppliance()], sigs: {} };
}

/** Problems that block/warn before issue. Returns [{lvl:'bad'|'warn', msg, tab}] */
export function check(d) {
  const out = []; const p = (lvl, msg, tab) => out.push({ lvl, msg, tab });
  if (!get(d, 'landlord.name')) p('bad', 'Landlord name missing', 'details');
  if (!get(d, 'property.address')) p('bad', 'Property address missing', 'details');
  if (!get(d, 'engineer.name')) p('bad', 'Engineer name missing', 'details');
  if (!/^\d{4,7}$/.test(String(get(d, 'engineer.regNo') || '').trim())) p('bad', 'Gas Safe reg no. missing or not a number', 'details');
  if (!get(d, 'engineer.idCard')) p('warn', 'Engineer ID card no. missing', 'details');
  const apps = d.appliances || [];
  if (!apps.length) p('bad', 'No appliances listed', 'appliances');
  apps.forEach((a, i) => {
    const n = `Appliance ${i + 1}${a.location ? ` (${a.location})` : ''}`;
    if (!a.type && !a.make) p('bad', `${n}: type/make missing`, 'appliances');
    if (!a.location) p('warn', `${n}: location missing`, 'appliances');
    if (!a.safe) p('bad', `${n}: “safe to use” not answered`, 'appliances');
    if (a.inspected === 'Yes' && !a.flue) p('warn', `${n}: flue type not set`, 'appliances');
    if (a.flue === 'OF' && a.inspected === 'Yes' && !a.spillage) p('warn', `${n}: open-flued – spillage test result missing`, 'appliances');
    const fails = ['safetyDevice', 'flueVisual', 'spillage', 'flueFlow'].filter(k => a[k] === 'Fail');
    if (fails.length && a.safe === 'Yes') p('warn', `${n}: has a failed check but marked safe`, 'appliances');
    const r = parseFloat(a.ratio); if (r > 0.008 && a.safe === 'Yes') p('warn', `${n}: CO/CO₂ ratio ${a.ratio} is high`, 'appliances');
  });
  const unsafe = apps.some(a => a.safe === 'No') || get(d, 'install.tightness') === 'Fail';
  if (!get(d, 'install.tightness')) p('warn', 'Tightness test result not recorded', 'install');
  if (unsafe && get(d, 'defects.warningIssued') !== 'Yes') p('bad', 'Unsafe item recorded but no warning notice issued', 'install');
  if (unsafe && !get(d, 'defects.found')) p('warn', 'Unsafe item recorded – describe the defect', 'install');
  if (!get(d, 'issue.date')) p('bad', 'Issue date missing', 'sign');
  if (!d.sigs?.engineer) p('bad', 'Engineer signature missing', 'sign');
  if (!d.sigs?.recipient) p('warn', 'Recipient signature missing', 'sign');
  return out;
}

export const CP12 = { id: 'cp12', code: 'CP12', title: 'Landlord Gas Safety Record (CP12)', short: 'CP12 / LGSR', icon: '🔥', active: true,
  SECTIONS, TABS, APPLIANCE_FIELDS, defaults, check,
  summary: d => [d.property?.address?.split('\n')[0], d.landlord?.name].filter(Boolean).join(' · ') };
