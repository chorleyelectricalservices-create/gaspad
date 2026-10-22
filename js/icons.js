// Inline SVG icon set (stroke icons, currentColor). Keeps the app offline + crisp.
const P = {
  flame: '<path d="M12 3c1 3.5 5 5.5 5 10a5 5 0 0 1-10 0c0-2.2 1.2-3.6 2.3-4.8.3 1.6 1 2.6 2 3.1C11 9 11.2 5.7 12 3z"/>',
  wrench: '<path d="M14.7 6.3a4 4 0 0 0-5.4 5.2L3.6 17.2a1.6 1.6 0 0 0 2.3 2.3l5.7-5.7a4 4 0 0 0 5.2-5.4l-2.5 2.5-2.2-.6-.6-2.2 2.5-2.5z"/>',
  warn: '<path d="M10.3 3.9 2.4 17.6A2 2 0 0 0 4.1 20.6h15.8a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0z"/><path d="M12 9v4M12 17h.01"/>',
  check: '<rect x="3.5" y="3.5" width="17" height="17" rx="4"/><path d="m8 12.5 2.8 2.8L16.5 9"/>',
  gauge: '<path d="M4.5 18a8.5 8.5 0 1 1 15 0"/><path d="m12 13.5 4-5"/><circle cx="12" cy="14" r="1.3"/>',
  user: '<circle cx="12" cy="8" r="3.6"/><path d="M4.5 20a7.5 7.5 0 0 1 15 0"/>',
  sign: '<path d="M4 19c3-1 4-6 6-6s1 4 3 4 2-2 3-2 2 2 4 2"/><path d="m14 4 4 4-7 7H7v-4z"/>',
  pipe: '<path d="M3 8h8a3 3 0 0 1 3 3v10M3 12h7a0 0 0 0 1 0 0v9"/><path d="M14 13h7M14 9h7"/>',
  drop: '<path d="M12 3.5s6 6.3 6 10.5a6 6 0 0 1-12 0c0-4.2 6-10.5 6-10.5z"/>',
  plus: '<path d="M12 5v14M5 12h14"/>', mic: '<rect x="9" y="3" width="6" height="11" rx="3"/><path d="M5.5 11a6.5 6.5 0 0 0 13 0M12 17.5V21"/>',
  cam: '<path d="M4 8h3l2-2.5h6L17 8h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>', gear: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z"/>',
  next: '<path d="m9 6 6 6-6 6"/>', back: '<path d="m15 6-6 6 6 6"/>', copy: '<rect x="8" y="8" width="12" height="12" rx="2"/><path d="M16 8V5a1 1 0 0 0-1-1H5a1 1 0 0 0-1 1v10a1 1 0 0 0 1 1h3"/>',
  doc: '<path d="M14 3H7a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V8z"/><path d="M14 3v5h5M9 13h6M9 17h6"/>', tag: '<path d="M3 12V4h8l10 10-8 8z"/><circle cx="7.5" cy="8" r="1.4"/>',
};
export const icon = (n, cls = '') => `<svg class="ico ${cls}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${P[n] || P.doc}</svg>`;
// App mark (filled) – a clean flame in a rounded square. Not based on any registered scheme’s logo.
export const MARK = `<svg viewBox="0 0 64 64" aria-hidden="true"><defs><linearGradient id="gpg" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#fbbf24"/><stop offset="1" stop-color="#f97316"/></linearGradient></defs>
<path fill="url(#gpg)" d="M32 6c2.6 9.5 13.5 15 13.5 28.5a13.5 13.5 0 0 1-27 0c0-6 3.2-9.8 6.2-13 .8 4.3 2.7 7 5.4 8.3C29 22 30 13.5 32 6z"/><path fill="#fff7ed" d="M32 34c1.2 3.3 6 5 6 9.6a6 6 0 0 1-12 0c0-3.2 3.4-5.5 6-9.6z"/></svg>`;
