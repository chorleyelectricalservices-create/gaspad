import test from 'node:test'; import assert from 'node:assert/strict';
import { Dictation, fromResults, joinSegments } from '../js/sr.js';
import { parseSpeech } from '../js/speak.js'; import { SECTIONS } from '../js/cp12.js';
const R = (t, f = false) => Object.assign([{ transcript: t }], { isFinal: f });

test('Android cumulative finals: each result has the whole phrase so far', () => {
  const d = new Dictation();
  // results list grows; every entry repeats the earlier words
  const seq = [[R('phone')], [R('phone', true), R('phone 077')], [R('phone', true), R('phone 077', true), R('phone 07700 900')],
    [R('phone', true), R('phone 077', true), R('phone 07700 900', true), R('phone 07700 900 123', true)]];
  let shown; for (const s of seq) shown = d.onResults(s);
  assert.equal(shown, 'phone 07700 900 123'); assert.equal(d.endSession(), 'phone 07700 900 123');
});
test('interim + final duplicates of the same words', () => {
  assert.deepEqual(fromResults([R('make worcester', true), R('make worcester')]), { final: 'make worcester', interim: 'make worcester' });
  const d = new Dictation(); assert.equal(d.onResults([R('make worcester', true), R('make worcester')]), 'make worcester');
});
test('auto-restart after onend does not re-append', () => {
  const d = new Dictation();
  d.onResults([R('location kitchen', true)]); d.endSession();
  // new session: Android replays the last phrase then continues
  d.onResults([R('location kitchen make')]); d.onResults([R('location kitchen make worcester', true)]); d.endSession();
  d.onResults([R('make worcester flue type room sealed', true)]); // overlap with the end of committed text
  assert.equal(d.endSession(), 'location kitchen make worcester flue type room sealed');
});
test('desktop style (distinct segments) still joins normally', () => {
  const d = new Dictation(); d.onResults([R('location kitchen', true), R(' make worcester', true), R(' co 12')]);
  assert.equal(d.text(), 'location kitchen make worcester co 12');
});
test('session ending on interim only keeps the words', () => {
  const d = new Dictation(); d.onResults([R('safe to use yes')]); assert.equal(d.endSession(), 'safe to use yes');
});
test('the reported bug phrase parses to a whole phone number', () => {
  const d = new Dictation(); ['phone', 'phone 077', 'phone 077 00', 'phone 07700 900', 'phone 07700 900123'].forEach((t, i, a) => d.onResults(a.slice(0, i + 1).map((x, j) => R(x, j < i))));
  d.endSession();
  const rows = parseSpeech(d.committed, SECTIONS.find(s => s.id === 'landlord').fields);
  assert.equal(rows.find(r => r.k === 'landlord.phone').val.replace(/\s/g, ''), '07700900123');
});
test('phone numbers spoken with spaces / words stay whole', () => {
  const F = SECTIONS.find(s => s.id === 'landlord').fields; const ph = t => parseSpeech(t, F).find(r => r.k === 'landlord.phone')?.val.replace(/\s/g, '');
  assert.equal(ph('phone 077 00 900 123'), '07700900123'); assert.equal(ph('phone number 01257 123456 email bob at test dot com'), '01257123456');
  assert.equal(ph('phone oh seven seven double oh nine double oh one two three'), '07700900123'); assert.equal(ph('phone 07700-900-123'), '07700900123');
});
test('joinSegments overlap', () => { assert.equal(joinSegments('co 12 co2', 'co2 9.1'), 'co 12 co2 9.1'); });
