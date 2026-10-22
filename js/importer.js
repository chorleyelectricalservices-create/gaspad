// Whole-form photo import for any form: builds a Gemini prompt from the form schema and validates the reply.
import { fromGemini } from './speak.js';
const desc = f => `${f.l}${f.opts ? ` [${f.opts.join(' | ')}]` : f.t === 'num' ? ' [number]' : f.t === 'date' ? ' [YYYY-MM-DD]' : f.t === 'addr' ? ' [lines separated by \\n]' : ''}`;
export function importPrompt(form) {
  const secs = form.SECTIONS.flatMap(s => s.fields).filter(f => f.t !== 'calc');
  const rows = form.ROWS ? form.ROWS.fields.filter(f => f.t !== 'calc') : [];
  return `You are reading a photo or scan of UK gas paperwork (${form.title} or similar: job sheet, old certificate, data sheet).
Return ONLY JSON: {"fields":{"<key>":"<value>"}, "rows":[{"<rowkey>":"<value>"}]} including only values clearly legible. Never guess.
Form fields (key: label [allowed values]):
${secs.map(f => `${f.k}: ${desc(f)}`).join('\n')}
${rows.length ? `Each entry of "rows" is one ${form.ROWS.title.toLowerCase()} with keys:\n${rows.map(f => `${f.k}: ${desc(f)}`).join('\n')}` : 'There are no rows; return "rows":[].'}
Use the allowed values exactly. Flue: room sealed=RS, open flue=OF, balanced=BF, flueless=FL. Numbers as digits only. UK postcodes like PR7 1AB.`;
}
export function normImport(json, form) {
  const secs = form.SECTIONS.flatMap(s => s.fields).filter(f => f.t !== 'calc');
  const fields = fromGemini(json?.fields || {}, secs);
  const rowF = form.ROWS ? form.ROWS.fields.filter(f => f.t !== 'calc') : [];
  const rows = (Array.isArray(json?.rows) ? json.rows : []).map(r => Object.fromEntries(fromGemini(r, rowF).map(x => [x.k, x.val]))).filter(r => Object.keys(r).length);
  return { fields, rows: form.ROWS?.max ? rows.slice(0, form.ROWS.max) : rows };
}
