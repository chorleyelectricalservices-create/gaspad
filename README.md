# GasPad

Offline phone PWA for UK gas engineers (v2). Forms, each with its own ref code:

- **Landlord Gas Safety Record (CP12)** – GS(I&U)R 1998 reg 36
- **Service record (SR)** – per-appliance checks, high/low fire combustion, parts, next service due
- **Warning notice ID/AR (WN)** – RIDDOR flag, agreed/refused, emergency service notified; can be created pre-filled from an unsafe appliance
- **Boiler commissioning checklist (BC)** – not affiliated with any trademarked scheme
- **Tightness test & purge (TT)** – IGEM/UP/1B-style volume calc, permitted drop, pass/fail and purge volume. Default values in `js/tightness.js` must be checked against the current standard

- Data is stored on the phone (IndexedDB), with JSON backup and restore
- PDF is made on the phone (jsPDF)
- Voice dictation into any field
- Gemini photo reading (data badge scan per appliance, plus whole-form import) using your own key, which is kept on the phone only
- postcodes.io lookup, plus optional Ideal Postcodes or Postcoder keys

No Gas Safe Register branding is used.

**Adding a form:** create `js/<form>.js` exporting a FORM object like `CP12` in `js/cp12.js`. Register it in `js/forms.js` with `active: true`, add PDF_META in `js/pdf.js`, add the file to `sw.js` ASSETS and bump `VERSION`.

Tests: `npm test`. The PDF test runs when the `jspdf` and `jspdf-autotable` npm packages are available.
