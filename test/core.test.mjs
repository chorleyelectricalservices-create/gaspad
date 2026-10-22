import test from 'node:test'; import assert from 'node:assert/strict';
import { plus12m, coRatio, check, defaults } from '../js/cp12.js';
import { normBadge, scanBadge, normGc, badgePlan, normForm } from '../js/ai.js';
import { allocateRef } from '../js/refno.js';
import { FORMS } from '../js/forms.js';

test('next due +12 months', () => { assert.equal(plus12m('2026-10-16'), '2027-10-16'); assert.equal(plus12m('2024-02-29'), '2025-02-28'); });
test('ratio', () => { assert.equal(coRatio(40, 9.1), '0.0004'); assert.equal(coRatio('', 9), ''); });
test('refs', () => { const a = allocateRef({ refPrefix: 'GAS', nextNumber: 1 }, [], new Date(2026, 9, 1), 'CP12'); assert.equal(a.ref, 'GAS-CP12-2610-0001'); });
test('registry: all five forms active with unique codes', () => { assert.equal(FORMS.filter(f => f.active).map(f => f.id).join(), 'cp12,service,warning,commission,tightness'); assert.equal(new Set(FORMS.map(f => f.code)).size, 5); });
test('checks flag unsafe without warning notice', () => {
  const d = defaults(); d.appliances[0] = { safe: 'No', type: 'Gas fire', location: 'Lounge' };
  assert.ok(check(d).some(x => /no warning notice/.test(x.msg)));
});
test('badge normalising', () => {
  const r = normBadge({ make: 'Worcester', model: 'Greenstar 30i', gcNo: '4731190', heatInput: '30.6 kW', gasType: 'G20', flue: 'C13', pressure: 'abc', unreadable: ['serial', 'junk'] });
  assert.equal(r.values.gcNo, '47-311-90'); assert.equal(r.values.heatInput, '30.6'); assert.equal(r.values.gasType, 'Natural gas'); assert.equal(r.values.flue, 'RS'); assert.equal(r.values.pressure, '');
  assert.deepEqual(r.unreadable, ['serial']); assert.equal(normGc('GC No 41-750-12'), '41-750-12');
});
test('badge plan fills blanks, does not tick changes', () => {
  const p = badgePlan({ make: 'Baxi', gasType: 'Natural gas' }, { make: 'Vaillant', model: 'ecoTEC', gasType: 'LPG' });
  assert.deepEqual(p.map(x => [x.k, x.on]), [['make', false], ['model', true], ['gasType', true]]);
});
test('scanBadge with mocked Gemini + retry on 503', async () => {
  let n = 0; const fetch = async (url, init) => { n++; assert.match(url, /generateContent/); assert.equal(init.headers['x-goog-api-key'], 'k');
    if (n === 1) return { ok: false, status: 503, text: async () => '{}' };
    return { ok: true, status: 200, text: async () => JSON.stringify({ candidates: [{ content: { parts: [{ text: '```json\n{"make":"Ideal","model":"Logic Combi 30","serial":"ABC123","flue":"room sealed","gasType":"Natural Gas"}\n```' }] } }] }) }; };
  const r = await scanBadge('data:image/jpeg;base64,AAAA', { fetch, key: 'k', online: true, delayScale: 0 });
  assert.equal(r.values.make, 'Ideal'); assert.equal(r.values.flue, 'RS'); assert.equal(n, 2);
});
test('no key error', async () => { await assert.rejects(scanBadge('data:image/jpeg;base64,AA', { key: '' }), e => e.code === 'nokey'); });
test('form import normalising', () => { const r = normForm({ landlord: { name: 'J Smith' }, appliances: [{ make: 'Baxi', safe: 'Y', spillage: 'ok', flue: 'OF' }], install: { tightness: 'pass' } });
  assert.equal(r.appliances[0].safe, 'Yes'); assert.equal(r.appliances[0].spillage, 'Pass'); assert.equal(r.install.tightness, 'Pass'); });
