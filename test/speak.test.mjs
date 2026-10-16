import test from 'node:test'; import assert from 'node:assert/strict';
import { parseSpeech, fromGemini } from '../js/speak.js';
import { APPLIANCE_FIELDS, SECTIONS } from '../js/cp12.js';
const AF = APPLIANCE_FIELDS.map(f => ({ ...f, k: 'app.0.' + f.k }));
const sec = id => SECTIONS.find(s => s.id === id).fields;
const obj = rows => Object.fromEntries(rows.map(r => [r.k.split('.').pop(), r.val]));

test('Tom’s example', () => {
  assert.deepEqual(obj(parseSpeech('location kitchen, make Worcester, model 30si, flue type room sealed, CO 12, CO2 9.1, safe to use yes', AF)),
    { location: 'Kitchen', make: 'Worcester', model: '30SI', flue: 'RS', co: '12', co2: '9.1', safe: 'Yes' });
});
test('numbers as words, no commas, speech variants', () => {
  const r = obj(parseSpeech('make vaillant model ecotec plus 832 flu type open flue c o twelve c o two nine point one ratio nought point nought nought one three spillage test passed safe to use yes', AF));
  assert.equal(r.make, 'Vaillant'); assert.equal(r.flue, 'OF'); assert.equal(r.co, '12'); assert.equal(r.co2, '9.1'); assert.equal(r.ratio, '0.0013'); assert.equal(r.spillage, 'Pass'); assert.equal(r.safe, 'Yes');
  assert.equal(r.model, 'ECOTEC PLUS 832');
});
test('gas fire fail case', () => {
  const r = obj(parseSpeech('Location lounge. Appliance type gas fire. Operating pressure is 14. Spillage failed. Flue flow test fail. Ventilation not applicable. Safe to use no. Notes spillage at draught diverter', AF));
  assert.equal(r.location, 'Lounge'); assert.equal(r.type, 'Gas fire'); assert.equal(r.pressure, '14'); assert.equal(r.spillage, 'Fail'); assert.equal(r.flueFlow, 'Fail');
  assert.equal(r.ventilation, 'N/A'); assert.equal(r.safe, 'No'); assert.match(r.notes, /draught diverter/);
});
test('GC number, heat input, gas type, balanced flue', () => {
  const r = obj(parseSpeech('gc number 47 311 90 heat input thirty point six kilowatts gas type LPG flue balanced flue landlords appliance yes', AF));
  assert.equal(r.gcNo, '47-311-90'); assert.equal(r.heatInput, '30.6'); assert.equal(r.gasType, 'LPG'); assert.equal(r.flue, 'BF'); assert.equal(r.owned, 'Yes');
});
test('installation checks', () => {
  const r = obj(parseSpeech('pipework satisfactory, tightness test pass, ECV accessible yes, bonding no, CO alarm fitted yes, alarm tested yes, alarm location hallway', sec('install')));
  assert.deepEqual(r, { pipework: 'Yes', tightness: 'Pass', ecv: 'Yes', bonding: 'No', coFitted: 'Yes', coTested: 'Yes', coLocation: 'Hallway' });
});
test('landlord details', () => {
  const r = obj(parseSpeech('name jane smith, phone oh seven seven double oh one two three four five six, email jane at gmail dot com', sec('landlord')));
  assert.equal(r.name, 'Jane Smith'); assert.equal(r.phone.replace(/\s/g, ''), '07700123456'); assert.equal(r.email, 'jane@gmail.com');
});
test('property address with postcode', () => {
  const r = obj(parseSpeech('tenant bob jones address 22 park road, chorley, pr7 2bb', sec('property')));
  assert.equal(r.tenant, 'Bob Jones'); assert.equal(r.address, '22 Park Road\nChorley\nPR7 2BB');
});
test('defects / warning notice', () => {
  const r = obj(parseSpeech('defects gas fire spilling, remedial action capped and labelled, warning notice issued yes, warning label attached yes, classification immediately dangerous', sec('defects')));
  assert.equal(r.found, 'Gas fire spilling'); assert.equal(r.warningIssued, 'Yes'); assert.equal(r.warningLabel, 'Yes'); assert.equal(r.warningCat, 'ID');
});
test('Gemini mapping validated', () => {
  const r = fromGemini({ 'app.0.flue': 'room sealed', 'app.0.co': '12 ppm', 'app.0.safe': 'YES', 'app.0.bogus': 'x' }, AF);
  assert.deepEqual(obj(r), { flue: 'RS', co: '12', safe: 'Yes' });
});
