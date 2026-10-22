// Gas Warning Notice – unsafe situation (ID Immediately Dangerous / AR At Risk). Pure module.
// Follows the Gas Industry Unsafe Situations Procedure approach; no Gas Safe branding.
import { get, YN, YNA, FLUES, APPLIANCE_TYPES } from './cp12.js';
import { propertySec, engineerSec, checker, checkEngineer, checkSigs, firstLine, today } from './common.js';

const SIGS = [{ k: 'engineer', l: 'Engineer' }, { k: 'recipient', l: 'Responsible person', refusable: true }];
export const ESP_PHONE = '0800 111 999';
const SECTIONS = [
  { id: 'resp', title: 'Responsible person', fields: [
    { k: 'resp.name', l: 'Responsible person name', t: 'text', al: ['responsible person', 'customer name', 'name'] },
    { k: 'resp.role', l: 'Role', t: 'seg', opts: ['Owner', 'Landlord', 'Tenant', 'Agent', 'Occupier'], al: ['role'] },
    { k: 'resp.address', l: 'Address (if not the property)', t: 'addr' },
    { k: 'resp.phone', l: 'Phone', t: 'tel' } ] },
  propertySec(), engineerSec(),
  { id: 'notice', title: 'Unsafe situation', fields: [
    { k: 'notice.class', l: 'Classification', t: 'seg', opts: ['ID', 'AR'], al: ['classification', 'category', 'classed as'] },
    { k: 'notice.item', l: 'Unsafe item', t: 'seg', opts: ['Appliance', 'Pipework', 'Meter', 'Flue', 'Ventilation', 'Other'], al: ['unsafe item', 'item'] },
    { k: 'notice.defect', l: 'Nature of the defect', t: 'area', al: ['nature of defect', 'defect', 'fault'] },
    { k: 'notice.risk', l: 'Why it is unsafe / risk', t: 'area', al: ['risk', 'why unsafe', 'danger'] } ] },
  { id: 'actions', title: 'Actions taken', fields: [
    { k: 'act.turnedOff', l: 'Turned off', t: 'seg', opts: YNA, al: ['turned off', 'switched off'] },
    { k: 'act.disconnected', l: 'Disconnected / capped', t: 'seg', opts: YNA, al: ['disconnected', 'capped', 'isolated'] },
    { k: 'act.label', l: 'Warning label attached', t: 'seg', opts: YN, al: ['warning label', 'label attached', 'label'] },
    { k: 'act.agreed', l: 'Responsible person agreed to disconnection', t: 'seg', opts: ['Agreed', 'Refused', 'Not present'], al: ['agreed', 'permission'] },
    { k: 'act.esp', l: `Gas Emergency Service (${ESP_PHONE}) / transporter notified`, t: 'seg', opts: YNA, al: ['emergency service', 'national gas emergency', 'transporter', 'cadent'] },
    { k: 'act.espRef', l: 'Emergency service ref / time', t: 'text', al: ['emergency reference', 'job reference'] },
    { k: 'act.riddor', l: 'RIDDOR reportable (dangerous gas fitting, reg 11(2))', t: 'seg', opts: YN, al: ['riddor'] },
    { k: 'act.riddorRef', l: 'Reported to HSE by / ref', t: 'text', al: ['hse reference', 'riddor reference'] },
    { k: 'act.advice', l: 'Advice given to responsible person', t: 'area', al: ['advice given', 'advice'] } ] },
  { id: 'issue', title: 'Issue', fields: [
    { k: 'issue.date', l: 'Date', t: 'date' }, { k: 'issue.time', l: 'Time', t: 'text', im: 'numeric', ph: 'e.g. 14:30' },
    { k: 'issue.recipient', l: 'Notice given to (name)', t: 'text', al: ['given to', 'recipient'] },
    { k: 'issue.source', l: 'Related certificate ref', t: 'text' } ] },
];
const APP_FIELDS = [
  { k: 'location', l: 'Location', t: 'text' }, { k: 'type', l: 'Appliance type', t: 'list', opts: APPLIANCE_TYPES },
  { k: 'make', l: 'Make', t: 'text' }, { k: 'model', l: 'Model', t: 'text' }, { k: 'serial', l: 'Serial no.', t: 'text' }, { k: 'gcNo', l: 'GC no.', t: 'text' },
  { k: 'flue', l: 'Flue type', t: 'seg', opts: FLUES } ];
