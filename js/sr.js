// Robust transcript building for the Web Speech API. Pure module (unit tested).
// Android Chrome quirks handled: each result can contain the whole phrase so far (cumulative),
// interim and final copies of the same words, and results repeating after an auto-restart.
const norm = s => String(s || '').toLowerCase().replace(/[^\p{L}\p{N}\s.]/gu, ' ').replace(/\s+/g, ' ').trim();
const words = s => String(s || '').trim().split(/\s+/).filter(Boolean);

/** Join two transcript pieces, collapsing repeats/overlaps ("phone" + "phone 077" -> "phone 077"). */
export function joinSegments(a, b) {
  a = String(a || '').trim(); b = String(b || '').trim();
  if (!a) return b; if (!b) return a;
  const na = norm(a), nb = norm(b);
  if (nb.startsWith(na)) return b;                 // new piece repeats everything so far, plus more
  if (na.startsWith(nb) || na.endsWith(nb)) return a; // new piece is a repeat of what we have
  const aw = words(a), bw = words(b);
  for (let k = Math.min(aw.length, bw.length); k > 0; k--)
    if (norm(aw.slice(-k).join(' ')) === norm(bw.slice(0, k).join(' '))) return [...aw, ...bw.slice(k)].join(' ');
  return `${a} ${b}`;
}

/** Rebuild from event.results starting at index 0 every time: finals joined (deduped) + latest interim only. */
export function fromResults(results) {
  let final = '', interim = '';
  for (let i = 0; i < (results?.length || 0); i++) {
    const r = results[i]; const t = String(r?.[0]?.transcript || '').trim(); if (!t) continue;
    if (r.isFinal) { final = joinSegments(final, t); interim = ''; } else interim = t;
  }
  return { final, interim };
}

/** Across sessions (auto-restart after onend): committed text + current session. */
export class Dictation {
  constructor(start = '') { this.committed = String(start || '').trim(); this.session = { final: '', interim: '' }; }
  onResults(results) { this.session = fromResults(results); return this.text(); }
  /** What to show (includes in-progress words). */
  text() { return joinSegments(joinSegments(this.committed, this.session.final), this.session.interim); }
  /** Session ended: commit it (interim too – Android sometimes ends without a final) and reset. */
  endSession() { this.committed = this.text(); this.session = { final: '', interim: '' }; return this.committed; }
}

/** Android Chrome's continuous mode is buggy: use one-utterance sessions with auto-restart there. */
export const useContinuous = (ua = (typeof navigator !== 'undefined' ? navigator.userAgent : '')) => !/Android/i.test(ua);
