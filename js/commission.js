// Boiler commissioning checklist (new boiler installation). Pure module. No third-party trademarks.
import { get, YN, YNA, PF, FLUES, plus12m } from './cp12.js';
import { party, propertySec, engineerSec, checker, checkEngineer, checkSigs, firstLine, today } from './common.js';

const SIGS = [{ k: 'engineer', l: 'Installer' }, { k: 'recipient', l: 'Customer' }];
const BOILER = [
  { k: 'make', l: 'Boiler make', t: 'text' }, { k: 'model', l: 'Model', t: 'text' }, { k: 'serial', l: 'Serial no.', t: 'text' },
  { k: 'gcNo', l: 'GC no.', t: 'text' }, { k: 'heatInput', l: 'Max heat input (kW)', t: 'num' }, { k: 'gasType', l: 'Gas type', t: 'seg', opts: ['Natural gas', 'LPG'] },
  { k: 'flue', l: 'Flue type', t: 'seg', opts: FLUES }, { k: 'location', l: 'Boiler location', t: 'text' } ];
const SECTIONS = [
  party('customer', 'Customer', 'Customer name'), propertySec(), engineerSec('Installer'),
  { id: 'sys', title: 'System', fields: [
    { k: 'sys.type', l: 'Boiler / system type', t: 'seg', opts: ['Combi', 'System', 'Regular'], al: ['system type', 'boiler type'] },
    { k: 'sys.job', l: 'Installation', t: 'seg', opts: ['New system', 'Replacement boiler'], al: ['installation', 'job'] },
    { k: 'sys.cylinder', l: 'Hot water cylinder', t: 'seg', opts: ['Unvented', 'Vented', 'None (combi)'], al: ['cylinder'] } ] },
  { id: 'water', title: 'Water treatment', fields: [
    { k: 'w.flushed', l: 'System flushed', t: 'seg', opts: YN, al: ['system flushed', 'flushed', 'flush'] },
    { k: 'w.method', l: 'Flushing method', t: 'list', opts: ['Power flush', 'Mains flush', 'Gravity flush', 'Chemical clean + flush'], al: ['flushing method', 'flush method'] },
    { k: 'w.cleanser', l: 'Cleanser used', t: 'text', al: ['cleanser', 'cleaner'] },
    { k: 'w.inhibitor', l: 'Inhibitor (name)', t: 'text', al: ['inhibitor name', 'inhibitor'] },
    { k: 'w.dosed', l: 'Inhibitor dosed to manufacturer’s level', t: 'seg', opts: YN, al: ['inhibitor dosed', 'dosed'] },
    { k: 'w.filter', l: 'System filter fitted', t: 'seg', opts: YN, al: ['filter fitted', 'magnetic filter', 'filter'] },
    { k: 'w.filterMake', l: 'Filter make', t: 'text', al: ['filter make'] },
    { k: 'w.hardness', l: 'Water hardness (ppm CaCO₃)', t: 'num', al: ['water hardness', 'hardness'] },
    { k: 'w.scale', l: 'Scale reducer fitted (if required)', t: 'seg', opts: YNA, al: ['scale reducer', 'scale'] } ] },
  { id: 'controls', title: 'Controls', fields: [
    { k: 'c.timeTemp', l: 'Time & temperature control to heating', t: 'seg', opts: YN, al: ['time and temperature', 'programmer', 'room thermostat'] },
    { k: 'c.trvs', l: 'TRVs fitted', t: 'seg', opts: YNA, al: ['trvs', 'thermostatic radiator valves'] },
    { k: 'c.interlock', l: 'Boiler interlock', t: 'seg', opts: YN, al: ['boiler interlock', 'interlock'] },
    { k: 'c.weather', l: 'Weather compensation', t: 'seg', opts: YNA, al: ['weather compensation', 'weather comp'] },
    { k: 'c.load', l: 'Load compensation', t: 'seg', opts: YNA, al: ['load compensation', 'load comp'] },
    { k: 'c.smart', l: 'Smart thermostat (auto-learning, optimisation)', t: 'seg', opts: YNA, al: ['smart thermostat', 'smart'] },
    { k: 'c.cylStat', l: 'Cylinder thermostat / HW time control', t: 'seg', opts: YNA, al: ['cylinder thermostat', 'cylinder stat'] } ] },
  { id: 'comb', title: 'Gas & combustion', fields: [
    { k: 'comb.inlet', l: 'Working inlet pressure (mbar)', t: 'num', al: ['inlet pressure', 'working pressure'] },
    { k: 'comb.gasRate', l: 'Gas rate (m³/h)', t: 'num', al: ['gas rate'] },
    { k: 'comb.gasRateKw', l: 'Gas rate (kW)', t: 'num', al: ['gas rate kw', 'kilowatts'] },
    { k: 'comb.burner', l: 'Burner pressure (mbar, if applicable)', t: 'num', al: ['burner pressure'] },
    { k: 'comb.coMax', l: 'CO at max rate (ppm)', t: 'num', al: ['co max rate', 'co max', 'max co', 'co high', 'co high fire'] },
    { k: 'comb.co2Max', l: 'CO₂ at max rate (%)', t: 'num', al: ['co2 max rate', 'co2 max', 'max co2', 'co2 high', 'co2 high fire'] },
    { k: 'comb.ratioMax', l: 'Ratio at max rate', t: 'num', ph: 'auto', al: ['ratio max', 'max ratio', 'ratio high'] },
    { k: 'comb.coMin', l: 'CO at min rate (ppm)', t: 'num', al: ['co min rate', 'co min', 'min co', 'co low', 'co low fire'] },
    { k: 'comb.co2Min', l: 'CO₂ at min rate (%)', t: 'num', al: ['co2 min rate', 'co2 min', 'min co2', 'co2 low', 'co2 low fire'] },
    { k: 'comb.ratioMin', l: 'Ratio at min rate', t: 'num', ph: 'auto', al: ['ratio min', 'min ratio', 'ratio low'] },
    { k: 'comb.tightness', l: 'Gas tightness test', t: 'seg', opts: PF, al: ['tightness test', 'tightness'] } ] },
  { id: 'dhw', title: 'Hot water (combi)', fields: [
    { k: 'dhw.flow', l: 'Max DHW flow rate (l/min)', t: 'num', al: ['flow rate', 'flow', 'dhw flow'] },
    { k: 'dhw.cold', l: 'Cold inlet temp (°C)', t: 'num', al: ['cold inlet', 'cold water temperature', 'cold'] },
    { k: 'dhw.hot', l: 'Hot water outlet temp (°C)', t: 'num', al: ['hot water temperature', 'outlet temperature', 'hot'] },
    { k: 'dhw.rise', l: 'Temperature rise (°C)', t: 'calc' },
    { k: 'dhw.mains', l: 'Mains pressure (bar)', t: 'num', al: ['mains pressure', 'mains'] } ] },
  { id: 'flueSec', title: 'Flue & condensate', fields: [
    { k: 'f.length', l: 'Flue length (m)', t: 'num', al: ['flue length'] },
    { k: 'f.terminal', l: 'Flue termination position satisfactory', t: 'seg', opts: PF, al: ['termination', 'terminal'] },
    { k: 'f.integrity', l: 'Flue integrity check', t: 'seg', opts: PF, al: ['flue integrity'] },
    { k: 'f.condensate', l: 'Condensate termination', t: 'list', opts: ['Internal drain', 'External drain', 'Soakaway', 'Condensate pump'], al: ['condensate termination', 'condensate'] },
    { k: 'f.condInsulated', l: 'External condensate ≥ 32mm / insulated', t: 'seg', opts: YNA, al: ['condensate insulated', 'insulated'] } ] },
  { id: 'handover', title: 'Handover', fields: [
    { k: 'h.explained', l: 'Boiler & controls operation explained', t: 'seg', opts: YN, al: ['explained', 'demonstrated'] },
    { k: 'h.manuals', l: 'Manuals left with customer', t: 'seg', opts: YN, al: ['manuals'] },
    { k: 'h.warranty', l: 'Warranty registration done / advised', t: 'seg', opts: YNA, al: ['warranty'] },
    { k: 'h.notifiable', l: 'Building regs notification', t: 'seg', opts: ['Done', 'To do', 'N/A'], al: ['building regs', 'notification'] },
    { k: 'h.notes', l: 'Notes', t: 'area', al: ['notes'] } ] },
  { id: 'issue', title: 'Issue', fields: [
    { k: 'issue.date', l: 'Commissioning date', t: 'date' }, { k: 'issue.nextDue', l: 'First service due', t: 'date', hint: 'Auto: + 12 months' },
    { k: 'issue.recipient', l: 'Customer name (handover)', t: 'text', al: ['customer signed', 'recipient'] } ] },
];
export function compute(d) { const c = parseFloat(get(d, 'dhw.cold')), h = parseFloat(get(d, 'dhw.hot')); (d.dhw ??= {}).rise = Number.isFinite(c) && Number.isFinite(h) ? String(+(h - c).toFixed(1)) : ''; }
function defaults(settings = {}) {
  const t = today(); return { customer: {}, property: {}, engineer: { ...(settings.engineer || {}) }, sys: {}, w: {}, c: {}, comb: {}, dhw: {}, f: {}, h: {},
    issue: { date: t, nextDue: plus12m(t) }, appliances: [{ gasType: 'Natural gas', flue: 'RS' }], sigs: {} };
}
function check(d) {
  const { out, p } = checker(); const b = d.appliances?.[0] || {};
  if (!get(d, 'customer.name')) p('bad', 'Customer name missing', 'details');
  if (!get(d, 'property.address') && !get(d, 'customer.address')) p('bad', 'Property address missing', 'details');
  checkEngineer(d, p);
  if (!b.make || !b.model) p('bad', 'Boiler make/model missing', 'appliances');
  if (!b.serial) p('warn', 'Boiler serial no. missing', 'appliances');
  if (!get(d, 'w.flushed')) p('bad', 'System flushed? not answered', 'system');
  if (get(d, 'w.dosed') !== 'Yes') p('warn', 'Inhibitor not confirmed as dosed', 'system');
  if (get(d, 'w.filter') !== 'Yes') p('warn', 'No system filter recorded', 'system');
  if (get(d, 'c.interlock') !== 'Yes') p('warn', 'Boiler interlock not confirmed', 'system');
  if (get(d, 'c.timeTemp') !== 'Yes') p('warn', 'Time & temperature control not confirmed', 'system');
  if (!get(d, 'comb.coMax') || !get(d, 'comb.co2Max')) p('bad', 'Combustion readings at max rate missing', 'combustion');
  if (!get(d, 'comb.coMin') || !get(d, 'comb.co2Min')) p('warn', 'Combustion readings at min rate missing', 'combustion');
  for (const k of ['comb.ratioMax', 'comb.ratioMin']) if (parseFloat(get(d, k)) > 0.004) p('warn', `${k.endsWith('Max') ? 'Max' : 'Min'} rate ratio ${get(d, k)} is high for a new condensing boiler – check manufacturer’s limits`, 'combustion');
  if (get(d, 'sys.type') === 'Combi' && !get(d, 'dhw.flow')) p('warn', 'Combi: DHW flow rate not recorded', 'combustion');
  if (!get(d, 'f.condensate')) p('warn', 'Condensate termination not recorded', 'combustion');
  if (get(d, 'h.explained') !== 'Yes') p('warn', 'Handover explanation not confirmed', 'sign');
  if (!get(d, 'issue.date')) p('bad', 'Commissioning date missing', 'sign');
  checkSigs(d, p, SIGS); return out;
}
export const COMMISSION = { id: 'commission', code: 'BC', title: 'Boiler commissioning checklist', short: 'Commissioning', icon: 'check', active: true, party: 'customer',
  SECTIONS, SIGS, defaults, check, compute, nextDue: ['issue.date', 'issue.nextDue'],
  sectionRatios: [['comb.coMax', 'comb.co2Max', 'comb.ratioMax'], ['comb.coMin', 'comb.co2Min', 'comb.ratioMin']],
  ROWS: { key: 'appliances', title: 'Boiler', fields: BOILER, badge: true, max: 1, newRow: () => ({ gasType: 'Natural gas' }) },
  TABS: [{ id: 'details', label: 'Details', icon: 'user', sections: ['customer', 'property', 'engineer'] }, { id: 'appliances', label: 'Boiler', icon: 'flame', rows: true, sections: ['sys'] },
    { id: 'system', label: 'System', icon: 'drop', sections: ['water', 'controls'] }, { id: 'combustion', label: 'Readings', icon: 'gauge', sections: ['comb', 'dhw', 'flueSec'] },
    { id: 'sign', label: 'Handover', icon: 'sign', sections: ['handover', 'issue'] }],
  summary: d => [firstLine(d.property?.address || d.customer?.address), d.customer?.name, [d.appliances?.[0]?.make, d.appliances?.[0]?.model].filter(Boolean).join(' ')].filter(Boolean).join(' · ') };
