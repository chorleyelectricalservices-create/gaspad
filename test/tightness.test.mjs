import test from 'node:test'; import assert from 'node:assert/strict';
import { PIPES, pipeVolume, installVolume, permittedDrop, tightnessResult, purgeVolume, compute, TIGHTNESS } from '../js/tightness.js';
const near = (a, b, e = 1e-5) => assert.ok(Math.abs(a - b) < e, `${a} ≈ ${b}`);
test('pipe volumes per metre from bores', () => { near(PIPES['Copper 22mm'], 0.00032); near(PIPES['Copper 15mm'], 0.000145); near(PIPES['Copper 28mm'], 0.00054); });
test('installation volume = meter + pipework', () => {
  const pipes = [{ size: 'Copper 22mm', length: '10' }, { size: 'Copper 15mm', length: '6' }];
  near(pipeVolume(pipes), 0.0032 + 0.00087, 2e-5); near(installVolume('U6/G4 diaphragm', pipes), 0.008 + 0.00407, 3e-5);
  near(installVolume('E6 ultrasonic', []), 0.0024);
  assert.equal(pipeVolume([{ size: 'Other', volPerM: '0.001', length: '3' }]), 0.003);
});
test('permitted drop table', () => {
  assert.equal(permittedDrop({ meter: 'U6/G4 diaphragm', instType: 'Existing', appliancesConnected: 'Yes' }).mpd, 4);
  assert.equal(permittedDrop({ meter: 'E6 ultrasonic', instType: 'Existing', appliancesConnected: 'Yes' }).mpd, 8);
  assert.equal(permittedDrop({ meter: 'U6/G4 diaphragm', instType: 'New', appliancesConnected: 'No' }).mpd, 0);
  assert.equal(permittedDrop({ meter: 'U6/G4 diaphragm', instType: 'Existing', gas: 'LPG' }).mpd, 0);
});
test('pass / fail', () => {
  assert.deepEqual(tightnessResult({ start: '20.0', end: '17.5', mpd: '4', smell: 'No' }), { drop: '2.5', result: 'Pass' });
  assert.equal(tightnessResult({ start: '20', end: '15.9', mpd: '4', smell: 'No' }).result, 'Fail');
  assert.equal(tightnessResult({ start: '20', end: '19', mpd: '4', smell: 'Yes' }).result, 'Fail'); // smell = fail
  assert.equal(tightnessResult({ start: '20', end: '20', mpd: '0', smell: 'No' }).result, 'Pass');
  assert.equal(tightnessResult({ start: '20', end: '19.9', mpd: '0', smell: 'No' }).result, 'Fail'); // perceptible on 0.1 gauge
  assert.equal(tightnessResult({ start: '20', end: '', mpd: '4' }).result, '');
});
test('purge volume', () => { near(purgeVolume('U6/G4 diaphragm', [{ size: 'Copper 22mm', length: '10' }]), 0.01 + 1.5 * 0.0032, 2e-5); });
test('compute() fills form + respects engineer override', () => {
  const d = TIGHTNESS.defaults({}); d.pipes = [{ size: 'Copper 22mm', length: '12' }]; d.t.start = '20'; d.t.end = '18'; d.t.smell = 'No'; compute(d);
  assert.equal(d.t.mpd, '4'); assert.equal(d.t.result, 'Pass'); assert.equal(d.t.drop, '2'); assert.ok(+d.vol.total > 0.01);
  d.t.mpdAuto = false; d.t.mpd = '1'; compute(d); assert.equal(d.t.result, 'Fail'); assert.match(d.t.mpdNote, /Entered by engineer/);
  d.pipes = [{ size: 'Steel 1" (DN25)', length: '60' }]; compute(d); assert.match(d.vol.note, /outside/);
});