export const ID_TEXT = 'IMMEDIATELY DANGEROUS (ID): this gas installation/appliance is dangerous to life or property and has been disconnected from the gas supply. It must not be used or reconnected until the fault has been put right by a Gas Safe registered engineer. Using it, or allowing it to be used, may be an offence under the Gas Safety (Installation and Use) Regulations 1998.';
export const AR_TEXT = 'AT RISK (AR): one or more recognised faults could cause a danger in future. With your permission it has been turned off. It should not be used until the fault has been put right by a Gas Safe registered engineer.';
function defaults(settings = {}) {
  return { resp: {}, property: {}, engineer: { ...(settings.engineer || {}) }, notice: {}, act: {}, issue: { date: today(), time: new Date().toTimeString().slice(0, 5) }, appliances: [{}], sigs: {} };
}
/** Pre-fill a warning notice from an unsafe appliance on another certificate. */
export function fromUnsafe(srcJob, srcForm, i, settings = {}) {
  const d = defaults(settings); const s = srcJob.data; const pk = srcForm.party || 'landlord'; const a = (s.appliances || [])[i] || {};
  d.resp = { name: s[pk]?.name || '', address: s[pk]?.address || '', phone: s[pk]?.phone || '', role: pk === 'landlord' ? 'Landlord' : 'Owner' };
  d.property = { address: s.property?.address || s[pk]?.address || '' };
  d.engineer = { ...(settings.engineer || {}), ...Object.fromEntries(Object.entries(s.engineer || {}).filter(([, v]) => v)) };
  d.appliances = [Object.fromEntries(['location', 'type', 'make', 'model', 'serial', 'gcNo', 'flue'].filter(k => a[k]).map(k => [k, a[k]]))];
  d.notice = { item: 'Appliance', defect: a.notes || '' }; d.issue.source = srcJob.reportNo; d.sourceId = srcJob.id;
  return d;
}
function check(d) {
  const { out, p } = checker(); const cls = get(d, 'notice.class'), agreed = get(d, 'act.agreed');
  if (!get(d, 'resp.name')) p('bad', 'Responsible person name missing', 'details');
  if (!get(d, 'property.address')) p('bad', 'Property address missing', 'details');
  checkEngineer(d, p);
  if (!cls) p('bad', 'Classification (ID / AR) not set', 'notice');
  if (!get(d, 'notice.defect')) p('bad', 'Nature of the defect not described', 'notice');
  if (!get(d, 'act.label')) p('warn', 'Warning label attached? not answered', 'notice');
  if (!agreed) p('warn', 'Did the responsible person agree to disconnection?', 'notice');
  if (cls === 'ID' && agreed !== 'Refused' && get(d, 'act.disconnected') !== 'Yes') p('bad', 'ID: the installation/appliance should be disconnected (or record that permission was refused)', 'notice');
  if (cls === 'AR' && !get(d, 'act.turnedOff')) p('warn', 'AR: record whether it was turned off', 'notice');
  if (agreed === 'Refused' && get(d, 'act.esp') !== 'Yes') p('bad', `Permission refused – the Gas Emergency Service (${ESP_PHONE}) / transporter must be notified`, 'notice');
  if (cls === 'ID' && !get(d, 'act.riddor')) p('warn', 'ID: is it RIDDOR reportable? (answer the question)', 'notice');
  if (!get(d, 'issue.date')) p('bad', 'Date missing', 'sign');
  checkSigs(d, p, SIGS); return out;
}
export const WARNING = { id: 'warning', code: 'WN', title: 'Gas warning notice (ID / AR)', short: 'Warning notice', icon: 'warn', active: true, party: 'resp',
  SECTIONS, SIGS, defaults, check, fromUnsafe,
  ROWS: { key: 'appliances', title: 'Affected appliance', fields: APP_FIELDS, badge: true, max: 1, newRow: () => ({}) },
  TABS: [{ id: 'details', label: 'Details', icon: 'user', sections: ['resp', 'property', 'engineer'] }, { id: 'appliances', label: 'Appliance', icon: 'flame', rows: true },
    { id: 'notice', label: 'Notice', icon: 'warn', sections: ['notice', 'actions'] }, { id: 'sign', label: 'Sign', icon: 'sign', sections: ['issue'] }],
  summary: d => [d.notice?.class && `${d.notice.class}`, firstLine(d.property?.address), d.resp?.name].filter(Boolean).join(' · ') };
