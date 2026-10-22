import test from 'node:test'; import assert from 'node:assert/strict';
import { FORMS, formById } from '../js/forms.js';
import { parseSpeech } from '../js/speak.js';
import { fromUnsafe } from '../js/warning.js';
const obj = rows => Object.fromEntries(rows.map(r => [r.k, r.val]));
const secFields = (f, ...ids) => f.SECTIONS.filter(s => ids.includes(s.id)).flatMap(s => s.fields);
const rowFields = (f, i = 0) => f.ROWS.fields.map(x => ({ ...x, k: `app.${i}.${x.k}` }));

test('every form: tabs reference real sections, defaults pass through check()', () => {
  for (const f of FORMS) { const ids = new Set(f.SECTIONS.map(s => s.id));
    for (const t of f.TABS) for (const s of t.sections || []) assert.ok(ids.has(s), `${f.id}: tab ${t.id} → missing section ${s}`);
    const d = f.defaults({ engineer: { name: 'Tom' } }); assert.equal(d.engineer.name, 'Tom'); const c = f.check(d);
    assert.ok(c.some(x => x.lvl === 'bad'), `${f.id}: blank form should not be issuable`);
    for (const x of c) assert.ok(f.TABS.some(t => t.id === x.tab), `${f.id}: check points at unknown tab ${x.tab}`); }
});
test('service record dictation: high / low fire readings', () => {
  const f = formById('service');
  const r = obj(parseSpeech('make Vaillant heat exchanger pass seals pass fan pass expansion vessel 1 bar co high fire 45 co2 high fire 9.2 co low fire 20 co2 low fire 8.8 condensate trap pass safe to use yes', rowFields(f)));
  assert.equal(r['app.0.make'], 'Vaillant'); assert.equal(r['app.0.heatExchanger'], 'Pass'); assert.equal(r['app.0.seals'], 'Pass'); assert.equal(r['app.0.expVessel'], '1');
  assert.equal(r['app.0.coHigh'], '45'); assert.equal(r['app.0.co2High'], '9.2'); assert.equal(r['app.0.coLow'], '20'); assert.equal(r['app.0.co2Low'], '8.8'); assert.equal(r['app.0.condensate'], 'Pass'); assert.equal(r['app.0.safe'], 'Yes');
});
test('warning notice dictation', () => {
  const f = formById('warning');
  const r = obj(parseSpeech('classification immediately dangerous, unsafe item appliance, defect flue spilling products into room, turned off yes, disconnected yes, warning label yes, agreed refused, emergency service yes, riddor yes', secFields(f, 'notice', 'actions')));
  assert.equal(r['notice.class'], 'ID'); assert.equal(r['notice.item'], 'Appliance'); assert.match(r['notice.defect'], /spilling/); assert.equal(r['act.disconnected'], 'Yes');
  assert.equal(r['act.label'], 'Yes'); assert.equal(r['act.agreed'], 'Refused'); assert.equal(r['act.esp'], 'Yes'); assert.equal(r['act.riddor'], 'Yes');
});
test('warning: refused without emergency service blocks issue', () => {
  const f = formById('warning'); const d = f.defaults(); Object.assign(d.notice, { class: 'ID', defect: 'x' }); d.act.agreed = 'Refused';
  assert.ok(f.check(d).some(x => /Emergency Service/.test(x.msg) && x.lvl === 'bad')); d.act.esp = 'Yes'; assert.ok(!f.check(d).some(x => /Emergency Service/.test(x.msg)));
});
test('warning pre-filled from unsafe CP12 appliance', () => {
  const cp = formById('cp12'); const src = { id: 'x', reportNo: 'GAS-CP12-2610-0001', data: { ...cp.defaults(), landlord: { name: 'Jane', address: '1 High St' }, property: { address: '22 Park Rd' },
    appliances: [{ location: 'Lounge', type: 'Gas fire', make: 'Baxi', safe: 'No', notes: 'Spillage' }] } };
  const d = fromUnsafe(src, cp, 0); assert.equal(d.resp.name, 'Jane'); assert.equal(d.resp.role, 'Landlord'); assert.equal(d.property.address, '22 Park Rd');
  assert.equal(d.appliances[0].make, 'Baxi'); assert.equal(d.notice.defect, 'Spillage'); assert.equal(d.issue.source, 'GAS-CP12-2610-0001');
});
test('commissioning dictation', () => {
  const f = formById('commission');
  const r = obj(parseSpeech('system flushed yes flushing method power flush inhibitor name sentinel x100 inhibitor dosed yes filter fitted yes boiler interlock yes trvs yes weather compensation no', secFields(f, 'water', 'controls')));
  assert.equal(r['w.flushed'], 'Yes'); assert.equal(r['w.method'], 'Power flush'); assert.equal(r['w.inhibitor'], 'Sentinel x100'); assert.equal(r['w.dosed'], 'Yes');
  assert.equal(r['w.filter'], 'Yes'); assert.equal(r['c.interlock'], 'Yes'); assert.equal(r['c.trvs'], 'Yes'); assert.equal(r['c.weather'], 'No');
  const c = obj(parseSpeech('gas rate 2.1 co max 60 co2 max 9.4 co min 12 co2 min 8.9 flow rate 12 cold inlet 10 hot 50', secFields(f, 'comb', 'dhw')));
  assert.equal(c['comb.coMax'], '60'); assert.equal(c['comb.co2Max'], '9.4'); assert.equal(c['comb.coMin'], '12'); assert.equal(c['dhw.flow'], '12'); assert.equal(c['dhw.hot'], '50');
});
test('tightness dictation', () => {
  const f = formById('tightness');
  const r = obj(parseSpeech('meter type e6, installation existing, let by test pass, start pressure 20.4, end pressure 19.1, smell of gas no', secFields(f, 'inst', 'test')));
  assert.equal(r['inst.meter'], 'E6 ultrasonic'); assert.equal(r['inst.type'], 'Existing'); assert.equal(r['t.letby'], 'Pass'); assert.equal(r['t.start'], '20.4'); assert.equal(r['t.end'], '19.1'); assert.equal(r['t.smell'], 'No');
  const p = obj(parseSpeech('size copper 22 length 8.5', rowFields(f)));
  assert.equal(p['app.0.size'], 'Copper 22mm'); assert.equal(p['app.0.length'], '8.5');
});
