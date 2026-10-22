// Gas Safety / Service Record (homeowner / non-landlord). Pure module.
import { get, YN, YNA, PF, FLUES, APPLIANCE_TYPES, plus12m } from './cp12.js';
import { party, propertySec, engineerSec, checker, checkEngineer, checkSigs, firstLine, today } from './common.js';

const SIGS = [{ k: 'engineer', l: 'Engineer' }, { k: 'recipient', l: 'Customer' }];
export const SERVICE_FIELDS = [
  { k: 'location', l: 'Location', t: 'text', ph: 'e.g. Kitchen' },
  { k: 'type', l: 'Appliance type', t: 'list', opts: APPLIANCE_TYPES },
  { k: 'make', l: 'Make', t: 'text' }, { k: 'model', l: 'Model', t: 'text' },
  { k: 'serial', l: 'Serial no.', t: 'text' }, { k: 'gcNo', l: 'GC no.', t: 'text', ph: 'e.g. 47-311-90' },
  { k: 'gasType', l: 'Gas type', t: 'seg', opts: ['Natural gas', 'LPG'] },
  { k: 'flue', l: 'Flue type', t: 'seg', opts: FLUES },
  { k: 'visual', l: 'Visual condition of appliance', t: 'seg', opts: PF, al: ['visual condition', 'visual', 'condition'] },
  { k: 'burner', l: 'Burner / injector cleaned & checked', t: 'seg', opts: YNA, al: ['burner', 'injector', 'burner cleaned'] },
  { k: 'heatExchanger', l: 'Heat exchanger', t: 'seg', opts: PF, al: ['heat exchanger'] },
  { k: 'seals', l: 'Seals / gaskets', t: 'seg', opts: PF, al: ['seals', 'gaskets', 'case seal'] },
  { k: 'fan', l: 'Fan', t: 'seg', opts: PF, al: ['fan'] },
  { k: 'condensate', l: 'Condensate trap / pipe', t: 'seg', opts: PF, al: ['condensate trap', 'condensate', 'trap'] },
  { k: 'expVessel', l: 'Expansion vessel pressure (bar)', t: 'num', al: ['expansion vessel', 'vessel pressure', 'vessel'] },
  { k: 'prv', l: 'Pressure relief valve', t: 'seg', opts: PF, al: ['pressure relief valve', 'relief valve', 'prv'] },
  { k: 'controls', l: 'Controls', t: 'seg', opts: PF, al: ['controls'] },
  { k: 'flueIntegrity', l: 'Flue integrity', t: 'seg', opts: PF, al: ['flue integrity', 'flue condition'] },
  { k: 'termination', l: 'Flue termination', t: 'seg', opts: PF, al: ['termination', 'terminal'] },
  { k: 'ventilation', l: 'Ventilation satisfactory', t: 'seg', opts: YNA },
  { k: 'pressure', l: 'Operating pressure (mbar)', t: 'num' },
  { k: 'heatInput', l: 'Heat input (kW)', t: 'num' },
  { k: 'coHigh', l: 'CO high fire (ppm)', t: 'num', al: ['co high fire', 'high fire co', 'co high', 'co max', 'max co'] },
  { k: 'co2High', l: 'CO₂ high fire (%)', t: 'num', al: ['co2 high fire', 'high fire co2', 'co2 high', 'co2 max', 'max co2'] },
  { k: 'ratioHigh', l: 'Ratio high fire', t: 'num', ph: 'auto', al: ['ratio high fire', 'high fire ratio', 'ratio high', 'max ratio'] },
  { k: 'coLow', l: 'CO low fire (ppm)', t: 'num', al: ['co low fire', 'low fire co', 'co low', 'co min', 'min co'] },
  { k: 'co2Low', l: 'CO₂ low fire (%)', t: 'num', al: ['co2 low fire', 'low fire co2', 'co2 low', 'co2 min', 'min co2'] },
  { k: 'ratioLow', l: 'Ratio low fire', t: 'num', ph: 'auto', al: ['ratio low fire', 'low fire ratio', 'ratio low', 'min ratio'] },
  { k: 'safetyDevice', l: 'Safety device(s) operation', t: 'seg', opts: PF },
  { k: 'safe', l: 'Appliance safe to use', t: 'seg', opts: YN },
  { k: 'notes', l: 'Appliance notes / defects', t: 'area' },
];
const SECTIONS = [
  party('customer', 'Customer', 'Customer name'), propertySec(), engineerSec(),
  { id: 'work', title: 'Work & recommendations', fields: [
    { k: 'work.carried', l: 'Work carried out', t: 'area', al: ['work carried out', 'work done', 'work'] },
    { k: 'work.parts', l: 'Parts fitted', t: 'area', al: ['parts fitted', 'parts'] },
    { k: 'work.recs', l: 'Recommendations', t: 'area', al: ['recommendations', 'recommend', 'advice'] },
    { k: 'work.pipework', l: 'Installation pipework visual satisfactory', t: 'seg', opts: YNA, al: ['pipework'] },
    { k: 'work.tightness', l: 'Tightness test', t: 'seg', opts: PF, al: ['tightness test', 'tightness'] },
    { k: 'work.coAlarm', l: 'CO alarm fitted & tested', t: 'seg', opts: YNA, al: ['co alarm', 'alarm'] },
    { k: 'work.warning', l: 'Warning notice issued', t: 'seg', opts: YNA, al: ['warning notice'] } ] },
  { id: 'issue', title: 'Issue', fields: [
    { k: 'issue.date', l: 'Service date', t: 'date' },
    { k: 'issue.nextDue', l: 'Next service due', t: 'date', hint: 'Auto: service date + 12 months (editable)' },
    { k: 'issue.recipient', l: 'Received by (name)', t: 'text', al: ['received by', 'recipient'] } ] },
];
function defaults(settings = {}) {
  const t = today(); return { customer: {}, property: {}, engineer: { ...(settings.engineer || {}) }, work: {}, issue: { date: t, nextDue: plus12m(t) },
    appliances: [{ gasType: 'Natural gas' }], sigs: {} };
}
function check(d) {
  const { out, p } = checker();
  if (!get(d, 'customer.name')) p('bad', 'Customer name missing', 'details');
  if (!get(d, 'property.address') && !get(d, 'customer.address')) p('bad', 'Property address missing', 'details');
  checkEngineer(d, p);
  const apps = d.appliances || []; if (!apps.length) p('bad', 'No appliances listed', 'appliances');
  apps.forEach((a, i) => { const nm = `Appliance ${i + 1}${a.location ? ` (${a.location})` : ''}`;
    if (!a.type && !a.make) p('bad', `${nm}: type/make missing`, 'appliances');
    if (!a.safe) p('bad', `${nm}: “safe to use” not answered`, 'appliances');
    const fails = ['visual', 'heatExchanger', 'seals', 'fan', 'condensate', 'prv', 'controls', 'flueIntegrity', 'termination', 'safetyDevice'].filter(k => a[k] === 'Fail');
    if (fails.length && a.safe === 'Yes') p('warn', `${nm}: has a failed check but marked safe`, 'appliances');
    for (const k of ['ratioHigh', 'ratioLow']) if (parseFloat(a[k]) > 0.008) p('warn', `${nm}: ${k === 'ratioHigh' ? 'high' : 'low'} fire ratio ${a[k]} is high – check manufacturer’s limits`, 'appliances');
    if (!a.coHigh && !a.coLow && a.type && !/fire|cooker|hob|oven/i.test(a.type)) p('warn', `${nm}: no combustion analysis recorded`, 'appliances'); });
  if (apps.some(a => a.safe === 'No') && get(d, 'work.warning') !== 'Yes') p('bad', 'Unsafe appliance – issue a warning notice (button on the appliance) and mark it issued', 'work');
  if (!get(d, 'work.carried')) p('warn', 'Work carried out not described', 'work');
  if (!get(d, 'issue.date')) p('bad', 'Service date missing', 'sign');
  checkSigs(d, p, SIGS); return out;
}
export const SERVICE = { id: 'service', code: 'SR', title: 'Gas safety / service record', short: 'Service record', icon: 'wrench', active: true, party: 'customer',
  SECTIONS, SIGS, defaults, check, nextDue: ['issue.date', 'issue.nextDue'],
  ROWS: { key: 'appliances', title: 'Appliance', add: '＋ Add appliance', fields: SERVICE_FIELDS, badge: true, warn: true, newRow: () => ({ gasType: 'Natural gas' }),
    ratios: [['coHigh', 'co2High', 'ratioHigh'], ['coLow', 'co2Low', 'ratioLow']] },
  TABS: [{ id: 'details', label: 'Details', icon: 'user', sections: ['customer', 'property', 'engineer'] }, { id: 'appliances', label: 'Appliances', icon: 'flame', rows: true },
    { id: 'work', label: 'Work', icon: 'wrench', sections: ['work'] }, { id: 'sign', label: 'Sign', icon: 'sign', sections: ['issue'] }],
  summary: d => [firstLine(d.property?.address || d.customer?.address), d.customer?.name].filter(Boolean).join(' · ') };
