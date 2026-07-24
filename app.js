/* TheLabToolkit — bench calculator suite. All computation is client-side. */

/* ============================================================
   Small helpers
   ============================================================ */

const $  = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

const esc = (s) => String(s).replace(/[&<>"']/g, c =>
  ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

/** Format a number to `sig` significant figures, switching to exponential at the extremes. */
function fmt(x, sig = 4) {
  if (x === null || x === undefined || !isFinite(x)) return '—';
  if (x === 0) return '0';
  const a = Math.abs(x);
  if (a >= 1e6 || a < 1e-4) return x.toExponential(sig - 1);
  return String(Number(x.toPrecision(sig)));
}

/** Parse a field's value; returns NaN for blank so callers can treat blank as "unknown". */
function num(el) {
  if (!el) return NaN;
  const v = String(el.value).trim();
  if (v === '') return NaN;
  return Number(v);
}

const ok = (x) => typeof x === 'number' && isFinite(x);

/* ---------- unit tables ---------- */

const MASS = { kg: 1e3, g: 1, mg: 1e-3, 'µg': 1e-6, ng: 1e-9, pg: 1e-12 };
const VOL  = { L: 1, mL: 1e-3, 'µL': 1e-6, nL: 1e-9 };
const MOLAR = { M: 1, mM: 1e-3, 'µM': 1e-6, nM: 1e-9, pM: 1e-12 };
const MOLE = { mol: 1, mmol: 1e-3, 'µmol': 1e-6, nmol: 1e-9, pmol: 1e-12 };

/* Concentration units for the dilution tool, grouped by family so we can
   warn when someone mixes molar with mass/volume. */
const CONC = {
  M:        { f: 1,     fam: 'molar' },
  mM:       { f: 1e-3,  fam: 'molar' },
  'µM':     { f: 1e-6,  fam: 'molar' },
  nM:       { f: 1e-9,  fam: 'molar' },
  pM:       { f: 1e-12, fam: 'molar' },
  'mg/mL':  { f: 1,     fam: 'mass'  },
  'µg/mL':  { f: 1e-3,  fam: 'mass'  },
  'ng/mL':  { f: 1e-6,  fam: 'mass'  },
  '%':      { f: 1,     fam: 'pct'   },
  'X':      { f: 1,     fam: 'fold'  },
};

/** Pick a human-friendly unit for a value expressed in the table's base unit. */
function scale(value, table) {
  if (!ok(value) || value === 0) return { v: value, u: Object.keys(table)[0] };
  const entries = Object.entries(table).sort((a, b) => b[1] - a[1]);
  for (const [u, f] of entries) {
    if (Math.abs(value) >= f) return { v: value / f, u };
  }
  const last = entries[entries.length - 1];
  return { v: value / last[1], u: last[0] };
}

const showVol   = (L) => { const s = scale(L, VOL);   return `${fmt(s.v)} ${s.u}`; };
const showMass  = (g) => { const s = scale(g, MASS);  return `${fmt(s.v)} ${s.u}`; };
const showMolar = (M) => { const s = scale(M, MOLAR); return `${fmt(s.v)} ${s.u}`; };
const showMole  = (m) => { const s = scale(m, MOLE);  return `${fmt(s.v)} ${s.u}`; };

/* ---------- markup builders ---------- */

function unitSel(key, table, selected) {
  const opts = Object.keys(table)
    .map(u => `<option value="${esc(u)}"${u === selected ? ' selected' : ''}>${esc(u)}</option>`)
    .join('');
  return `<select data-k="${key}">${opts}</select>`;
}

/** A numeric input paired with a unit dropdown. */
function fieldUnit(label, key, table, unit, opts = {}) {
  return `<div class="field">
    <label for="f-${key}">${esc(label)}</label>
    <div class="input-row">
      <input id="f-${key}" data-k="${key}" type="number" step="any"
             placeholder="${esc(opts.placeholder || '')}" inputmode="decimal"
             value="${esc(opts.value ?? '')}">
      ${unitSel(key + 'U', table, unit)}
    </div>
    ${opts.hint ? `<div class="hint">${esc(opts.hint)}</div>` : ''}
  </div>`;
}

function fieldNum(label, key, opts = {}) {
  return `<div class="field">
    <label for="f-${key}">${esc(label)}</label>
    <input id="f-${key}" data-k="${key}" type="number" step="any"
           placeholder="${esc(opts.placeholder || '')}" inputmode="decimal"
           value="${esc(opts.value ?? '')}">
    ${opts.hint ? `<div class="hint">${esc(opts.hint)}</div>` : ''}
  </div>`;
}

function fieldSel(label, key, options, selected, opts = {}) {
  const body = options
    .map(o => {
      const [v, t] = Array.isArray(o) ? o : [o, o];
      return `<option value="${esc(v)}"${String(v) === String(selected) ? ' selected' : ''}>${esc(t)}</option>`;
    })
    .join('');
  return `<div class="field">
    <label for="f-${key}">${esc(label)}</label>
    <select id="f-${key}" data-k="${key}">${body}</select>
    ${opts.hint ? `<div class="hint">${esc(opts.hint)}</div>` : ''}
  </div>`;
}

function readout(cells) {
  return `<div class="readout">${cells
    .map(([k, v]) => `<div class="cell"><div class="k">${esc(k)}</div><div class="v">${v}</div></div>`)
    .join('')}</div>`;
}

const panel = (title, body) =>
  `<div class="panel">${title ? `<div class="panel-title">${esc(title)}</div>` : ''}${body}</div>`;

/* ============================================================
   Reference data
   ============================================================ */

/* Average residue masses, g/mol (residue = free amino acid minus water). */
const AA_MASS = {
  A: 71.0788, R: 156.1875, N: 114.1038, D: 115.0886, C: 103.1388,
  E: 129.1155, Q: 128.1307, G: 57.0519, H: 137.1411, I: 113.1594,
  L: 113.1594, K: 128.1741, M: 131.1926, F: 147.1766, P: 97.1167,
  S: 87.0782, T: 101.1051, W: 186.2132, Y: 163.1760, V: 99.1326,
};
const WATER = 18.01528;

const AA_NAMES = {
  A: 'Ala', R: 'Arg', N: 'Asn', D: 'Asp', C: 'Cys', E: 'Glu', Q: 'Gln',
  G: 'Gly', H: 'His', I: 'Ile', L: 'Leu', K: 'Lys', M: 'Met', F: 'Phe',
  P: 'Pro', S: 'Ser', T: 'Thr', W: 'Trp', Y: 'Tyr', V: 'Val',
};

/* Side-chain pKa values for isoelectric point estimation (Bjellqvist set, as used by
   ProtParam). Validated against published pI values for ubiquitin, lysozyme C and both
   insulin chains — agreement is within 0.25 pH units. */
const PKA = { cTerm: 3.55, nTerm: 7.50, D: 4.05, E: 4.45, C: 9.00, Y: 10.00, H: 5.98, K: 10.00, R: 12.00 };

/* SantaLucia (1998) unified nearest-neighbour parameters.
   dH in kcal/mol, dS in cal/(mol·K). */
const NN_DNA = {
  AA: [-7.9, -22.2], AT: [-7.2, -20.4], AC: [-8.4, -22.4], AG: [-7.8, -21.0],
  TA: [-7.2, -21.3], TT: [-7.9, -22.2], TC: [-8.2, -22.2], TG: [-8.5, -22.7],
  CA: [-8.5, -22.7], CT: [-7.8, -21.0], CC: [-8.0, -19.9], CG: [-10.6, -27.2],
  GA: [-8.2, -22.2], GT: [-8.4, -22.4], GC: [-9.8, -24.4], GG: [-8.0, -19.9],
};
const NN_INIT_GC = [0.1, -2.8];
const NN_INIT_AT = [2.3, 4.1];

/* Nearest-neighbour molar extinction coefficients at 260 nm, M⁻¹cm⁻¹. */
const NN_EXT = {
  AA: 27400, AC: 21200, AG: 25000, AT: 22800,
  CA: 21200, CC: 14600, CG: 18000, CT: 15200,
  GA: 25200, GC: 17600, GG: 21600, GT: 20000,
  TA: 23400, TC: 16200, TG: 19000, TT: 16800,
};
const MONO_EXT = { A: 15400, C: 7400, G: 11500, T: 8700 };

/* Anhydrous nucleotide residue masses for a 5'-OH oligo, g/mol. */
const DNA_MASS = { A: 313.21, C: 289.18, G: 329.21, T: 304.20 };

/* Common biological buffers: pKa at 25 °C plus MW of each form. */
const BUFFERS = [
  { name: 'Citrate (pKa3)', pka: 6.40, acid: 'Citric acid',        acidMW: 192.12, base: 'Trisodium citrate',   baseMW: 258.07 },
  { name: 'Acetate',        pka: 4.76, acid: 'Acetic acid',        acidMW: 60.05,  base: 'Sodium acetate',      baseMW: 82.03  },
  { name: 'MES',            pka: 6.15, acid: 'MES free acid',      acidMW: 195.24, base: 'MES sodium salt',     baseMW: 217.22 },
  { name: 'Bis-Tris',       pka: 6.50, acid: 'Bis-Tris·HCl',       acidMW: 245.70, base: 'Bis-Tris',            baseMW: 209.24 },
  { name: 'PIPES',          pka: 6.76, acid: 'PIPES free acid',    acidMW: 302.37, base: 'PIPES disodium',      baseMW: 346.33 },
  { name: 'Phosphate (pKa2)', pka: 7.20, acid: 'NaH₂PO₄',          acidMW: 119.98, base: 'Na₂HPO₄',             baseMW: 141.96 },
  { name: 'MOPS',           pka: 7.20, acid: 'MOPS free acid',     acidMW: 209.26, base: 'MOPS sodium salt',    baseMW: 231.25 },
  { name: 'HEPES',          pka: 7.55, acid: 'HEPES free acid',    acidMW: 238.30, base: 'HEPES sodium salt',   baseMW: 260.29 },
  { name: 'Tris',           pka: 8.06, acid: 'Tris·HCl',           acidMW: 157.60, base: 'Tris base',           baseMW: 121.14 },
  { name: 'Tricine',        pka: 8.15, acid: 'Tricine free acid',  acidMW: 179.17, base: 'Tricine sodium salt', baseMW: 201.16 },
  { name: 'Bicine',         pka: 8.35, acid: 'Bicine free acid',   acidMW: 163.17, base: 'Bicine sodium salt',  baseMW: 185.15 },
  { name: 'Glycine (pKa2)', pka: 9.60, acid: 'Glycine',            acidMW: 75.07,  base: 'Sodium glycinate',    baseMW: 97.05  },
  { name: 'CHES',           pka: 9.50, acid: 'CHES free acid',     acidMW: 207.29, base: 'CHES sodium salt',    baseMW: 229.27 },
  { name: 'CAPS',           pka: 10.40, acid: 'CAPS free acid',    acidMW: 221.32, base: 'CAPS sodium salt',    baseMW: 243.30 },
];

/* ============================================================
   Domain calculations
   ============================================================ */

/* Drop FASTA description lines before any letter-stripping — otherwise a header like
   ">sp|P0CG48|UBC_HUMAN" silently contributes S, P, P, C, G as residues. */
function stripFasta(s) {
  return String(s).split(/\r?\n/).filter(line => !/^\s*[>;]/.test(line)).join('\n');
}

function cleanProtein(s) {
  return stripFasta(s).toUpperCase().replace(/[^A-Z]/g, '').replace(/[BJOUXZ]/g, '');
}

function proteinStats(seq) {
  const s = cleanProtein(seq);
  const counts = {};
  for (const c of s) counts[c] = (counts[c] || 0) + 1;

  const mw = s.split('').reduce((t, c) => t + (AA_MASS[c] || 0), 0) + (s.length ? WATER : 0);

  const nW = counts.W || 0, nY = counts.Y || 0, nC = counts.C || 0;
  const nSS = Math.floor(nC / 2);

  // Pace et al. (1995): epsilon280 = nW*5500 + nY*1490 + nCystine*125
  const extReduced = nW * 5500 + nY * 1490;
  const extOxidised = extReduced + nSS * 125;

  return {
    seq: s, length: s.length, counts, mw,
    extReduced, extOxidised, nSS,
    e1Reduced: mw ? (extReduced / mw) * 10 : 0,   // A280 of a 1% (10 mg/mL) solution
    e1Oxidised: mw ? (extOxidised / mw) * 10 : 0,
    pI: isoelectricPoint(counts),
  };
}

/** Net charge of a protein at a given pH, from its ionisable group counts. */
function netCharge(counts, pH) {
  const pos = (n, pka) => n * (1 / (1 + Math.pow(10, pH - pka)));
  const neg = (n, pka) => -n * (1 / (1 + Math.pow(10, pka - pH)));
  return pos(1, PKA.nTerm) + pos(counts.K || 0, PKA.K) + pos(counts.R || 0, PKA.R) + pos(counts.H || 0, PKA.H)
       + neg(1, PKA.cTerm) + neg(counts.D || 0, PKA.D) + neg(counts.E || 0, PKA.E)
       + neg(counts.C || 0, PKA.C) + neg(counts.Y || 0, PKA.Y);
}

/** Bisection search for the pH at which net charge is zero. */
function isoelectricPoint(counts) {
  let lo = 0, hi = 14;
  for (let i = 0; i < 100; i++) {
    const mid = (lo + hi) / 2;
    if (netCharge(counts, mid) > 0) lo = mid; else hi = mid;
  }
  return (lo + hi) / 2;
}

const cleanDNA = (s) => stripFasta(s).toUpperCase().replace(/U/g, 'T').replace(/[^ACGT]/g, '');

const revComp = (s) => s.split('').reverse()
  .map(c => ({ A: 'T', T: 'A', G: 'C', C: 'G' }[c] || c)).join('');

function oligoStats(seq, opts) {
  const s = cleanDNA(seq);
  const n = s.length;
  if (n < 2) return null;

  const gc = (s.match(/[GC]/g) || []).length;
  const gcPct = (gc / n) * 100;

  // Nearest-neighbour enthalpy and entropy
  let dH = 0, dS = 0;
  for (let i = 0; i < n - 1; i++) {
    const p = NN_DNA[s.substr(i, 2)];
    if (p) { dH += p[0]; dS += p[1]; }
  }
  const initFor = (base) => (base === 'G' || base === 'C') ? NN_INIT_GC : NN_INIT_AT;
  for (const b of [s[0], s[n - 1]]) { const p = initFor(b); dH += p[0]; dS += p[1]; }

  // Effective monovalent salt: Mg²⁺ contributes via the von Ahsen approximation.
  const na = Math.max(opts.na, 0) / 1000;                       // mM -> M
  const mg = Math.max(opts.mg - opts.dntp, 0) / 1000;           // free Mg²⁺, M
  const naEq = Math.max(na + 120 * Math.sqrt(Math.max(mg, 0)), 1e-4);

  const dSsalt = dS + 0.368 * (n - 1) * Math.log(naEq);

  const R = 1.987;
  const ct = Math.max(opts.primerNM, 1e-6) * 1e-9;              // nM -> M
  const selfComp = s === revComp(s);
  const tmNN = (dH * 1000) / (dSsalt + R * Math.log(ct / (selfComp ? 1 : 4))) - 273.15;

  // Wallace rule, only meaningful for short oligos
  const tmWallace = 2 * (n - gc) + 4 * gc;

  // Marmur–Doty / Howley salt-adjusted GC formula
  const tmGC = 81.5 + 16.6 * Math.log10(naEq) + 0.41 * gcPct - 675 / n;

  // Extinction coefficient and mass
  let ext = 0;
  for (let i = 0; i < n - 1; i++) ext += NN_EXT[s.substr(i, 2)] || 0;
  for (let i = 1; i < n - 1; i++) ext -= MONO_EXT[s[i]] || 0;

  const mw = s.split('').reduce((t, c) => t + (DNA_MASS[c] || 0), 0) - 61.96;

  return {
    seq: s, length: n, gc, gcPct, dH, dS: dSsalt, tmNN, tmWallace, tmGC,
    ext, mw, naEq: naEq * 1000, selfComp, revComp: revComp(s),
  };
}

/* ============================================================
   Recipe parsing  (image / text  ->  structured components)
   ============================================================ */

/* Reagent reference table. Molecular weights in g/mol are textbook values.
   `phys` marks whether a component is normally measured as a solid mass or a liquid
   volume — this decides how a bare "%" is read and how the protocol is worded.
   `syn` lists the spellings the parser should recognise: formulae, salt forms and
   common names. A null MW means "known reagent, but weigh-out needs a user-supplied MW
   or a percentage" (polymers, proteins, ready-made saline stocks). */
const REAGENTS = [
  { name: 'Tris base',            mw: 121.14, phys: 'solid',  syn: ['Tris', 'Tris base', 'Trizma base', 'tromethamine', 'THAM'] },
  { name: 'Tris·HCl',             mw: 157.60, phys: 'solid',  syn: ['Tris-HCl', 'Tris HCl', 'Tris hydrochloride', 'Trizma HCl'] },
  { name: 'NaCl',                 mw: 58.44,  phys: 'solid',  syn: ['NaCl', 'sodium chloride'] },
  { name: 'KCl',                  mw: 74.55,  phys: 'solid',  syn: ['KCl', 'potassium chloride'] },
  { name: 'LiCl',                 mw: 42.39,  phys: 'solid',  syn: ['LiCl', 'lithium chloride'] },
  { name: 'MgCl₂',                mw: 95.21,  phys: 'solid',  syn: ['MgCl2', 'magnesium chloride', 'MgCl2 anhydrous'] },
  { name: 'MgCl₂·6H₂O',           mw: 203.30, phys: 'solid',  syn: ['MgCl2·6H2O', 'MgCl2 hexahydrate', 'magnesium chloride hexahydrate'] },
  { name: 'CaCl₂',                mw: 110.98, phys: 'solid',  syn: ['CaCl2', 'calcium chloride'] },
  { name: 'CaCl₂·2H₂O',           mw: 147.01, phys: 'solid',  syn: ['CaCl2·2H2O', 'calcium chloride dihydrate'] },
  { name: 'MnCl₂',                mw: 125.84, phys: 'solid',  syn: ['MnCl2', 'manganese chloride'] },
  { name: 'ZnCl₂',                mw: 136.29, phys: 'solid',  syn: ['ZnCl2', 'zinc chloride'] },
  { name: 'EDTA',                 mw: 292.24, phys: 'solid',  syn: ['EDTA', 'EDTA free acid', 'ethylenediaminetetraacetic acid'] },
  { name: 'EDTA disodium',        mw: 372.24, phys: 'solid',  syn: ['EDTA disodium', 'EDTA·2Na', 'Na2EDTA', 'disodium EDTA', 'EDTA disodium dihydrate'] },
  { name: 'EGTA',                 mw: 380.35, phys: 'solid',  syn: ['EGTA'] },
  { name: 'HEPES',                mw: 238.30, phys: 'solid',  syn: ['HEPES'] },
  { name: 'MOPS',                 mw: 209.26, phys: 'solid',  syn: ['MOPS'] },
  { name: 'MES',                  mw: 195.24, phys: 'solid',  syn: ['MES'] },
  { name: 'PIPES',                mw: 302.37, phys: 'solid',  syn: ['PIPES'] },
  { name: 'Bis-Tris',             mw: 209.24, phys: 'solid',  syn: ['Bis-Tris', 'BisTris'] },
  { name: 'Tricine',              mw: 179.17, phys: 'solid',  syn: ['Tricine'] },
  { name: 'Bicine',               mw: 163.17, phys: 'solid',  syn: ['Bicine'] },
  { name: 'CHES',                 mw: 207.29, phys: 'solid',  syn: ['CHES'] },
  { name: 'CAPS',                 mw: 221.32, phys: 'solid',  syn: ['CAPS'] },
  { name: 'TAPS',                 mw: 243.28, phys: 'solid',  syn: ['TAPS'] },
  { name: 'Glycine',              mw: 75.07,  phys: 'solid',  syn: ['glycine', 'Gly'] },
  { name: 'Imidazole',            mw: 68.08,  phys: 'solid',  syn: ['imidazole'] },
  { name: 'DTT',                  mw: 154.25, phys: 'solid',  syn: ['DTT', 'dithiothreitol', "Cleland's reagent"] },
  { name: 'TCEP·HCl',             mw: 286.65, phys: 'solid',  syn: ['TCEP', 'TCEP-HCl', 'tris(2-carboxyethyl)phosphine'] },
  { name: 'β-mercaptoethanol',    mw: 78.13,  phys: 'liquid', syn: ['BME', 'β-ME', 'b-ME', '2-mercaptoethanol', 'beta-mercaptoethanol', '2ME', 'mercaptoethanol'] },
  { name: 'Glutathione (reduced)', mw: 307.32, phys: 'solid', syn: ['GSH', 'reduced glutathione', 'glutathione'] },
  { name: 'Glutathione (oxidised)', mw: 612.63, phys: 'solid', syn: ['GSSG', 'oxidized glutathione', 'oxidised glutathione'] },
  { name: 'SDS',                  mw: 288.38, phys: 'solid',  syn: ['SDS', 'sodium dodecyl sulfate', 'sodium dodecyl sulphate', 'lauryl sulfate'] },
  { name: 'Urea',                 mw: 60.06,  phys: 'solid',  syn: ['urea'] },
  { name: 'Guanidine·HCl',        mw: 95.53,  phys: 'solid',  syn: ['GuHCl', 'GdnHCl', 'guanidine hydrochloride', 'guanidinium chloride', 'guanidine HCl'] },
  { name: 'Guanidine thiocyanate', mw: 118.16, phys: 'solid', syn: ['GdnSCN', 'guanidinium thiocyanate', 'guanidine thiocyanate'] },
  { name: 'Sucrose',              mw: 342.30, phys: 'solid',  syn: ['sucrose'] },
  { name: 'Glucose',              mw: 180.16, phys: 'solid',  syn: ['glucose', 'dextrose', 'D-glucose'] },
  { name: 'Glycerol',             mw: 92.09,  phys: 'liquid', syn: ['glycerol', 'glycerine', 'glycerin'] },
  { name: 'NaH₂PO₄',              mw: 119.98, phys: 'solid',  syn: ['NaH2PO4', 'sodium phosphate monobasic', 'monosodium phosphate', 'sodium dihydrogen phosphate'] },
  { name: 'Na₂HPO₄',              mw: 141.96, phys: 'solid',  syn: ['Na2HPO4', 'sodium phosphate dibasic', 'disodium hydrogen phosphate', 'sodium phosphate'] },
  { name: 'KH₂PO₄',              mw: 136.09, phys: 'solid',  syn: ['KH2PO4', 'potassium phosphate monobasic', 'monopotassium phosphate'] },
  { name: 'K₂HPO₄',              mw: 174.18, phys: 'solid',  syn: ['K2HPO4', 'potassium phosphate dibasic', 'potassium phosphate'] },
  { name: 'Sodium acetate',       mw: 82.03,  phys: 'solid',  syn: ['sodium acetate', 'NaOAc', 'NaAc'] },
  { name: 'Acetic acid',          mw: 60.05,  phys: 'liquid', syn: ['acetic acid', 'AcOH', 'glacial acetic acid'] },
  { name: 'Potassium acetate',    mw: 98.14,  phys: 'solid',  syn: ['potassium acetate', 'KOAc'] },
  { name: 'Ammonium sulfate',     mw: 132.14, phys: 'solid',  syn: ['ammonium sulfate', 'ammonium sulphate', '(NH4)2SO4'] },
  { name: 'Ammonium bicarbonate', mw: 79.06,  phys: 'solid',  syn: ['ammonium bicarbonate', 'ambic', 'NH4HCO3'] },
  { name: 'Ammonium acetate',     mw: 77.08,  phys: 'solid',  syn: ['ammonium acetate', 'NH4OAc'] },
  { name: 'Ammonium chloride',    mw: 53.49,  phys: 'solid',  syn: ['ammonium chloride', 'NH4Cl'] },
  { name: 'Sodium bicarbonate',   mw: 84.01,  phys: 'solid',  syn: ['sodium bicarbonate', 'NaHCO3', 'sodium hydrogen carbonate'] },
  { name: 'Sodium carbonate',     mw: 105.99, phys: 'solid',  syn: ['sodium carbonate', 'Na2CO3'] },
  { name: 'Sodium sulfate',       mw: 142.04, phys: 'solid',  syn: ['sodium sulfate', 'sodium sulphate', 'Na2SO4'] },
  { name: 'Trisodium citrate',    mw: 294.10, phys: 'solid',  syn: ['sodium citrate', 'trisodium citrate', 'sodium citrate dihydrate'] },
  { name: 'Citric acid',          mw: 192.12, phys: 'solid',  syn: ['citric acid'] },
  { name: 'NaOH',                 mw: 40.00,  phys: 'solid',  syn: ['NaOH', 'sodium hydroxide'] },
  { name: 'KOH',                  mw: 56.11,  phys: 'solid',  syn: ['KOH', 'potassium hydroxide'] },
  { name: 'HCl',                  mw: 36.46,  phys: 'liquid', syn: ['HCl', 'hydrochloric acid'] },
  { name: 'Triton X-100',         mw: 647.0,  phys: 'liquid', syn: ['Triton X-100', 'Triton', 'TritonX100'] },
  { name: 'Tween-20',             mw: 1227.5, phys: 'liquid', syn: ['Tween-20', 'Tween 20', 'Tween', 'polysorbate 20'] },
  { name: 'NP-40',                mw: null,   phys: 'liquid', syn: ['NP-40', 'NP40', 'Nonidet P-40', 'Nonidet'] },
  { name: 'CHAPS',                mw: 614.88, phys: 'solid',  syn: ['CHAPS'] },
  { name: 'Sodium deoxycholate',  mw: 414.55, phys: 'solid',  syn: ['sodium deoxycholate', 'deoxycholate', 'DOC'] },
  { name: 'PMSF',                 mw: 174.19, phys: 'solid',  syn: ['PMSF', 'phenylmethylsulfonyl fluoride'] },
  { name: 'DMSO',                 mw: 78.13,  phys: 'liquid', syn: ['DMSO', 'dimethyl sulfoxide'] },
  { name: 'Ethanol',              mw: 46.07,  phys: 'liquid', syn: ['ethanol', 'EtOH'] },
  { name: 'Methanol',             mw: 32.04,  phys: 'liquid', syn: ['methanol', 'MeOH'] },
  { name: 'Isopropanol',          mw: 60.10,  phys: 'liquid', syn: ['isopropanol', 'IPA', '2-propanol', 'isopropyl alcohol'] },
  { name: 'PEG 8000',             mw: null,   phys: 'solid',  syn: ['PEG', 'PEG 8000', 'PEG-8000', 'polyethylene glycol'] },
  { name: 'BSA',                  mw: null,   phys: 'solid',  syn: ['BSA', 'bovine serum albumin'] },
  { name: 'ATP disodium',         mw: 605.19, phys: 'solid',  syn: ['ATP', 'ATP disodium', 'adenosine triphosphate'] },
  { name: 'NaF',                  mw: 41.99,  phys: 'solid',  syn: ['NaF', 'sodium fluoride'] },
  { name: 'Sodium orthovanadate', mw: 183.91, phys: 'solid',  syn: ['Na3VO4', 'sodium orthovanadate', 'orthovanadate', 'vanadate'] },
  { name: 'β-glycerophosphate',   mw: 216.04, phys: 'solid',  syn: ['β-glycerophosphate', 'beta-glycerophosphate', 'glycerophosphate'] },
  { name: 'Sodium azide',         mw: 65.01,  phys: 'solid',  syn: ['sodium azide', 'NaN3'] },
  { name: 'IPTG',                 mw: 238.31, phys: 'solid',  syn: ['IPTG', 'isopropyl thiogalactoside'] },
  { name: 'L-arginine',           mw: 174.20, phys: 'solid',  syn: ['arginine', 'L-arginine', 'Arg'] },
  { name: 'L-proline',            mw: 115.13, phys: 'solid',  syn: ['proline', 'L-proline'] },
  { name: 'Betaine',              mw: 117.15, phys: 'solid',  syn: ['betaine'] },
  { name: 'Trehalose',            mw: 378.33, phys: 'solid',  syn: ['trehalose', 'trehalose dihydrate'] },
  { name: 'Mannitol',             mw: 182.17, phys: 'solid',  syn: ['mannitol'] },
  { name: 'Sorbitol',             mw: 182.17, phys: 'solid',  syn: ['sorbitol'] },
  { name: 'PBS',                  mw: null,   phys: 'stock',  syn: ['PBS', 'phosphate buffered saline'] },
  { name: 'TBS',                  mw: null,   phys: 'stock',  syn: ['TBS', 'tris buffered saline'] },
];

const normKey = (s) => String(s).toLowerCase().replace(/µ/g, 'u').replace(/×/g, 'x').replace(/[^a-z0-9]/g, '');

let _reagentIndex = null;
function reagentIndex() {
  if (_reagentIndex) return _reagentIndex;
  _reagentIndex = [];
  for (const r of REAGENTS) for (const s of r.syn) _reagentIndex.push([normKey(s), r]);
  _reagentIndex.sort((a, b) => b[0].length - a[0].length);   // longest (most specific) first
  return _reagentIndex;
}

/** Match a free-text reagent name to the reference table. Tries exact normalised match,
    then longest-synonym-contained-in-name, then name-contained-in-synonym. */
function matchReagent(name) {
  const n = normKey(name);
  if (n.length < 2) return null;
  const idx = reagentIndex();
  for (const [k, r] of idx) if (k === n) return r;
  for (const [k, r] of idx) if (k.length >= 3 && n.includes(k)) return r;
  for (const [k, r] of idx) if (n.length >= 3 && k.includes(n)) return r;
  return null;
}

const RECIPE_UNITS = ['M', 'mM', 'µM', 'nM', 'pM', '% w/v', '% v/v', '%', 'mg/mL', 'µg/mL', 'ng/mL', 'g/L', 'X'];

function normalizeUnit(u) {
  const s = String(u).toLowerCase().replace(/µ/g, 'u').replace(/μ/g, 'u').replace(/\s|\(|\)/g, '');
  if (s === 'm') return 'M';
  if (s === 'mm') return 'mM';
  if (s === 'um') return 'µM';
  if (s === 'nm') return 'nM';
  if (s === 'pm') return 'pM';
  if (s[0] === '%') {
    if (s.includes('v/v')) return '% v/v';
    if (s.includes('w/v')) return '% w/v';
    if (s.includes('w/w')) return '% w/w';
    return '%';
  }
  if (s === 'x' || s === '×') return 'X';
  if (s === 'mg/ml') return 'mg/mL';
  if (s === 'ug/ml') return 'µg/mL';
  if (s === 'ng/ml') return 'ng/mL';
  if (s === 'g/l') return 'g/L';
  return u;
}

/* The unit alternatives, ordered so that multi-character tokens win over their prefixes
   (mM before M, % w/v before %). Applied case-insensitively, anywhere in a line. */
const CONC_RE = /(\d*\.?\d+)\s*(mg\/m[l]|µg\/m[l]|ug\/m[l]|ng\/m[l]|g\/[l]|mM|µM|uM|μM|nM|pM|M|%\s*\(?\s*[wv]\/[wv]\s*\)?|%|X|×)(?![A-Za-z])/i;

/** Parse a single free-text line into one component, or null if there's nothing to parse. */
function parseComponentLine(line) {
  let s = String(line).trim();
  if (!s) return null;
  s = s.replace(/^\s*(?:\d+[).]|[-*•·—])\s+/, '');           // list markers

  let pH = null;
  s = s.replace(/pH\s*=?\s*(\d*\.?\d+)/i, (_, v) => { pH = Number(v); return ' '; });

  let conc = null, unit = null;
  const m = s.match(CONC_RE);
  if (m) {
    conc = Number(m[1]);
    unit = normalizeUnit(m[2]);
    s = s.slice(0, m.index) + ' ' + s.slice(m.index + m[0].length);
  }

  let name = s
    .replace(/\b(final|conc\.?|concentration|of|in|to|stock|add)\b/gi, ' ')
    .replace(/\(?\s*[wv]\/[wv]\s*\)?/gi, ' ')
    .replace(/[,:;]+/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s\-–—]+|[\s\-–—.]+$/g, '')
    .trim();

  if (!name && conc === null) return null;

  const matched = name ? matchReagent(name) : null;
  return {
    raw: line,
    name: matched ? matched.name : name,
    inputName: name,
    conc, unit, pH,
    mw: matched ? matched.mw : null,
    phys: matched ? matched.phys : 'solid',
    matched: !!matched,
  };
}

/** Parse a whole block of text (a pasted recipe or OCR output) into components.
    Splits on newlines and semicolons; a trailing-colon line with no number is treated
    as a section title rather than a component. */
function parseBufferText(text) {
  const out = { title: '', components: [] };
  const chunks = String(text).split(/[\n;]+/);
  for (const chunk of chunks) {
    const t = chunk.trim();
    if (!t) continue;
    if (/:\s*$/.test(t) && !CONC_RE.test(t)) {           // "Buffer A:" style heading
      if (!out.title) out.title = t.replace(/:\s*$/, '').trim();
      continue;
    }
    const c = parseComponentLine(t);
    if (c) out.components.push(c);
  }
  return out;
}

/** Convert one parsed component into a weigh-out / pipette instruction for a batch of
    `volumeL` litres. Returns { kind: 'mass' | 'volume' | 'note', value, display, note }.
    `value` is grams for mass, litres for volume (so volumes can be summed), null for notes. */
function componentAmount(c, volumeL) {
  const V = volumeL, u = c.unit;
  if (!u || !ok(c.conc)) return { kind: 'note', value: null, display: '—', note: 'No concentration parsed — add one' };

  if (MOLAR[u] !== undefined) {
    if (!ok(c.mw) || c.mw <= 0) return { kind: 'note', value: null, display: 'set MW', note: 'Enter a molecular weight to weigh this out' };
    const grams = c.conc * MOLAR[u] * V * c.mw;
    return { kind: 'mass', value: grams, display: showMass(grams) };
  }
  if (u === 'mg/mL') { const g = c.conc * V;          return { kind: 'mass', value: g, display: showMass(g) }; }
  if (u === 'µg/mL') { const g = c.conc * V / 1e3;    return { kind: 'mass', value: g, display: showMass(g) }; }
  if (u === 'ng/mL') { const g = c.conc * V / 1e6;    return { kind: 'mass', value: g, display: showMass(g) }; }
  if (u === 'g/L')   { const g = c.conc * V;          return { kind: 'mass', value: g, display: showMass(g) }; }
  if (u[0] === '%') {
    const isVol = u === '% v/v' || (u === '%' && c.phys === 'liquid');
    const amount = c.conc * 10 * V;                    // grams if w/v, mL if v/v (V is in litres)
    if (isVol) { const L = amount / 1000; return { kind: 'volume', value: L, display: showVol(L) }; }
    return { kind: 'mass', value: amount, display: showMass(amount) };
  }
  if (u === 'X') return { kind: 'note', value: null, display: `${fmt(c.conc)}×`, note: `Dilute a concentrated stock to ${fmt(c.conc)}×` };
  return { kind: 'note', value: null, display: '—', note: 'Unrecognised unit' };
}

const targetLabel = (c) =>
  (ok(c.conc) && c.unit ? `${fmt(c.conc)} ${c.unit}` : '—') + (ok(c.pH) ? ` · pH ${fmt(c.pH)}` : '');

/** Turn a component list + batch volume into a full protocol (pure; no DOM). */
function computeRecipe(components, volumeL) {
  const lines = [];
  let usedVol = 0;
  for (const c of components) {
    const a = componentAmount(c, volumeL);
    if (a.kind === 'volume' && ok(a.value)) usedVol += a.value;
    lines.push({ name: c.name || c.inputName || 'Component', target: targetLabel(c), ...a });
  }
  const water = volumeL - usedVol;
  return { lines, usedVol, water, overdrawn: water < 0 };
}

/* ============================================================
   Image OCR  (runs entirely in the browser; the image is never uploaded)
   ============================================================ */

/* Tesseract.js is loaded lazily from a CDN the first time the image feature is used.
   The library code is fetched, but recognition runs locally in WebAssembly, so the
   picture itself never leaves the device. Works best when the app is served over
   http(s); on a bare file:// page the cross-origin worker fetch may be blocked, in
   which case the user is told to type or paste the recipe instead. */
const OCR_SRC = 'https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js';

function loadOCR() {
  if (typeof window !== 'undefined' && window.Tesseract) return Promise.resolve(window.Tesseract);
  if (window.__ocrPromise) return window.__ocrPromise;
  window.__ocrPromise = new Promise((resolve, reject) => {
    const s = document.createElement('script');
    s.src = OCR_SRC;
    s.async = true;
    s.onload = () => window.Tesseract ? resolve(window.Tesseract) : reject(new Error('OCR engine loaded but unavailable'));
    s.onerror = () => { window.__ocrPromise = null; reject(new Error('Could not load the OCR engine — check your connection, or type the recipe instead.')); };
    document.head.appendChild(s);
  });
  return window.__ocrPromise;
}

async function ocrImage(file, onProgress) {
  const T = await loadOCR();
  const { data } = await T.recognize(file, 'eng', {
    logger: (m) => { if (m.status === 'recognizing text' && onProgress) onProgress(m.progress); },
  });
  return data.text || '';
}

/* ============================================================
   Sync reconciliation (pure — no DOM, no network)
   ============================================================ */

/* Last-write-wins merge of local library items with decrypted remote rows.
   `remote` entries are { id, kind, updatedAt, deleted, item }. Returns the merged local
   list plus the items that need pushing back up (local-only or locally-newer). Tombstones
   (deleted rows) win by timestamp and remove the item locally. */
function mergeItems(local, remote) {
  const stamp = (it) => it.updatedAt || it.createdAt || 0;
  const state = new Map();
  for (const it of local) state.set(it.id, { item: it, updatedAt: stamp(it), deleted: false, source: 'local' });

  for (const r of remote) {
    const cur = state.get(r.id);
    if (!cur || r.updatedAt > cur.updatedAt) {
      state.set(r.id, { item: r.deleted ? null : r.item, updatedAt: r.updatedAt, deleted: !!r.deleted, source: 'remote' });
    }
  }

  const merged = [];
  const toPush = [];
  for (const e of state.values()) {
    if (e.deleted) continue;                 // tombstone → gone locally
    if (e.item) merged.push(e.item);
    if (e.source === 'local') toPush.push(e.item);  // remote missing or older
  }
  merged.sort((a, b) => (b.createdAt || 0) - (a.createdAt || 0));
  return { merged, toPush };
}

/* ============================================================
   Buffer-exchange carryover (pure — no DOM)
   ============================================================ */

/* Both methods remove a freely-diffusible component (e.g. salt, imidazole) by repeated
   dilution, so the residual falls geometrically.
   - Dialysis: at equilibrium the solute equalises across the membrane, so each change
     leaves fraction  V_sample / (V_sample + V_bath).
   - Spin concentrator: small molecules pass the membrane freely, so their concentration is
     unchanged by concentrating — each dilute/spin round leaves fraction  V_final / V_fill.
   `fractionPerRound` is that ratio; residual after n rounds is it raised to the n-th power. */
function exchangeResidual(fractionPerRound, rounds) {
  if (!(fractionPerRound > 0) || !(rounds >= 0)) return NaN;
  return Math.pow(fractionPerRound, rounds);
}

/** Rounds needed to reduce the component by at least `targetFold`. */
function roundsForTarget(fractionPerRound, targetFold) {
  if (!(fractionPerRound > 0) || fractionPerRound >= 1 || !(targetFold > 1)) return NaN;
  return Math.ceil(Math.log(targetFold) / Math.log(1 / fractionPerRound));
}

/* ============================================================
   Tools
   ============================================================ */

const TOOLS = {};

/* ---------- Molarity ---------- */

TOOLS.molarity = {
  group: 'Solutions',
  name: 'Molarity',
  title: 'Molarity & mass',
  blurb: 'Leave exactly one field blank and it will be solved for you. Mass = concentration × volume × molecular weight.',
  render() {
    return `
      ${panel('Inputs', `
        <div class="grid g2">
          ${fieldNum('Molecular weight (g/mol)', 'mw', { placeholder: 'e.g. 58.44' })}
          ${fieldUnit('Concentration', 'conc', MOLAR, 'mM')}
          ${fieldUnit('Volume', 'vol', VOL, 'mL')}
          ${fieldUnit('Mass', 'mass', MASS, 'mg')}
        </div>
        <div class="formula">mass (g) = concentration (mol/L) × volume (L) × MW (g/mol)</div>
      `)}
      <div id="out"></div>
      ${panel('Common reagents', `<div class="chip-row" id="presets">
        ${[['NaCl', 58.44], ['Tris base', 121.14], ['Tris·HCl', 157.60], ['HEPES', 238.30],
           ['Glycine', 75.07], ['EDTA disodium·2H₂O', 372.24], ['Urea', 60.06],
           ['Guanidine·HCl', 95.53], ['SDS', 288.37], ['Imidazole', 68.08],
           ['DTT', 154.25], ['Sucrose', 342.30], ['Glucose', 180.16], ['MgCl₂', 95.21],
           ['KCl', 74.55], ['CaCl₂', 110.98], ['Ammonium sulfate', 132.14], ['TCEP·HCl', 286.65],
           ['Na₂HPO₄ (Na phosphate, dibasic)', 141.96], ['NaH₂PO₄ (Na phosphate, monobasic)', 119.98]]
          .map(([n, m]) => `<button class="chip" type="button" data-mw="${m}">${esc(n)} · ${m}</button>`).join('')}
      </div>`)}
    `;
  },
  mount(root) {
    $$('#presets .chip', root).forEach(b => b.addEventListener('click', () => {
      $('#f-mw', root).value = b.dataset.mw;
      save(); this.compute(root);
    }));
  },
  compute(root) {
    releaseSolved(root, this);

    const g = (k) => num($(`#f-${k}`, root));
    const u = (k, t) => t[$(`[data-k="${k}U"]`, root).value];

    const mw = g('mw');
    const conc = ok(g('conc')) ? g('conc') * u('conc', MOLAR) : NaN;   // M
    const vol  = ok(g('vol'))  ? g('vol')  * u('vol', VOL)   : NaN;    // L
    const mass = ok(g('mass')) ? g('mass') * u('mass', MASS) : NaN;    // g

    $$('input.solved', root).forEach(el => el.classList.remove('solved'));

    const known = [mw, conc, vol, mass].filter(ok).length;
    const out = $('#out', root);

    if (known < 3) {
      markSolved(this, null);
      out.innerHTML = `<div class="panel muted">Fill in any three fields to solve for the fourth.</div>`;
      return;
    }

    let r = { mw, conc, vol, mass }, solved = null;

    if (!ok(mass))       { r.mass = conc * vol * mw;  solved = 'mass'; }
    else if (!ok(conc))  { r.conc = mass / (vol * mw); solved = 'conc'; }
    else if (!ok(vol))   { r.vol  = mass / (conc * mw); solved = 'vol'; }
    else if (!ok(mw))    { r.mw   = mass / (conc * vol); solved = 'mw'; }

    if (solved) {
      if (solved === 'mw') {
        $('#f-mw', root).value = fmt(r.mw, 5);
      } else {
        const table = { mass: MASS, conc: MOLAR, vol: VOL }[solved];
        const unit = $(`[data-k="${solved}U"]`, root).value;
        $(`#f-${solved}`, root).value = fmt(r[solved] / table[unit], 5);
      }
      $(`#f-${solved}`, root).classList.add('solved');
    }
    markSolved(this, solved);

    const moles = r.conc * r.vol;
    const headline = solved
      ? { mass: `Weigh out ${showMass(r.mass)}`,
          conc: `Concentration is ${showMolar(r.conc)}`,
          vol:  `Make up to ${showVol(r.vol)}`,
          mw:   `MW is ${fmt(r.mw, 5)} g/mol` }[solved]
      : 'All fields consistent';

    out.innerHTML = `
      <div class="result">
        <div class="result-main">${esc(headline)}</div>
        <div class="result-sub">${showMass(r.mass)} of a ${fmt(r.mw, 5)} g/mol reagent in ${showVol(r.vol)} gives ${showMolar(r.conc)}.</div>
      </div>
      ${panel('Details', readout([
        ['Mass', showMass(r.mass)],
        ['Moles', showMole(moles)],
        ['Concentration', showMolar(r.conc)],
        ['Volume', showVol(r.vol)],
        ['Mass concentration', `${fmt(r.mass / (r.vol * 1e-3))} mg/mL`.replace('NaN', '—')],
      ]))}
    `;
  },
};

/* ---------- Dilution ---------- */

TOOLS.dilution = {
  group: 'Solutions',
  name: 'Dilution (C1V1 = C2V2)',
  title: 'Dilution',
  blurb: 'Leave one field blank to solve for it. Works with molar, mass/volume, % or X-fold units.',
  render() {
    return `
      ${panel('Stock and final', `
        <div class="grid g2">
          ${fieldUnit('Stock concentration (C1)', 'c1', CONC, 'M')}
          ${fieldUnit('Stock volume (V1)', 'v1', VOL, 'µL')}
          ${fieldUnit('Final concentration (C2)', 'c2', CONC, 'mM')}
          ${fieldUnit('Final volume (V2)', 'v2', VOL, 'mL')}
        </div>
        <div class="formula">C1 × V1 = C2 × V2</div>
      `)}
      <div id="out"></div>
    `;
  },
  mount() {},
  compute(root) {
    releaseSolved(root, this);

    const raw = (k) => num($(`#f-${k}`, root));
    const cu  = (k) => $(`[data-k="${k}U"]`, root).value;

    const c1u = cu('c1'), c2u = cu('c2');
    const c1 = ok(raw('c1')) ? raw('c1') * CONC[c1u].f : NaN;
    const c2 = ok(raw('c2')) ? raw('c2') * CONC[c2u].f : NaN;
    const v1 = ok(raw('v1')) ? raw('v1') * VOL[cu('v1')] : NaN;
    const v2 = ok(raw('v2')) ? raw('v2') * VOL[cu('v2')] : NaN;

    $$('input.solved', root).forEach(el => el.classList.remove('solved'));

    const out = $('#out', root);
    const known = [c1, v1, c2, v2].filter(ok).length;
    if (known < 3) {
      markSolved(this, null);
      out.innerHTML = `<div class="panel muted">Fill in any three fields to solve for the fourth.</div>`;
      return;
    }

    const mismatch = CONC[c1u].fam !== CONC[c2u].fam;

    let r = { c1, v1, c2, v2 }, solved = null;
    if (!ok(v1))      { r.v1 = (c2 * v2) / c1; solved = 'v1'; }
    else if (!ok(v2)) { r.v2 = (c1 * v1) / c2; solved = 'v2'; }
    else if (!ok(c1)) { r.c1 = (c2 * v2) / v1; solved = 'c1'; }
    else if (!ok(c2)) { r.c2 = (c1 * v1) / v2; solved = 'c2'; }

    if (solved) {
      const table = solved[0] === 'v' ? VOL : null;
      const factor = table ? table[cu(solved)] : CONC[cu(solved)].f;
      $(`#f-${solved}`, root).value = fmt(r[solved] / factor, 5);
      $(`#f-${solved}`, root).classList.add('solved');
    }
    markSolved(this, solved);

    const diluent = r.v2 - r.v1;
    const fold = r.c1 / r.c2;

    out.innerHTML = `
      ${mismatch ? `<div class="note">C1 is in ${esc(c1u)} but C2 is in ${esc(c2u)} — these are different kinds of unit. Convert to a common basis before trusting this result.</div>` : ''}
      <div class="result">
        <div class="result-main">${showVol(r.v1)} stock + ${diluent >= 0 ? showVol(diluent) : '—'} diluent</div>
        <div class="result-sub">Gives ${showVol(r.v2)} at ${fmt(r.c2 / CONC[c2u].f, 4)} ${esc(c2u)} — a ${fmt(fold, 4)}-fold dilution.</div>
      </div>
      ${diluent < 0 ? `<div class="note">Final volume is smaller than the stock volume required. Your target concentration exceeds the stock.</div>` : ''}
      ${panel('Details', readout([
        ['Stock volume (V1)', showVol(r.v1)],
        ['Diluent to add', diluent >= 0 ? showVol(diluent) : '—'],
        ['Final volume (V2)', showVol(r.v2)],
        ['Dilution factor', `${fmt(fold, 4)}×`],
        ['Ratio', `1 : ${fmt(fold - 1, 4)}`],
      ]))}
    `;
  },
};

/* ---------- Serial dilution ---------- */

TOOLS.serial = {
  group: 'Solutions',
  name: 'Serial dilution',
  title: 'Serial dilution scheme',
  blurb: 'Builds a step-by-step transfer table for a dilution series, including the extra volume to discard from the final tube.',
  render() {
    return `
      ${panel('Series', `
        <div class="grid g3">
          ${fieldUnit('Starting concentration', 'c0', MOLAR, 'µM')}
          ${fieldNum('Dilution factor per step', 'factor', { value: 2, hint: 'e.g. 2 for two-fold, 10 for ten-fold' })}
          ${fieldNum('Number of dilutions', 'steps', { value: 8, hint: 'Excludes the undiluted stock' })}
          ${fieldUnit('Volume needed per tube', 'keep', VOL, 'µL', { value: 100, hint: 'What you actually use downstream' })}
          ${fieldSel('Include undiluted stock as point 1', 'includeStock', [['yes', 'Yes'], ['no', 'No']], 'yes')}
          ${fieldSel('Diluent', 'diluent', ['Buffer', 'Medium', 'Water', 'DMSO'], 'Buffer')}
        </div>
      `)}
      <div id="out"></div>
    `;
  },
  mount() {},
  compute(root) {
    const c0 = num($('#f-c0', root)) * MOLAR[$('[data-k="c0U"]', root).value];
    const factor = num($('#f-factor', root));
    const steps = Math.round(num($('#f-steps', root)));
    const keep = num($('#f-keep', root)) * VOL[$('[data-k="keepU"]', root).value];
    const withStock = $('#f-includeStock', root).value === 'yes';
    const diluent = $('#f-diluent', root).value;

    const out = $('#out', root);
    if (!ok(c0) || !ok(factor) || !ok(keep) || !ok(steps) || factor <= 1 || steps < 1 || keep <= 0) {
      out.innerHTML = `<div class="panel muted">Enter a starting concentration, a dilution factor above 1, a step count and a working volume.</div>`;
      return;
    }
    if (steps > 40) { out.innerHTML = `<div class="note">Cap the number of dilutions at 40.</div>`; return; }

    // Each tube must hold what it passes on plus what you keep.
    const transfer = keep / (factor - 1);
    const totalPrepared = keep + transfer;
    const diluentVol = totalPrepared - transfer;

    const rows = [];
    if (withStock) {
      rows.push({ label: 'Stock', conc: c0, source: '—', xfer: '—', dil: '—', total: showVol(keep) });
    }
    for (let i = 1; i <= steps; i++) {
      const conc = c0 / Math.pow(factor, i);
      rows.push({
        label: `D${i}`,
        conc,
        source: i === 1 ? 'Stock' : `D${i - 1}`,
        xfer: showVol(transfer),
        dil: showVol(diluentVol),
        total: showVol(totalPrepared),
      });
    }

    const finalConc = c0 / Math.pow(factor, steps);
    const totalDiluent = diluentVol * steps;

    out.innerHTML = `
      <div class="result">
        <div class="result-main">${showMolar(c0)} → ${showMolar(finalConc)}</div>
        <div class="result-sub">${steps} × ${fmt(factor, 4)}-fold steps. Transfer ${showVol(transfer)} into ${showVol(diluentVol)} ${diluent.toLowerCase()} each time, mix, then carry ${showVol(transfer)} forward.</div>
      </div>
      ${panel('Scheme', `<div class="table-scroll"><table>
        <thead><tr>
          <th>Point</th><th>Concentration</th><th>Source</th>
          <th>Transfer in</th><th>${esc(diluent)}</th><th>Volume in tube</th>
        </tr></thead>
        <tbody>${rows.map(r => `<tr>
          <td>${esc(r.label)}</td>
          <td class="num">${showMolar(r.conc)}</td>
          <td>${esc(r.source)}</td>
          <td class="num">${r.xfer}</td>
          <td class="num">${r.dil}</td>
          <td class="num">${r.total}</td>
        </tr>`).join('')}</tbody>
      </table></div>
      <div class="formula">transfer = working volume ÷ (factor − 1), so each tube retains exactly the volume you need</div>`)}
      ${panel('Totals', readout([
        ['Transfer volume', showVol(transfer)],
        ['Diluent per step', showVol(diluentVol)],
        ['Total diluent', showVol(totalDiluent)],
        ['Stock consumed', showVol(withStock ? keep + transfer : transfer)],
        ['Final concentration', showMolar(finalConc)],
        ['Total fold', `${fmt(Math.pow(factor, steps), 4)}×`],
      ]))}
      <div class="note">Discard ${showVol(transfer)} from the last tube so every point ends at the same volume.</div>
    `;
  },
};

/* ---------- Stock solution / percent ---------- */

TOOLS.stock = {
  group: 'Solutions',
  name: 'Percent & stock solutions',
  title: 'Percent and stock solutions',
  blurb: 'Convert between % w/v, % v/v, mg/mL and molarity, and work out how much of a concentrated liquid stock to use.',
  render() {
    return `
      ${panel('Percent to molarity', `
        <div class="grid g3">
          ${fieldNum('Percent', 'pct', { placeholder: 'e.g. 10' })}
          ${fieldSel('Basis', 'basis', [['wv', '% w/v (g per 100 mL)'], ['vv', '% v/v (mL per 100 mL)']], 'wv')}
          ${fieldNum('Molecular weight (g/mol)', 'pmw', { placeholder: 'optional' })}
        </div>
        <div id="pctOut" style="margin-top:12px"></div>
      `)}
      ${panel('Concentrated liquid stock', `
        <div class="grid g3">
          ${fieldNum('Stock strength (×)', 'sx', { value: 10, hint: 'e.g. 10 for a 10× buffer' })}
          ${fieldUnit('Final volume', 'sv', VOL, 'mL')}
          ${fieldNum('Final strength (×)', 'fx', { value: 1 })}
        </div>
        <div id="stockOut" style="margin-top:12px"></div>
      `)}
      ${panel('Density-based dilution', `
        <div class="grid g4">
          ${fieldNum('Assay (% w/w)', 'asy', { placeholder: 'e.g. 37' })}
          ${fieldNum('Density (g/mL)', 'den', { placeholder: 'e.g. 1.19' })}
          ${fieldNum('Molecular weight (g/mol)', 'dmw', { placeholder: 'e.g. 36.46' })}
          ${fieldUnit('Target concentration', 'tgt', MOLAR, 'M')}
        </div>
        <div id="denOut" style="margin-top:12px"></div>
        <div class="formula">stock molarity = (10 × assay% × density) ÷ MW</div>
      `)}
    `;
  },
  mount() {},
  compute(root) {
    /* Percent block */
    const pct = num($('#f-pct', root));
    const basis = $('#f-basis', root).value;
    const pmw = num($('#f-pmw', root));
    const pctOut = $('#pctOut', root);
    if (ok(pct)) {
      const gPerL = basis === 'wv' ? pct * 10 : NaN;
      const cells = [
        ['Concentration', basis === 'wv' ? `${fmt(gPerL / 1000 * 1000)} mg/mL` : `${fmt(pct * 10)} mL/L`],
        ['Per 100 mL', basis === 'wv' ? `${fmt(pct)} g` : `${fmt(pct)} mL`],
        ['Per 1 L', basis === 'wv' ? `${fmt(pct * 10)} g` : `${fmt(pct * 10)} mL`],
      ];
      if (ok(pmw) && basis === 'wv' && pmw > 0) cells.push(['Molarity', showMolar(gPerL / pmw)]);
      pctOut.innerHTML = readout(cells);
    } else {
      pctOut.innerHTML = `<div class="muted tiny">Enter a percentage.</div>`;
    }

    /* Concentrated stock block */
    const sx = num($('#f-sx', root));
    const sv = num($('#f-sv', root)) * VOL[$('[data-k="svU"]', root).value];
    const fx = num($('#f-fx', root));
    const stockOut = $('#stockOut', root);
    if (ok(sx) && ok(sv) && ok(fx) && sx > 0) {
      const need = sv * fx / sx;
      stockOut.innerHTML = readout([
        ['Stock to use', showVol(need)],
        ['Diluent to add', showVol(sv - need)],
        ['Final volume', showVol(sv)],
        ['Dilution', `${fmt(sx / fx, 4)}×`],
      ]);
    } else {
      stockOut.innerHTML = `<div class="muted tiny">Enter stock strength, final volume and final strength.</div>`;
    }

    /* Density block */
    const asy = num($('#f-asy', root));
    const den = num($('#f-den', root));
    const dmw = num($('#f-dmw', root));
    const tgt = num($('#f-tgt', root)) * MOLAR[$('[data-k="tgtU"]', root).value];
    const denOut = $('#denOut', root);
    if (ok(asy) && ok(den) && ok(dmw) && dmw > 0) {
      const molarity = (10 * asy * den) / dmw;
      const cells = [['Stock molarity', showMolar(molarity)]];
      if (ok(tgt) && tgt > 0) {
        cells.push(['Dilution needed', `${fmt(molarity / tgt, 4)}×`]);
        cells.push(['Per 1 L of target', showVol((tgt / molarity) * 1)]);
        cells.push(['Per 100 mL of target', showVol((tgt / molarity) * 0.1)]);
      }
      denOut.innerHTML = readout(cells);
    } else {
      denOut.innerHTML = `<div class="muted tiny">Enter assay, density and molecular weight. Concentrated HCl is typically 37 % w/w, 1.19 g/mL, MW 36.46.</div>`;
    }
  },
};

/* ---------- A280 ---------- */

TOOLS.a280 = {
  group: 'Protein',
  name: 'A280 concentration',
  title: 'Protein concentration from A280',
  blurb: 'Beer–Lambert with an extinction coefficient you supply or derive from sequence. Paste a sequence below to fill the coefficient automatically.',
  render() {
    return `
      ${panel('Absorbance', `
        <div class="grid g4">
          ${fieldNum('A280 reading', 'a280', { placeholder: 'e.g. 0.842' })}
          ${fieldNum('Path length (cm)', 'path', { value: 1, hint: 'NanoDrop pedestal ≈ 0.1' })}
          ${fieldNum('Dilution factor', 'df', { value: 1, hint: 'e.g. 10 if diluted 1:10' })}
          ${fieldNum('A320 blank (optional)', 'a320', { placeholder: 'scatter correction' })}
        </div>
      `)}
      ${panel('Extinction coefficient', `
        <div class="grid g3">
          ${fieldNum('ε280 (M⁻¹cm⁻¹)', 'ext', { placeholder: 'e.g. 43824' })}
          ${fieldNum('Molecular weight (g/mol)', 'mw', { placeholder: 'e.g. 26600' })}
          ${fieldNum('E1% (0.1 %, 1 cm)', 'e1', { placeholder: 'alternative to ε' })}
        </div>
        <div class="field" style="margin-top:12px">
          <label for="f-seq">Derive from sequence (optional)</label>
          <textarea id="f-seq" data-k="seq" spellcheck="false"
            placeholder="Paste a single-letter amino acid sequence — FASTA headers are ignored"></textarea>
          <div class="seq-stats" id="seqStats"></div>
        </div>
        <div class="chip-row" style="margin-top:10px">
          <button class="chip" type="button" id="useRed">Use reduced ε</button>
          <button class="chip" type="button" id="useOx">Use ε with disulfides</button>
        </div>
        <div class="formula">ε₂₈₀ = 5500·nTrp + 1490·nTyr + 125·nCystine  (Pace et al., 1995)</div>
      `)}
      <div id="out"></div>
    `;
  },
  mount(root) {
    const apply = (which) => {
      const st = proteinStats($('#f-seq', root).value);
      if (!st.length) return;
      $('#f-ext', root).value = which === 'ox' ? st.extOxidised : st.extReduced;
      $('#f-mw', root).value = fmt(st.mw, 7);
      $('#f-e1', root).value = '';
      save(); this.compute(root);
    };
    $('#useRed', root).addEventListener('click', () => apply('red'));
    $('#useOx', root).addEventListener('click', () => apply('ox'));
  },
  compute(root) {
    const a280 = num($('#f-a280', root));
    const a320 = num($('#f-a320', root));
    const path = num($('#f-path', root));
    const df = num($('#f-df', root));
    const ext = num($('#f-ext', root));
    const mw = num($('#f-mw', root));
    const e1 = num($('#f-e1', root));

    /* Sequence side-panel */
    const st = proteinStats($('#f-seq', root).value);
    $('#seqStats', root).innerHTML = st.length
      ? `<span><b>${st.length}</b> residues</span>
         <span>MW <b>${fmt(st.mw / 1000, 5)}</b> kDa</span>
         <span>ε reduced <b>${st.extReduced}</b></span>
         <span>ε oxidised <b>${st.extOxidised}</b></span>
         <span>Trp <b>${st.counts.W || 0}</b>, Tyr <b>${st.counts.Y || 0}</b>, Cys <b>${st.counts.C || 0}</b></span>`
      : `<span class="muted">No sequence entered.</span>`;

    const out = $('#out', root);
    const a = ok(a280) ? a280 - (ok(a320) ? a320 : 0) : NaN;
    const l = ok(path) ? path : 1;
    const d = ok(df) ? df : 1;

    if (!ok(a)) { out.innerHTML = `<div class="panel muted">Enter an A280 reading.</div>`; return; }

    const usingE1 = !ok(ext) && ok(e1);
    if (!ok(ext) && !ok(e1)) {
      out.innerHTML = `<div class="panel muted">Enter an extinction coefficient, an E1% value, or paste a sequence and click one of the buttons above.</div>`;
      return;
    }

    let molar = NaN, mgml = NaN;
    if (usingE1) {
      mgml = (a / (e1 * l)) * 10 * d;                 // E1% is per 10 mg/mL
      if (ok(mw) && mw > 0) molar = (mgml / 1000) / mw * 1000;
    } else {
      molar = (a / (ext * l)) * d;                    // mol/L
      if (ok(mw) && mw > 0) mgml = molar * mw;
    }

    const warn = a280 > 2 ? `<div class="note">A280 above 2 is outside the reliable linear range of most spectrophotometers. Dilute and re-read.</div>`
               : a280 < 0.05 ? `<div class="note">A280 below 0.05 carries large relative error. Use a longer path length or concentrate the sample.</div>`
               : '';

    out.innerHTML = `
      ${warn}
      <div class="result">
        <div class="result-main">${ok(mgml) ? `${fmt(mgml, 4)} mg/mL` : showMolar(molar)}</div>
        <div class="result-sub">${ok(molar) ? showMolar(molar) : 'Enter a molecular weight for the molar concentration.'}
          ${d !== 1 ? ` · includes a ${fmt(d)}× dilution factor` : ''}</div>
      </div>
      ${panel('Details', readout([
        ['Corrected A280', fmt(a, 4)],
        ['Mass concentration', ok(mgml) ? `${fmt(mgml, 4)} mg/mL` : '—'],
        ['Molar concentration', ok(molar) ? showMolar(molar) : '—'],
        ['µg per 10 µL', ok(mgml) ? `${fmt(mgml * 10, 4)} µg` : '—'],
        ['Path length', `${fmt(l)} cm`],
        [usingE1 ? 'E1%' : 'ε280', usingE1 ? fmt(e1, 5) : `${fmt(ext, 6)} M⁻¹cm⁻¹`],
      ]))}
    `;
  },
};

/* ---------- Protein properties ---------- */

TOOLS.protein = {
  group: 'Protein',
  name: 'Protein properties',
  title: 'Protein properties from sequence',
  blurb: 'Molecular weight, extinction coefficient, isoelectric point and composition from a single-letter sequence.',
  render() {
    return `
      ${panel('Sequence', `
        <div class="field">
          <textarea id="f-pseq" data-k="pseq" spellcheck="false" style="min-height:150px"
            placeholder="Paste a single-letter amino acid sequence. FASTA headers, whitespace, digits and ambiguity codes are stripped."></textarea>
        </div>
      `)}
      <div id="out"></div>
    `;
  },
  mount() {},
  compute(root) {
    const st = proteinStats($('#f-pseq', root).value);
    const out = $('#out', root);
    if (!st.length) { out.innerHTML = `<div class="panel muted">Paste a sequence to see its properties.</div>`; return; }

    const charge7 = netCharge(st.counts, 7.0);
    const order = Object.keys(AA_MASS).sort();
    const rows = order.map(a => {
      const n = st.counts[a] || 0;
      return `<tr><td>${a} · ${AA_NAMES[a]}</td><td class="num">${n}</td>
        <td class="num">${fmt((n / st.length) * 100, 3)} %</td></tr>`;
    }).join('');

    const cls = {
      Hydrophobic: 'AVLIMFWPG', Polar: 'STCYNQ', Acidic: 'DE', Basic: 'KRH',
    };
    const clsRows = Object.entries(cls).map(([k, set]) => {
      const n = set.split('').reduce((t, a) => t + (st.counts[a] || 0), 0);
      return `<tr><td>${k}</td><td class="num">${n}</td><td class="num">${fmt((n / st.length) * 100, 3)} %</td></tr>`;
    }).join('');

    out.innerHTML = `
      <div class="result">
        <div class="result-main">${fmt(st.mw / 1000, 5)} kDa · pI ${fmt(st.pI, 3)}</div>
        <div class="result-sub">${st.length} residues · ε280 ${st.extReduced} M⁻¹cm⁻¹ reduced, ${st.extOxidised} with ${st.nSS} disulfide${st.nSS === 1 ? '' : 's'}.</div>
      </div>
      ${panel('Summary', readout([
        ['Length', `${st.length} aa`],
        ['Molecular weight', `${fmt(st.mw, 7)} g/mol`],
        ['Isoelectric point', fmt(st.pI, 3)],
        ['Net charge at pH 7', fmt(charge7, 3)],
        ['ε280 reduced', `${st.extReduced} M⁻¹cm⁻¹`],
        ['ε280 with cystines', `${st.extOxidised} M⁻¹cm⁻¹`],
        ['E1% reduced', fmt(st.e1Reduced, 4)],
        ['E1% with cystines', fmt(st.e1Oxidised, 4)],
      ]))}
      ${panel('Composition', `<div class="grid g2">
        <div class="table-scroll"><table>
          <thead><tr><th>Residue</th><th>Count</th><th>Fraction</th></tr></thead>
          <tbody>${rows}</tbody></table></div>
        <div>
          <div class="table-scroll"><table>
            <thead><tr><th>Class</th><th>Count</th><th>Fraction</th></tr></thead>
            <tbody>${clsRows}</tbody></table></div>
          <div class="muted tiny" style="margin-top:12px">
            pI is estimated from standard side-chain pKa values and ignores local structural
            environment, post-translational modification and tags. Treat it as a starting point
            for buffer selection, not a measured value.
          </div>
        </div>
      </div>`)}
    `;
  },
};

/* ---------- Primer Tm ---------- */

TOOLS.primer = {
  group: 'Nucleic acids',
  name: 'Primer Tm',
  title: 'Primer melting temperature',
  blurb: 'Nearest-neighbour thermodynamics (SantaLucia 1998) with salt correction, plus the classic Wallace and GC estimates for comparison.',
  render() {
    return `
      ${panel('Primer', `
        <div class="field">
          <textarea id="f-oseq" data-k="oseq" spellcheck="false" style="min-height:80px"
            placeholder="Paste a DNA sequence, 5'→3'"></textarea>
          <div class="seq-stats" id="oStats"></div>
        </div>
      `)}
      ${panel('Reaction conditions', `
        <div class="grid g4">
          ${fieldNum('Primer concentration (nM)', 'pconc', { value: 250, hint: 'Typical PCR: 200–500 nM' })}
          ${fieldNum('Monovalent salt (mM)', 'na', { value: 50, hint: 'Na⁺ + K⁺' })}
          ${fieldNum('Mg²⁺ (mM)', 'mg', { value: 1.5 })}
          ${fieldNum('dNTPs (mM)', 'dntp', { value: 0.2, hint: 'Chelates Mg²⁺' })}
        </div>
      `)}
      <div id="out"></div>
    `;
  },
  mount() {},
  compute(root) {
    const seq = $('#f-oseq', root).value;
    const st = oligoStats(seq, {
      primerNM: num($('#f-pconc', root)) || 250,
      na: num($('#f-na', root)) || 0,
      mg: num($('#f-mg', root)) || 0,
      dntp: num($('#f-dntp', root)) || 0,
    });

    const out = $('#out', root);
    const raw = cleanDNA(seq);
    $('#oStats', root).innerHTML = raw.length
      ? `<span><b>${raw.length}</b> nt</span><span>reverse complement <b>${esc(revComp(raw))}</b></span>`
      : `<span class="muted">No sequence entered.</span>`;

    if (!st) { out.innerHTML = `<div class="panel muted">Paste a DNA sequence of at least two bases.</div>`; return; }

    const notes = [];
    if (st.length < 18) notes.push('Shorter than 18 nt — specificity may suffer in a complex template.');
    if (st.length > 35) notes.push('Longer than 35 nt — the nearest-neighbour model gets less accurate and secondary structure is likelier.');
    if (st.gcPct < 40 || st.gcPct > 60) notes.push(`GC content is ${fmt(st.gcPct, 3)} % — outside the usual 40–60 % window.`);
    if (/(.)\1{3,}/.test(st.seq)) notes.push('Contains a run of four or more identical bases.');
    if (!/[GC]$/.test(st.seq)) notes.push("No G or C at the 3' end — a GC clamp helps priming.");
    if (st.selfComp) notes.push('Sequence is self-complementary and will form a perfect hairpin or dimer.');

    const annealSuggested = st.tmNN - 5;

    out.innerHTML = `
      <div class="result">
        <div class="result-main">Tm ${fmt(st.tmNN, 4)} °C</div>
        <div class="result-sub">Nearest-neighbour, ${fmt(st.naEq, 4)} mM equivalent Na⁺. Suggested annealing temperature ≈ ${fmt(annealSuggested, 4)} °C.</div>
      </div>
      ${panel('Melting temperature estimates', readout([
        ['Nearest neighbour', `${fmt(st.tmNN, 4)} °C`],
        ['Salt-adjusted GC', `${fmt(st.tmGC, 4)} °C`],
        ['Wallace rule', `${fmt(st.tmWallace, 4)} °C`],
        ['ΔH', `${fmt(st.dH, 4)} kcal/mol`],
        ['ΔS', `${fmt(st.dS, 4)} cal/mol·K`],
      ]))}
      ${panel('Oligo properties', readout([
        ['Length', `${st.length} nt`],
        ['GC content', `${fmt(st.gcPct, 3)} %`],
        ['Molecular weight', `${fmt(st.mw, 6)} g/mol`],
        ['ε260', `${fmt(st.ext, 6)} M⁻¹cm⁻¹`],
        ['nmol per A260 unit', fmt((1 / st.ext) * 1e9, 4)],
        ['µg per A260 unit', fmt((1 / st.ext) * st.mw * 1e3, 4)],
      ]))}
      ${notes.length ? `<div class="note"><b>Design notes</b><ul style="margin:6px 0 0;padding-left:18px">
        ${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}
      <div class="muted tiny">
        The Wallace rule is only appropriate below about 14 nt. Nearest-neighbour values assume a
        perfectly matched duplex; mismatched or tailed primers (restriction sites, overhangs) melt
        differently — calculate Tm on the annealing portion only for the first cycles.
      </div>
    `;
  },
};

/* ---------- Nucleic acid quantitation ---------- */

TOOLS.nucleic = {
  group: 'Nucleic acids',
  name: 'DNA/RNA quantitation',
  title: 'Nucleic acid concentration',
  blurb: 'A260 quantitation with the standard conversion factors, purity ratios, and molar concentration for a known fragment length.',
  render() {
    return `
      ${panel('Readings', `
        <div class="grid g4">
          ${fieldNum('A260', 'a260', { placeholder: 'e.g. 0.65' })}
          ${fieldNum('A280 (optional)', 'na280', { placeholder: 'for 260/280' })}
          ${fieldNum('A230 (optional)', 'a230', { placeholder: 'for 260/230' })}
          ${fieldNum('Path length (cm)', 'npath', { value: 1 })}
        </div>
        <div class="grid g3" style="margin-top:12px">
          ${fieldSel('Sample type', 'ntype', [
            ['ds', 'Double-stranded DNA (50 µg/mL)'],
            ['ss', 'Single-stranded DNA (33 µg/mL)'],
            ['rna', 'RNA (40 µg/mL)'],
            ['oligo', 'Oligonucleotide (33 µg/mL)'],
          ], 'ds')}
          ${fieldNum('Dilution factor', 'ndf', { value: 1 })}
          ${fieldNum('Fragment length (bp or nt)', 'nlen', { placeholder: 'optional, for molarity' })}
        </div>
      `)}
      <div id="out"></div>
    `;
  },
  mount() {},
  compute(root) {
    const a260 = num($('#f-a260', root));
    const a280 = num($('#f-na280', root));
    const a230 = num($('#f-a230', root));
    const path = num($('#f-npath', root)) || 1;
    const type = $('#f-ntype', root).value;
    const df = num($('#f-ndf', root)) || 1;
    const len = num($('#f-nlen', root));

    const out = $('#out', root);
    if (!ok(a260)) { out.innerHTML = `<div class="panel muted">Enter an A260 reading.</div>`; return; }

    const FACTOR = { ds: 50, ss: 33, rna: 40, oligo: 33 };
    const ngPerUL = (a260 / path) * FACTOR[type] * df;   // µg/mL == ng/µL

    // Average MW per base pair / base
    const perUnit = { ds: 650, ss: 330, rna: 340, oligo: 330 }[type];
    const molar = ok(len) && len > 0 ? (ngPerUL * 1e-9 / (len * perUnit)) * 1e6 : NaN;  // mol/L

    const r280 = ok(a280) && a280 > 0 ? a260 / a280 : NaN;
    const r230 = ok(a230) && a230 > 0 ? a260 / a230 : NaN;

    const notes = [];
    if (ok(r280)) {
      const target = type === 'rna' ? 2.0 : 1.8;
      if (r280 < target - 0.15) notes.push(`260/280 of ${fmt(r280, 3)} is below the expected ~${target} — likely protein or phenol carryover.`);
      else if (r280 > target + 0.25) notes.push(`260/280 of ${fmt(r280, 3)} is unusually high — check the blank and the sample type.`);
    }
    if (ok(r230) && r230 < 1.8) notes.push(`260/230 of ${fmt(r230, 3)} suggests guanidine, phenol or carbohydrate contamination.`);
    if (a260 > 2) notes.push('A260 above 2 is outside the reliable linear range — dilute and re-read.');

    out.innerHTML = `
      <div class="result">
        <div class="result-main">${fmt(ngPerUL, 4)} ng/µL</div>
        <div class="result-sub">${fmt(ngPerUL, 4)} µg/mL${ok(molar) ? ` · ${showMolar(molar)} for a ${fmt(len, 6)} ${type === 'ds' ? 'bp' : 'nt'} fragment` : ''}</div>
      </div>
      ${panel('Details', readout([
        ['Concentration', `${fmt(ngPerUL, 4)} ng/µL`],
        ['µg per mL', fmt(ngPerUL, 4)],
        ['260/280', ok(r280) ? fmt(r280, 3) : '—'],
        ['260/230', ok(r230) ? fmt(r230, 3) : '—'],
        ['Molarity', ok(molar) ? showMolar(molar) : '—'],
        ['µg in 50 µL', `${fmt(ngPerUL * 50 / 1000, 4)} µg`],
      ]))}
      ${notes.length ? `<div class="note"><ul style="margin:0;padding-left:18px">
        ${notes.map(n => `<li>${esc(n)}</li>`).join('')}</ul></div>` : ''}
    `;
  },
};

/* ---------- Buffer recipe ---------- */

TOOLS.buffer = {
  group: 'Buffers',
  name: 'Buffer recipe',
  title: 'Buffer recipe scaling',
  blurb: 'Enter components once as stock and final concentrations, then change the batch volume and every value rescales.',
  render() {
    return `
      ${panel('Batch', `
        <div class="grid g3">
          ${fieldUnit('Total volume', 'bvol', VOL, 'mL', { value: 50 })}
          ${fieldSel('Solid components shown as', 'solidMode', [['mass', 'Mass to weigh'], ['none', 'Hidden']], 'mass')}
          <div class="field">
            <label>&nbsp;</label>
            <button class="primary-btn" type="button" id="addRow">Add component</button>
          </div>
        </div>
      `)}
      ${panel('Components', `
        <div class="table-scroll"><table id="compTable">
          <thead><tr>
            <th style="min-width:150px">Component</th>
            <th>Stock</th><th>Unit</th>
            <th>Final</th><th>Unit</th>
            <th>MW</th><th>Volume / mass</th><th></th>
          </tr></thead>
          <tbody id="compBody"></tbody>
        </table></div>
        <div class="muted tiny" style="margin-top:10px">
          Leave the stock concentration blank and give a molecular weight to have the component
          weighed out as a solid instead of pipetted from a stock.
        </div>
      `)}
      <div id="out"></div>
      ${panel('Save', `
        <div class="grid g3">
          <div class="field"><label for="f-bsavetitle">Recipe name</label>
            <input id="f-bsavetitle" data-k="bsavetitle" type="text" placeholder="e.g. Storage buffer"></div>
          <div class="field"><label>&nbsp;</label><button class="primary-btn" id="bufSave" type="button">Save to My Recipes</button></div>
          <div class="field"><label>&nbsp;</label><div class="muted tiny" id="bufSaveMsg" style="padding-top:9px"></div></div>
        </div>
      `)}
    `;
  },
  mount(root) {
    const body = $('#compBody', root);
    const self = this;

    /* Save the current component rows into My Recipes, mapping each row's *final*
       concentration and MW into the shared recipe format. */
    $('#bufSave', root).addEventListener('click', () => {
      const comps = $$('#compBody tr', root).map(tr => {
        const g = (k) => { const el = $(`[data-c="${k}"]`, tr); return el ? el.value : ''; };
        const name = g('name').trim();
        const m = name ? matchReagent(name) : null;
        const finalU = g('finalU');
        const unit = RECIPE_UNITS.includes(finalU) ? finalU : (finalU === '% w/v' ? '% w/v' : finalU);
        return {
          name, conc: g('final') === '' ? NaN : Number(g('final')),
          unit: unit || null,
          mw: g('mw') !== '' ? Number(g('mw')) : (m ? m.mw : null),
          pH: null, phys: m ? m.phys : 'solid',
        };
      }).filter(c => c.name || ok(c.conc));
      const msg = $('#bufSaveMsg', root);
      if (!comps.length) { if (msg) msg.textContent = 'Add components first.'; return; }
      const title = ($('#f-bsavetitle', root).value || 'Untitled recipe').trim();
      const vol = num($('#f-bvol', root)) * VOL[$('[data-k="bvolU"]', root).value];
      addLibraryItem({ kind: 'recipe', title, components: comps, volumeL: ok(vol) ? vol : 0.05 });
      if (msg) { msg.textContent = 'Saved to My Recipes.'; setTimeout(() => { msg.textContent = ''; }, 1800); }
    });

    const rowHTML = (c = {}) => `
      <tr>
        <td><input data-c="name" value="${esc(c.name || '')}" placeholder="e.g. Tris·HCl pH 7.5"></td>
        <td><input data-c="stock" type="number" step="any" value="${esc(c.stock ?? '')}" style="width:80px"></td>
        <td>${unitCell('stockU', c.stockU || 'M')}</td>
        <td><input data-c="final" type="number" step="any" value="${esc(c.final ?? '')}" style="width:80px"></td>
        <td>${unitCell('finalU', c.finalU || 'mM')}</td>
        <td><input data-c="mw" type="number" step="any" value="${esc(c.mw ?? '')}" placeholder="g/mol" style="width:80px"></td>
        <td class="num" data-out>—</td>
        <td><button class="ghost-btn" type="button" data-del>×</button></td>
      </tr>`;

    function unitCell(name, sel) {
      const opts = Object.keys(MOLAR).concat(['mg/mL', '% w/v', 'X'])
        .map(u => `<option${u === sel ? ' selected' : ''}>${esc(u)}</option>`).join('');
      return `<select data-c="${name}" style="width:82px">${opts}</select>`;
    }

    function addRow(c) {
      body.insertAdjacentHTML('beforeend', rowHTML(c));
      wire(body.lastElementChild);
    }

    function wire(tr) {
      $('[data-del]', tr).addEventListener('click', () => {
        tr.remove(); persistRows(); self.compute(root);
      });
      $$('input,select', tr).forEach(el =>
        el.addEventListener('input', () => { persistRows(); self.compute(root); }));
    }

    function persistRows() {
      const rows = $$('#compBody tr', root).map(tr => {
        const g = (k) => { const el = $(`[data-c="${k}"]`, tr); return el ? el.value : ''; };
        return { name: g('name'), stock: g('stock'), stockU: g('stockU'),
                 final: g('final'), finalU: g('finalU'), mw: g('mw') };
      });
      store[`buffer.rows`] = rows;
      writeStore();
    }

    const saved = store['buffer.rows'];
    const seed = (Array.isArray(saved) && saved.length) ? saved : [
      { name: 'Tris·HCl pH 7.5', stock: 1, stockU: 'M', final: 20, finalU: 'mM', mw: '' },
      { name: 'NaCl', stock: 5, stockU: 'M', final: 150, finalU: 'mM', mw: '' },
      { name: 'EDTA pH 8.0', stock: 0.5, stockU: 'M', final: 1, finalU: 'mM', mw: '' },
      { name: 'DTT', stock: '', stockU: 'M', final: 1, finalU: 'mM', mw: 154.25 },
    ];
    seed.forEach(addRow);

    $('#addRow', root).addEventListener('click', () => { addRow(); persistRows(); this.compute(root); });
    this._persistRows = persistRows;
  },
  compute(root) {
    const total = num($('#f-bvol', root)) * VOL[$('[data-k="bvolU"]', root).value];
    const out = $('#out', root);

    if (!ok(total) || total <= 0) {
      $$('#compBody [data-out]', root).forEach(td => td.textContent = '—');
      out.innerHTML = `<div class="panel muted">Enter a total batch volume.</div>`;
      return;
    }

    const toMolar = (v, u) => {
      if (MOLAR[u] !== undefined) return v * MOLAR[u];
      return NaN;  // mg/mL, % and X are handled as simple ratios below
    };

    let usedVol = 0;
    const lines = [];

    $$('#compBody tr', root).forEach(tr => {
      const g = (k) => $(`[data-c="${k}"]`, tr);
      const name = g('name').value.trim() || 'Component';
      const stock = Number(g('stock').value);
      const stockU = g('stockU').value;
      const final = Number(g('final').value);
      const finalU = g('finalU').value;
      const mw = Number(g('mw').value);
      const cell = $('[data-out]', tr);

      if (!isFinite(final) || g('final').value === '') { cell.textContent = '—'; return; }

      const ratioUnits = ['mg/mL', '% w/v', 'X'];
      const bothRatio = ratioUnits.includes(stockU) && ratioUnits.includes(finalU);

      if (isFinite(stock) && stock > 0 && g('stock').value !== '') {
        // Pipette from a liquid stock
        let v;
        if (bothRatio || stockU === finalU) {
          v = (final / stock) * total;
        } else {
          const cS = toMolar(stock, stockU), cF = toMolar(final, finalU);
          if (!ok(cS) || !ok(cF) || cS <= 0) { cell.textContent = 'unit mismatch'; return; }
          v = (cF / cS) * total;
        }
        usedVol += v;
        cell.textContent = showVol(v);
        lines.push({ name, kind: 'liquid', amount: showVol(v), target: `${final} ${finalU}` });
      } else if (isFinite(mw) && mw > 0) {
        // Weigh out a solid
        const cF = toMolar(final, finalU);
        if (!ok(cF)) { cell.textContent = 'need molar unit'; return; }
        const grams = cF * total * mw;
        cell.textContent = showMass(grams);
        lines.push({ name, kind: 'solid', amount: showMass(grams), target: `${final} ${finalU}` });
      } else {
        cell.textContent = 'need stock or MW';
      }
    });

    const water = total - usedVol;
    const overdrawn = water < 0;

    out.innerHTML = `
      ${overdrawn ? `<div class="note">Your stocks alone come to ${showVol(usedVol)}, more than the ${showVol(total)} batch. Use more concentrated stocks or increase the batch volume.</div>` : ''}
      <div class="result">
        <div class="result-main">${showVol(total)} batch</div>
        <div class="result-sub">${showVol(usedVol)} from stocks + ${overdrawn ? '—' : showVol(water)} solvent to volume.</div>
      </div>
      ${panel('Protocol', lines.length ? `<div class="table-scroll"><table>
        <thead><tr><th>Step</th><th>Component</th><th>Target</th><th>Amount</th></tr></thead>
        <tbody>
          ${lines.map((l, i) => `<tr>
            <td>${i + 1}</td><td>${esc(l.name)}</td>
            <td class="num">${esc(l.target)}</td>
            <td class="num">${l.amount}${l.kind === 'solid' ? ' (weigh)' : ''}</td>
          </tr>`).join('')}
          <tr><td>${lines.length + 1}</td><td>Solvent</td><td class="num">to volume</td>
              <td class="num">${overdrawn ? '—' : showVol(water)}</td></tr>
        </tbody></table></div>` : `<div class="muted">Add components above.</div>`)}
    `;
  },
};

/* ---------- pH / Henderson–Hasselbalch ---------- */

TOOLS.ph = {
  group: 'Buffers',
  name: 'Buffer pH (H–H)',
  title: 'Buffer preparation by pH',
  blurb: 'Henderson–Hasselbalch: how much acid and conjugate base to weigh for a buffer at a target pH.',
  render() {
    return `
      ${panel('Buffer', `
        <div class="grid g4">
          ${fieldSel('System', 'sys', BUFFERS.map((b, i) => [i, `${b.name} · pKa ${b.pka.toFixed(2)}`]), 8)}
          ${fieldNum('Target pH', 'ph', { value: 7.5 })}
          ${fieldUnit('Buffer concentration', 'bconc', MOLAR, 'mM', { value: 50 })}
          ${fieldUnit('Volume', 'phvol', VOL, 'mL', { value: 100 })}
        </div>
        <div class="formula">pH = pKa + log₁₀([base] / [acid])</div>
      `)}
      <div id="out"></div>
    `;
  },
  mount() {},
  compute(root) {
    const b = BUFFERS[Number($('#f-sys', root).value)] || BUFFERS[0];
    const pH = num($('#f-ph', root));
    const conc = num($('#f-bconc', root)) * MOLAR[$('[data-k="bconcU"]', root).value];
    const vol = num($('#f-phvol', root)) * VOL[$('[data-k="phvolU"]', root).value];

    const out = $('#out', root);
    if (!ok(pH) || !ok(conc) || !ok(vol) || conc <= 0 || vol <= 0) {
      out.innerHTML = `<div class="panel muted">Enter a target pH, concentration and volume.</div>`;
      return;
    }

    const ratio = Math.pow(10, pH - b.pka);          // [base]/[acid]
    const fBase = ratio / (1 + ratio);
    const fAcid = 1 - fBase;

    const molBase = conc * vol * fBase;
    const molAcid = conc * vol * fAcid;

    const off = Math.abs(pH - b.pka);
    const warn = off > 1
      ? `<div class="note">pH ${fmt(pH, 3)} is ${fmt(off, 2)} units from the pKa of ${b.pka.toFixed(2)}. Buffering capacity is poor more than about 1 unit away — consider a different system.</div>`
      : '';

    const alt = BUFFERS
      .map(x => ({ x, d: Math.abs(x.pka - pH) }))
      .sort((p, q) => p.d - q.d).slice(0, 3)
      .map(({ x, d }) => `<tr><td>${esc(x.name)}</td><td class="num">${x.pka.toFixed(2)}</td><td class="num">${fmt(d, 2)}</td></tr>`)
      .join('');

    out.innerHTML = `
      ${warn}
      <div class="result">
        <div class="result-main">${showMass(molAcid * b.acidMW)} acid + ${showMass(molBase * b.baseMW)} base</div>
        <div class="result-sub">Makes ${showVol(vol)} of ${showMolar(conc)} ${esc(b.name)} at pH ${fmt(pH, 3)}.</div>
      </div>
      ${panel('Weigh out', `<div class="table-scroll"><table>
        <thead><tr><th>Species</th><th>MW</th><th>Fraction</th><th>Moles</th><th>Mass</th></tr></thead>
        <tbody>
          <tr><td>${esc(b.acid)}</td><td class="num">${b.acidMW}</td>
              <td class="num">${fmt(fAcid * 100, 3)} %</td>
              <td class="num">${showMole(molAcid)}</td>
              <td class="num">${showMass(molAcid * b.acidMW)}</td></tr>
          <tr><td>${esc(b.base)}</td><td class="num">${b.baseMW}</td>
              <td class="num">${fmt(fBase * 100, 3)} %</td>
              <td class="num">${showMole(molBase)}</td>
              <td class="num">${showMass(molBase * b.baseMW)}</td></tr>
        </tbody></table></div>
        <div class="muted tiny" style="margin-top:10px">
          Dissolve both species in about 80 % of the final volume, check the pH with a calibrated
          meter at your working temperature, adjust with acid or base, then make up to volume.
          Tris in particular shifts roughly −0.03 pH units per °C, so pH it at the temperature
          you will use it.
        </div>`)}
      ${panel('Nearest alternatives', `<div class="table-scroll"><table>
        <thead><tr><th>System</th><th>pKa</th><th>Δ from target</th></tr></thead>
        <tbody>${alt}</tbody></table></div>`)}
    `;
  },
};

/* ---------- Buffer exchange (dialysis / concentrator) ---------- */

TOOLS.exchange = {
  group: 'Buffers',
  name: 'Buffer exchange',
  title: 'Dialysis & concentrator buffer exchange',
  blurb: 'How much of the old buffer is left after dialysis or spin-concentrator exchange, and how many rounds you need to hit a target — plus practical guidance on spin speeds and times. The carryover maths are exact; the spin/time numbers are guidelines, so check your device.',
  render() {
    return `
      ${panel('Method', `<div class="grid g2">
        ${fieldSel('Exchange by', 'method', [['dialysis', 'Dialysis (against a buffer bath)'], ['spin', 'Spin concentrator (ultrafiltration)']], 'dialysis')}
        ${fieldUnit('Component starting conc.', 'c0', MOLAR, 'mM', { hint: 'Optional — e.g. imidazole to remove' })}
      </div>`)}

      <div id="dialPanel">${panel('Dialysis', `
        <div class="grid g3">
          ${fieldUnit('Sample volume', 'dsample', VOL, 'mL')}
          ${fieldUnit('Bath volume (each change)', 'dbath', VOL, 'L')}
          ${fieldNum('Number of buffer changes', 'dchanges', { value: 3 })}
        </div>
        <div class="formula">residual per change = V_sample ÷ (V_sample + V_bath)   — the equilibrium limit</div>`)}</div>

      <div id="spinPanel">${panel('Spin concentrator', `
        <div class="grid g3">
          ${fieldUnit('Fill volume (each round)', 'cfill', VOL, 'mL')}
          ${fieldUnit('Concentrated down to', 'cret', VOL, 'µL')}
          ${fieldNum('Dilute / spin rounds', 'crounds', { value: 3 })}
        </div>
        <div class="formula">residual per round = V_final ÷ V_fill   — salts pass the membrane freely</div>`)}</div>

      ${panel('Target (optional)', `<div class="grid g2">
        ${fieldNum('Reduce old buffer by (fold)', 'targetFold', { placeholder: 'e.g. 1000' })}
        <div class="field"><label>&nbsp;</label><div class="muted tiny" style="padding-top:9px">We’ll tell you how many rounds that needs.</div></div>
      </div>`)}

      <div id="out"></div>

      ${panel('Practical guidance (rules of thumb — verify with your device)', `
        <div class="grid g2">
          <div>
            <div class="panel-title" style="margin-bottom:6px">Dialysis</div>
            <ul class="muted tiny" style="margin:0;padding-left:16px;line-height:1.6">
              <li>Use a bath ≥ 100× the sample per change; ≥ 3 changes gives &gt;10⁶-fold removal.</li>
              <li>Let each change reach equilibrium: ~2–4 h at room temperature with stirring, roughly double that at 4 °C. Making one change an overnight is common.</li>
              <li>Thinner samples, larger membrane area and stirring all speed equilibration; a single change can never beat the equilibrium limit above.</li>
              <li>Pick an MWCO well below your protein (e.g. 3.5–10 kDa) so it’s retained while salts exchange.</li>
            </ul>
          </div>
          <div>
            <div class="panel-title" style="margin-bottom:6px">Spin concentrator</div>
            <ul class="muted tiny" style="margin:0;padding-left:16px;line-height:1.6">
              <li>Choose an MWCO ~2–3× below your protein’s mass (e.g. 10 kDa for a 30 kDa protein).</li>
              <li>Concentrating alone doesn’t remove salt — the dilute-and-respin rounds do.</li>
              <li><b>Speed:</b> most 2–20 mL units are safe at <b>3,000–4,000 × g</b> in a swinging-bucket rotor; small 0.5 mL fixed-angle units go to ~14,000 × g. MWCO mainly sets spin <i>time</i>, not the maximum speed.</li>
              <li>Always confirm the maximum g on the device insert — over-spinning can rupture the membrane and lose the sample. Don’t spin to complete dryness.</li>
            </ul>
          </div>
        </div>`)}
    `;
  },
  mount() {},
  compute(root) {
    const method = $('#f-method', root).value;
    $('#dialPanel', root).style.display = method === 'dialysis' ? '' : 'none';
    $('#spinPanel', root).style.display = method === 'spin' ? '' : 'none';

    const c0 = ok(num($('#f-c0', root))) ? num($('#f-c0', root)) * MOLAR[$('[data-k="c0U"]', root).value] : NaN;
    const out = $('#out', root);
    const isDial = method === 'dialysis';

    let f, rounds, retained, needMsg = '';
    if (isDial) {
      const vs = num($('#f-dsample', root)) * VOL[$('[data-k="dsampleU"]', root).value];
      const vb = num($('#f-dbath', root)) * VOL[$('[data-k="dbathU"]', root).value];
      rounds = Math.round(num($('#f-dchanges', root)));
      if (!ok(vs) || !ok(vb) || vs <= 0 || vb <= 0 || !ok(rounds) || rounds < 0) {
        out.innerHTML = `<div class="panel muted">Enter a sample volume, a bath volume and the number of changes.</div>`; return;
      }
      f = vs / (vs + vb);
    } else {
      const vf = num($('#f-cfill', root)) * VOL[$('[data-k="cfillU"]', root).value];
      const vr = num($('#f-cret', root)) * VOL[$('[data-k="cretU"]', root).value];
      rounds = Math.round(num($('#f-crounds', root)));
      if (!ok(vf) || !ok(vr) || vf <= 0 || vr <= 0 || !ok(rounds) || rounds < 0) {
        out.innerHTML = `<div class="panel muted">Enter a fill volume, a concentrated volume and the number of rounds.</div>`; return;
      }
      if (vr >= vf) { out.innerHTML = `<div class="note">The concentrated volume must be smaller than the fill volume, or no buffer is exchanged.</div>`; return; }
      f = vr / vf;
    }

    const residual = exchangeResidual(f, rounds);
    const fold = 1 / residual;
    const removedPct = (1 - residual) * 100;
    const perFold = 1 / f;

    const targetFold = num($('#f-targetFold', root));
    if (ok(targetFold) && targetFold > 1) {
      const need = roundsForTarget(f, targetFold);
      needMsg = `<div class="note">To reduce the old buffer <b>${fmt(targetFold)}×</b>, you need <b>${need}</b> ${isDial ? 'buffer change' + (need === 1 ? '' : 's') : 'dilute/spin round' + (need === 1 ? '' : 's')} at this ratio (${fmt(perFold, 4)}× per ${isDial ? 'change' : 'round'}).</div>`;
    }

    // per-round table
    const rowsN = Math.min(Math.max(rounds, 1), 20);
    let rowsHtml = '';
    for (let i = 1; i <= rowsN; i++) {
      const r = exchangeResidual(f, i);
      rowsHtml += `<tr><td>${i}</td><td class="num">${fmt(r, 3)}</td><td class="num">${fmt(1 / r, 4)}×</td>
        <td class="num">${fmt((1 - r) * 100, 5)} %</td>${ok(c0) ? `<td class="num">${showMolar(c0 * r)}</td>` : ''}</tr>`;
    }

    out.innerHTML = `
      <div class="result">
        <div class="result-main">${fmt(fold, 4)}× reduction</div>
        <div class="result-sub">${fmt(removedPct, 5)} % of the old buffer removed after ${rounds} ${isDial ? 'change' + (rounds === 1 ? '' : 's') : 'round' + (rounds === 1 ? '' : 's')}${ok(c0) ? ` · residual ≈ ${showMolar(c0 * residual)}` : ''}.</div>
      </div>
      ${needMsg}
      ${panel('Details', readout([
        [isDial ? 'Per change' : 'Per round', `${fmt(perFold, 4)}× (leaves ${fmt(f, 3)})`],
        ['Total reduction', `${fmt(fold, 4)}×`],
        ['Residual fraction', fmt(residual, 3)],
        ['Old buffer removed', `${fmt(removedPct, 5)} %`],
        ...(ok(c0) ? [['Residual concentration', showMolar(c0 * residual)]] : []),
      ]))}
      ${panel('Round by round', `<div class="table-scroll"><table>
        <thead><tr><th>${isDial ? 'Change' : 'Round'}</th><th>Residual</th><th>Reduction</th><th>Removed</th>${ok(c0) ? '<th>Residual conc.</th>' : ''}</tr></thead>
        <tbody>${rowsHtml}</tbody></table></div>`)}
      ${isDial ? `<div class="muted tiny">Assumes each change reaches equilibrium. If a change is stopped early, the real residual is higher than shown.</div>` : ''}
    `;
  },
};

/* ---------- Plate layout ---------- */

TOOLS.plate = {
  group: 'Bench',
  name: '96-well plate layout',
  title: '96-well plate layout',
  blurb: 'Paint conditions onto a 96- or 384-well plate, save the layout to your library, and export the map as CSV for your plate reader or notebook.',
  render() {
    return `
      ${panel('Plate', `
        <div class="grid g3">
          ${fieldSel('Format', 'fmt', [['96', '96-well (8 × 12)'], ['384', '384-well (16 × 24)'], ['24', '24-well (4 × 6)'], ['6', '6-well (2 × 3)']], '96')}
          ${fieldSel('Fill direction', 'dir', [['row', 'By row'], ['col', 'By column']], 'row')}
          ${fieldNum('Replicates', 'reps', { value: 3, hint: 'Used by auto-fill' })}
        </div>
        <div class="chip-row" style="margin-top:12px">
          <button class="ghost-btn" type="button" id="autoFill">Auto-fill conditions</button>
          <button class="ghost-btn" type="button" id="clearPlate">Clear plate</button>
          <button class="ghost-btn" type="button" id="exportCsv">Export CSV</button>
        </div>
      `)}
      ${panel('Conditions', `
        <div id="conds" class="stack"></div>
        <div class="chip-row" style="margin-top:10px">
          <button class="ghost-btn" type="button" id="addCond">Add condition</button>
        </div>
        <div class="muted tiny" style="margin-top:8px">
          Select a condition, then click or drag across wells to paint. Click a painted well with
          the eraser selected to clear it.
        </div>
      `)}
      ${panel('Layout', `<div class="plate-scroll" id="plateWrap"></div><div class="legend" id="legend"></div>`)}
      <div id="out"></div>
      ${panel('Save', `
        <div class="grid g3">
          <div class="field"><label for="f-platetitle">Layout name</label>
            <input id="f-platetitle" data-k="platetitle" type="text" placeholder="e.g. Cytotoxicity screen — plate 1"></div>
          <div class="field"><label>&nbsp;</label><button class="primary-btn" id="plateSave" type="button">Save to My Library</button></div>
          <div class="field"><label>&nbsp;</label><div class="muted tiny" id="plateSaveMsg" style="padding-top:9px"></div></div>
        </div>
      `)}
    `;
  },
  mount(root) {
    const self = this;
    const PALETTE = ['#1f7a52', '#2f6fb5', '#a5522d', '#7a4fa3', '#b5892f', '#3f9d9d', '#a8386a', '#5c7a2f'];

    let conds = store['plate.conds'] || [
      { name: 'Blank', color: PALETTE[7] },
      { name: 'Vehicle', color: PALETTE[1] },
      { name: 'Treatment', color: PALETTE[0] },
    ];
    let map = store['plate.map'] || {};
    let selected = 0;
    let painting = false;

    const dims = () => ({ 96: [8, 12], 384: [16, 24], 24: [4, 6], 6: [2, 3] }[$('#f-fmt', root).value] || [8, 12]);

    function persist() {
      store['plate.conds'] = conds;
      store['plate.map'] = map;
      writeStore();
    }

    function renderConds() {
      $('#conds', root).innerHTML = conds.map((c, i) => `
        <div class="row-between">
          <div class="chip-row" style="flex:1">
            <button class="chip ${i === selected ? 'on' : ''}" data-sel="${i}" type="button">
              <span style="display:inline-block;width:9px;height:9px;border-radius:3px;background:${esc(c.color)};margin-right:6px"></span>
              ${esc(c.name || 'Untitled')}
            </button>
          </div>
          <input data-name="${i}" value="${esc(c.name)}" style="max-width:200px">
          <input data-color="${i}" type="color" value="${esc(c.color)}" style="width:44px;padding:2px">
          <button class="ghost-btn" data-rm="${i}" type="button">×</button>
        </div>`).join('') + `
        <div class="chip-row">
          <button class="chip ${selected === -1 ? 'on' : ''}" data-sel="-1" type="button">Eraser</button>
        </div>`;

      $$('[data-sel]', root).forEach(b => b.addEventListener('click', () => {
        selected = Number(b.dataset.sel); renderConds();
      }));
      $$('[data-name]', root).forEach(inp => inp.addEventListener('input', () => {
        conds[Number(inp.dataset.name)].name = inp.value; persist(); renderLegend(); renderSummary();
      }));
      $$('[data-color]', root).forEach(inp => inp.addEventListener('input', () => {
        conds[Number(inp.dataset.color)].color = inp.value; persist(); drawPlate(); renderLegend();
      }));
      $$('[data-rm]', root).forEach(b => b.addEventListener('click', () => {
        const i = Number(b.dataset.rm);
        conds.splice(i, 1);
        Object.keys(map).forEach(k => {
          if (map[k] === i) delete map[k];
          else if (map[k] > i) map[k] -= 1;
        });
        selected = Math.min(selected, conds.length - 1);
        persist(); renderConds(); drawPlate(); renderLegend(); renderSummary();
      }));
    }

    function wellName(r, c) { return String.fromCharCode(65 + r) + String(c + 1).padStart(2, '0'); }

    function drawPlate() {
      const [rows, cols] = dims();
      let html = `<table class="plate ${rows === 16 ? 'p384' : ''}"><thead><tr><th></th>`;
      for (let c = 0; c < cols; c++) html += `<th>${c + 1}</th>`;
      html += `</tr></thead><tbody>`;
      for (let r = 0; r < rows; r++) {
        html += `<tr><th>${String.fromCharCode(65 + r)}</th>`;
        for (let c = 0; c < cols; c++) {
          const id = wellName(r, c);
          const ci = map[id];
          const cond = conds[ci];
          const bg = cond ? cond.color : '';
          html += `<td><div class="well" data-well="${id}"
            title="${esc(id)}${cond ? ' · ' + esc(cond.name) : ''}"
            style="${bg ? `background:${esc(bg)};border-color:${esc(bg)};color:#fff` : ''}">${cond ? esc(cond.name.slice(0, 3)) : ''}</div></td>`;
        }
        html += `</tr>`;
      }
      html += `</tbody></table>`;
      $('#plateWrap', root).innerHTML = html;

      $$('[data-well]', root).forEach(el => {
        el.addEventListener('mousedown', (e) => { e.preventDefault(); painting = true; paint(el); });
        el.addEventListener('mouseenter', () => { if (painting) paint(el); });
      });
    }

    function paint(el) {
      const id = el.dataset.well;
      if (selected === -1) delete map[id]; else map[id] = selected;
      const cond = conds[map[id]];
      el.style.background = cond ? cond.color : '';
      el.style.borderColor = cond ? cond.color : '';
      el.style.color = cond ? '#fff' : '';
      el.textContent = cond ? cond.name.slice(0, 3) : '';
      persist(); renderSummary();
    }

    function renderLegend() {
      $('#legend', root).innerHTML = conds.map(c =>
        `<div class="item"><span class="sw" style="background:${esc(c.color)}"></span>${esc(c.name || 'Untitled')}</div>`
      ).join('');
    }

    function renderSummary() {
      const [rows, cols] = dims();
      const counts = conds.map(() => 0);
      Object.values(map).forEach(i => { if (counts[i] !== undefined) counts[i]++; });
      const used = Object.keys(map).length;
      $('#out', root).innerHTML = panel('Summary', readout([
        ['Wells used', `${used} / ${rows * cols}`],
        ['Empty', String(rows * cols - used)],
        ['Conditions', String(conds.length)],
        ...conds.map((c, i) => [c.name || 'Untitled', `${counts[i]} well${counts[i] === 1 ? '' : 's'}`]),
      ]));
    }

    function autoFill() {
      const [rows, cols] = dims();
      const reps = Math.max(1, Math.round(num($('#f-reps', root)) || 1));
      const byRow = $('#f-dir', root).value === 'row';
      map = {};
      let idx = 0;
      const order = [];
      if (byRow) { for (let r = 0; r < rows; r++) for (let c = 0; c < cols; c++) order.push([r, c]); }
      else { for (let c = 0; c < cols; c++) for (let r = 0; r < rows; r++) order.push([r, c]); }

      for (const [r, c] of order) {
        const condIndex = Math.floor(idx / reps);
        if (condIndex >= conds.length) break;
        map[wellName(r, c)] = condIndex;
        idx++;
      }
      persist(); drawPlate(); renderSummary();
    }

    function exportCsv() {
      const [rows, cols] = dims();
      const lines = ['Well,Row,Column,Condition'];
      for (let r = 0; r < rows; r++) {
        for (let c = 0; c < cols; c++) {
          const id = wellName(r, c);
          const cond = conds[map[id]];
          lines.push(`${id},${String.fromCharCode(65 + r)},${c + 1},"${(cond ? cond.name : '').replace(/"/g, '""')}"`);
        }
      }
      const blob = new Blob([lines.join('\n')], { type: 'text/csv' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob);
      a.download = `plate-layout-${$('#f-fmt', root).value}.csv`;
      a.click();
      URL.revokeObjectURL(a.href);
    }

    document.addEventListener('mouseup', () => { painting = false; });

    $('#addCond', root).addEventListener('click', () => {
      conds.push({ name: `Condition ${conds.length + 1}`, color: PALETTE[conds.length % PALETTE.length] });
      selected = conds.length - 1;
      persist(); renderConds(); renderLegend(); renderSummary();
    });
    $('#autoFill', root).addEventListener('click', autoFill);
    $('#clearPlate', root).addEventListener('click', () => { map = {}; persist(); drawPlate(); renderSummary(); });
    $('#exportCsv', root).addEventListener('click', exportCsv);
    $('#f-fmt', root).addEventListener('change', () => { drawPlate(); renderSummary(); });

    $('#plateSave', root).addEventListener('click', () => {
      const title = ($('#f-platetitle', root).value || 'Untitled plate').trim();
      addLibraryItem({
        kind: 'plate', title,
        format: $('#f-fmt', root).value,
        conds: JSON.parse(JSON.stringify(conds)),
        map: { ...map },
      });
      const m = $('#plateSaveMsg', root);
      if (m) { m.textContent = 'Saved to My Library.'; setTimeout(() => { m.textContent = ''; }, 1800); }
    });

    renderConds(); drawPlate(); renderLegend(); renderSummary();
    this._redraw = () => { drawPlate(); renderSummary(); };
  },
  compute() { /* the plate tool updates itself as you paint */ },
};

/* ---------- Centrifugation ---------- */

TOOLS.spin = {
  group: 'Bench',
  name: 'Centrifuge g ↔ rpm',
  title: 'Centrifugation',
  blurb: 'Convert between relative centrifugal force and rotor speed, and translate a protocol between two rotors.',
  render() {
    return `
      ${panel('Convert', `
        <div class="grid g3">
          ${fieldNum('Rotor radius (mm)', 'rad', { value: 87, hint: 'Use r-max unless the protocol says otherwise' })}
          ${fieldNum('Speed (rpm)', 'rpm', { placeholder: 'leave blank to solve' })}
          ${fieldNum('RCF (× g)', 'rcf', { placeholder: 'leave blank to solve' })}
        </div>
        <div class="formula">RCF = 1.118 × 10⁻⁶ × r(mm) × rpm²</div>
      `)}
      ${panel('Transfer a protocol to another rotor', `
        <div class="grid g3">
          ${fieldNum('Original radius (mm)', 'r1', { placeholder: 'e.g. 87' })}
          ${fieldNum('Original speed (rpm)', 'rpm1', { placeholder: 'e.g. 14000' })}
          ${fieldNum('Your rotor radius (mm)', 'r2', { placeholder: 'e.g. 95' })}
        </div>
        <div id="xferOut" style="margin-top:12px"></div>
      `)}
      <div id="out"></div>
    `;
  },
  mount() {},
  compute(root) {
    const K = 1.118e-6;
    releaseSolved(root, this);

    const rad = num($('#f-rad', root));
    const rpmEl = $('#f-rpm', root), rcfEl = $('#f-rcf', root);
    let rpm = num(rpmEl), rcf = num(rcfEl);

    $$('input.solved', root).forEach(el => el.classList.remove('solved'));
    const out = $('#out', root);

    let solved = null;
    if (ok(rad) && rad > 0) {
      if (ok(rpm) && !ok(rcf)) {
        rcf = K * rad * rpm * rpm;
        rcfEl.value = fmt(rcf, 5); rcfEl.classList.add('solved'); solved = 'rcf';
      } else if (ok(rcf) && !ok(rpm)) {
        rpm = Math.sqrt(rcf / (K * rad));
        rpmEl.value = fmt(rpm, 5); rpmEl.classList.add('solved'); solved = 'rpm';
      }
    }
    markSolved(this, solved);

    out.innerHTML = (ok(rad) && ok(rpm) && ok(rcf))
      ? `<div class="result">
           <div class="result-main">${fmt(rcf, 5)} × g at ${fmt(rpm, 5)} rpm</div>
           <div class="result-sub">Rotor radius ${fmt(rad, 4)} mm. Always quote × g in a protocol — rpm is meaningless without the rotor.</div>
         </div>`
      : `<div class="panel muted">Enter a radius plus either a speed or an RCF.</div>`;

    /* Rotor transfer */
    const r1 = num($('#f-r1', root)), rpm1 = num($('#f-rpm1', root)), r2 = num($('#f-r2', root));
    const xf = $('#xferOut', root);
    if (ok(r1) && ok(rpm1) && ok(r2) && r1 > 0 && r2 > 0) {
      const g1 = K * r1 * rpm1 * rpm1;
      const rpm2 = Math.sqrt(g1 / (K * r2));
      xf.innerHTML = readout([
        ['Original RCF', `${fmt(g1, 5)} × g`],
        ['Speed on your rotor', `${fmt(rpm2, 5)} rpm`],
        ['Speed change', `${fmt(((rpm2 - rpm1) / rpm1) * 100, 3)} %`],
      ]);
    } else {
      xf.innerHTML = `<div class="muted tiny">Enter both radii and the original speed.</div>`;
    }
  },
};

/* ---------- Unit converter ---------- */

TOOLS.units = {
  group: 'Bench',
  name: 'Unit converter',
  title: 'Unit converter',
  blurb: 'Mass, volume, molar concentration, amount of substance and temperature, all in one place.',
  render() {
    const block = (id, label, table) => panel(label, `
      <div class="grid g3">
        ${fieldNum('Value', id + 'v', { placeholder: '1' })}
        ${fieldSel('From', id + 'u', Object.keys(table), Object.keys(table)[1] || Object.keys(table)[0])}
        <div class="field"><label>&nbsp;</label><div class="muted tiny" style="padding-top:9px">Results update as you type.</div></div>
      </div>
      <div id="${id}Out" style="margin-top:12px"></div>
    `);
    return `
      ${block('m', 'Mass', MASS)}
      ${block('v', 'Volume', VOL)}
      ${block('c', 'Molar concentration', MOLAR)}
      ${block('n', 'Amount of substance', MOLE)}
      ${panel('Temperature', `
        <div class="grid g3">
          ${fieldNum('Celsius', 'tc', { placeholder: '25' })}
          ${fieldNum('Fahrenheit', 'tf', { placeholder: '77' })}
          ${fieldNum('Kelvin', 'tk', { placeholder: '298.15' })}
        </div>
        <div class="muted tiny" style="margin-top:8px">Type in any one box; the others follow.</div>
      `)}
    `;
  },
  mount(root) {
    // Temperature fields are mutually dependent, so track which one the user edited last.
    ['tc', 'tf', 'tk'].forEach(k => {
      $(`#f-${k}`, root).addEventListener('input', () => { this._temp = k; });
    });
  },
  compute(root) {
    const conv = (id, table) => {
      const v = num($(`#f-${id}v`, root));
      const u = $(`#f-${id}u`, root).value;
      const target = $(`#${id}Out`, root);
      if (!ok(v)) { target.innerHTML = `<div class="muted tiny">Enter a value.</div>`; return; }
      const base = v * table[u];
      target.innerHTML = readout(Object.keys(table).map(k => [k, fmt(base / table[k], 6)]));
    };
    conv('m', MASS); conv('v', VOL); conv('c', MOLAR); conv('n', MOLE);

    const src = this._temp || 'tc';
    const c = num($('#f-tc', root)), f = num($('#f-tf', root)), k = num($('#f-tk', root));
    if (src === 'tc' && ok(c)) {
      $('#f-tf', root).value = fmt(c * 9 / 5 + 32, 6);
      $('#f-tk', root).value = fmt(c + 273.15, 6);
    } else if (src === 'tf' && ok(f)) {
      $('#f-tc', root).value = fmt((f - 32) * 5 / 9, 6);
      $('#f-tk', root).value = fmt((f - 32) * 5 / 9 + 273.15, 6);
    } else if (src === 'tk' && ok(k)) {
      $('#f-tc', root).value = fmt(k - 273.15, 6);
      $('#f-tf', root).value = fmt((k - 273.15) * 9 / 5 + 32, 6);
    }
  },
};

/* ============================================================
   My Recipes & Protocols — storage + shared rendering
   ============================================================ */

// Stable UUIDs so the same item reconciles across devices during sync.
const uid = () => (globalThis.crypto && crypto.randomUUID)
  ? crypto.randomUUID()
  : 'i' + Date.now().toString(36) + Math.random().toString(36).slice(2, 9);
const getLibrary = () => { const v = store['library.items']; return Array.isArray(v) ? v : []; };
const setLibrary = (items) => { store['library.items'] = items; writeStore(); };

function addLibraryItem(item) {
  const items = getLibrary();
  item.id = uid();
  item.createdAt = Date.now();
  item.updatedAt = Date.now();
  items.unshift(item);
  setLibrary(items);
  syncPushItem(item);           // no-op unless signed in + unlocked
  return item;
}
function updateLibraryItem(id, patch) {
  const items = getLibrary();
  const it = items.find(x => x.id === id);
  if (it) { Object.assign(it, patch); it.updatedAt = Date.now(); }
  setLibrary(items);
  if (it) syncPushItem(it);
}
function deleteLibraryItem(id) {
  const it = getLibrary().find(x => x.id === id);
  setLibrary(getLibrary().filter(x => x.id !== id));
  syncPushTombstone(id, it && it.kind);
}

/* A saved component may predate the current fields; fill in physical state from the
   reagent table so % handling and MW fallback still work. */
function hydrateComponent(c) {
  const m = c.name ? matchReagent(c.name) : null;
  return {
    name: c.name || '', inputName: c.name || '',
    conc: ok(Number(c.conc)) ? Number(c.conc) : NaN,
    unit: c.unit || null,
    mw: ok(Number(c.mw)) ? Number(c.mw) : (m ? m.mw : null),
    pH: ok(Number(c.pH)) ? Number(c.pH) : null,
    phys: c.phys || (m ? m.phys : 'solid'),
    matched: !!m,
  };
}

/** Shared protocol view, used by the import tool and the recipe detail in the library. */
function renderRecipeOutput(res, volumeL) {
  return `
    ${res.overdrawn ? `<div class="note">Liquid components alone exceed the batch volume. Increase the volume or use more concentrated inputs.</div>` : ''}
    <div class="result">
      <div class="result-main">${showVol(volumeL)} batch</div>
      <div class="result-sub">${res.lines.length} component${res.lines.length === 1 ? '' : 's'} · ${showVol(res.usedVol)} from liquids + ${res.overdrawn ? '—' : showVol(res.water)} solvent to volume.</div>
    </div>
    ${panel('Protocol', res.lines.length ? `<div class="table-scroll"><table>
      <thead><tr><th>Step</th><th>Component</th><th>Target</th><th>Amount</th></tr></thead>
      <tbody>
        ${res.lines.map((l, i) => `<tr>
          <td>${i + 1}</td><td>${esc(l.name)}</td>
          <td class="num">${esc(l.target)}</td>
          <td class="num">${l.kind === 'note'
            ? `<span class="muted">${esc(l.display)}${l.note ? ` — ${esc(l.note)}` : ''}</span>`
            : l.display + (l.kind === 'mass' ? ' (weigh)' : '')}</td>
        </tr>`).join('')}
        <tr><td>${res.lines.length + 1}</td><td>Solvent</td><td class="num">to volume</td>
            <td class="num">${res.overdrawn ? '—' : showVol(res.water)}</td></tr>
      </tbody></table></div>`
      : `<div class="muted">Parse a recipe or add components to see the protocol.</div>`)}
  `;
}

/* ---------- Buffer from image / text ---------- */

TOOLS.import = {
  group: 'Recipes',
  name: 'Buffer from image / text',
  title: 'Buffer from image or text',
  blurb: 'Paste a buffer description — or photograph one — and TheLabToolkit turns it into a weigh-out protocol. Recognised reagents are matched to a molecular-weight table; edit anything it gets wrong. Images are read on your device and never uploaded.',
  render() {
    return `
      ${panel('Source', `
        <div class="field">
          <textarea id="f-btext" data-k="btext" spellcheck="false" style="min-height:120px"
            placeholder="One component per line, e.g.&#10;20 mM Tris-HCl pH 7.5&#10;150 mM NaCl&#10;1 mM EDTA&#10;1 mM DTT&#10;10% glycerol"></textarea>
        </div>
        <div class="chip-row" style="margin-top:10px">
          <button class="primary-btn" id="parseBtn" type="button">Parse</button>
          <button class="ghost-btn" id="imgBtn" type="button">Scan image…</button>
          <button class="ghost-btn" id="clearBtn" type="button">Clear</button>
          <input type="file" id="imgInput" accept="image/*" hidden>
        </div>
        <div class="muted tiny" id="ocrStatus" style="margin-top:8px"></div>
        <img id="imgPreview" alt="" hidden
             style="margin-top:10px;max-height:180px;max-width:100%;border-radius:8px;border:1px solid var(--line)">
      `)}
      ${panel('Batch', `<div class="grid g3">${fieldUnit('Total volume', 'ivol', VOL, 'mL', { value: 50 })}</div>`)}
      ${panel('Components', `
        <div class="table-scroll"><table>
          <thead><tr>
            <th style="min-width:150px">Component</th><th>Conc.</th><th>Unit</th>
            <th>MW</th><th>pH</th><th>Amount</th><th></th>
          </tr></thead>
          <tbody id="importRows"></tbody>
        </table></div>
        <div class="chip-row" style="margin-top:10px"><button class="ghost-btn" id="addRowBtn" type="button">Add component</button></div>
        <div class="muted tiny" style="margin-top:8px">Components with an amber outline weren't found in the reagent list — check the spelling or type a molecular weight. Leave MW blank for a recognised reagent and its book value is used.</div>
      `)}
      <div id="out"></div>
      ${panel('Save', `
        <div class="grid g3">
          <div class="field"><label for="f-ititle">Recipe name</label>
            <input id="f-ititle" data-k="ititle" type="text" placeholder="e.g. Lysis buffer"></div>
          <div class="field"><label>&nbsp;</label><button class="primary-btn" id="saveBtn" type="button">Save to My Recipes</button></div>
          <div class="field"><label>&nbsp;</label><div class="muted tiny" id="saveMsg" style="padding-top:9px"></div></div>
        </div>
      `)}
    `;
  },
  mount(root) {
    const self = this;
    const rowsBody = $('#importRows', root);

    const rowHTML = (c = {}) => `<tr>
      <td><input data-c="name" value="${esc(c.name || c.inputName || '')}" style="min-width:150px"></td>
      <td><input data-c="conc" type="number" step="any" value="${esc(ok(Number(c.conc)) ? c.conc : '')}" style="width:78px"></td>
      <td><select data-c="unit" style="width:92px"><option value="">—</option>${RECIPE_UNITS.map(u => `<option${u === c.unit ? ' selected' : ''}>${esc(u)}</option>`).join('')}</select></td>
      <td><input data-c="mw" type="number" step="any" value="${esc(ok(Number(c.mw)) ? c.mw : '')}" placeholder="g/mol" style="width:84px"></td>
      <td><input data-c="ph" type="number" step="any" value="${esc(ok(Number(c.pH)) ? c.pH : '')}" placeholder="—" style="width:60px"></td>
      <td class="num" data-amt>—</td>
      <td><button class="ghost-btn" data-del type="button">×</button></td>
    </tr>`;

    const addRow = (c) => { rowsBody.insertAdjacentHTML('beforeend', rowHTML(c)); wireRow(rowsBody.lastElementChild); };
    const wireRow = (tr) => $('[data-del]', tr).addEventListener('click', () => { tr.remove(); self.compute(root); });
    const renderRows = (comps) => { rowsBody.innerHTML = ''; comps.forEach(addRow); };

    const parseNow = () => {
      const res = parseBufferText($('#f-btext', root).value);
      renderRows(res.components);
      const ti = $('#f-ititle', root);
      if (res.title && ti && !ti.value) { ti.value = res.title; save(); }
      self.compute(root);
    };

    $('#parseBtn', root).addEventListener('click', parseNow);
    $('#addRowBtn', root).addEventListener('click', () => addRow({}));
    $('#clearBtn', root).addEventListener('click', () => {
      $('#f-btext', root).value = ''; rowsBody.innerHTML = '';
      $('#imgPreview', root).hidden = true; $('#ocrStatus', root).textContent = '';
      store['import.rows'] = []; writeStore(); save(); self.compute(root);
    });
    $('#imgBtn', root).addEventListener('click', () => $('#imgInput', root).click());
    $('#imgInput', root).addEventListener('change', async (e) => {
      const file = e.target.files && e.target.files[0];
      if (!file) return;
      const status = $('#ocrStatus', root), prev = $('#imgPreview', root);
      try { prev.src = URL.createObjectURL(file); prev.hidden = false; } catch {}
      status.textContent = 'Reading image… this can take a few seconds.';
      try {
        const text = await ocrImage(file, p => { status.textContent = `Reading image… ${Math.round(p * 100)}%`; });
        $('#f-btext', root).value = text.trim(); save();
        status.textContent = 'Recognised the text below — check it, then it was parsed for you.';
        parseNow();
      } catch (err) {
        status.textContent = err.message || 'Could not read the image. Type or paste the recipe instead.';
      } finally { e.target.value = ''; }
    });
    $('#saveBtn', root).addEventListener('click', () => {
      const comps = self.readRows(root).filter(c => c.inputName || ok(c.conc));
      const msg = $('#saveMsg', root);
      if (!comps.length) { if (msg) msg.textContent = 'Nothing to save yet.'; return; }
      const title = ($('#f-ititle', root).value || 'Untitled recipe').trim();
      addLibraryItem({ kind: 'recipe', title, components: comps.map(c => ({ name: c.name, conc: c.conc, unit: c.unit, mw: c.mw, pH: c.pH, phys: c.phys })), volumeL: self.getVol(root) });
      if (msg) { msg.textContent = 'Saved to My Recipes.'; setTimeout(() => { msg.textContent = ''; }, 1800); }
    });

    const saved = store['import.rows'];
    if (Array.isArray(saved) && saved.length) renderRows(saved.map(hydrateComponent));
    else if ($('#f-btext', root).value.trim()) parseNow();
  },
  readRows(root) {
    return $$('#importRows tr', root).map(tr => {
      const g = (k) => { const el = $(`[data-c="${k}"]`, tr); return el ? el.value : ''; };
      const name = g('name').trim();
      const rawMw = g('mw'), mwNum = Number(rawMw);
      const m = name ? matchReagent(name) : null;
      const phNum = Number(g('ph'));
      return {
        name: name || (m ? m.name : ''),
        inputName: name,
        conc: g('conc') === '' ? NaN : Number(g('conc')),
        unit: g('unit') || null,
        mw: (rawMw !== '' && isFinite(mwNum)) ? mwNum : (m ? m.mw : null),
        pH: (g('ph') !== '' && isFinite(phNum)) ? phNum : null,
        phys: m ? m.phys : 'solid',
        matched: !!m,
      };
    });
  },
  getVol(root) {
    const sel = $('[data-k="ivolU"]', root);
    return num($('#f-ivol', root)) * (sel ? VOL[sel.value] : 1e-3);
  },
  compute(root) {
    const comps = this.readRows(root);
    const volumeL = this.getVol(root);
    const rows = $$('#importRows tr', root);

    comps.forEach((c, i) => {
      const tr = rows[i]; if (!tr) return;
      const a = componentAmount(c, ok(volumeL) ? volumeL : 0);
      $('[data-amt]', tr).textContent = ok(volumeL) && volumeL > 0 ? a.display : '—';
      const nameInp = $('[data-c="name"]', tr);
      if (nameInp) {
        const known = c.matched || ok(c.mw);
        nameInp.style.borderColor = (c.inputName && !known) ? 'var(--warn)' : '';
        nameInp.title = c.matched ? c.name : (c.inputName ? 'Not in the reagent list — check the name or enter a molecular weight' : '');
      }
    });

    store['import.rows'] = comps.map(c => ({ name: c.name, conc: c.conc, unit: c.unit, mw: c.mw, pH: c.pH, phys: c.phys }));
    writeStore();

    const out = $('#out', root);
    if (!ok(volumeL) || volumeL <= 0) { out.innerHTML = `<div class="panel muted">Enter a batch volume to compute amounts.</div>`; return; }
    out.innerHTML = renderRecipeOutput(computeRecipe(comps, volumeL), volumeL);
  },
};

/* ---------- My recipes & protocols ---------- */

TOOLS.library = {
  group: 'Recipes',
  name: 'My recipes & protocols',
  title: 'My recipes & protocols',
  blurb: 'Your saved buffer recipes and bench protocols, stored in this browser. Export them to a file to back up or move between machines.',
  render() {
    return `
      ${panel('', `<div class="chip-row">
        <button class="primary-btn" id="addProto" type="button">New protocol</button>
        <button class="ghost-btn" id="exportLib" type="button">Export all</button>
        <button class="ghost-btn" id="importLib" type="button">Import…</button>
        <input type="file" id="importFile" accept="application/json,.json" hidden>
      </div>`)}
      <div class="lib-layout">
        <div id="libList"></div>
        <div id="libDetail"></div>
      </div>
    `;
  },
  mount(root) {
    const self = this;
    self._sel = self._sel || null;

    const fmtDate = (ts) => { try { return new Date(ts).toLocaleDateString(undefined, { year: 'numeric', month: 'short', day: 'numeric' }); } catch { return ''; } };

    function renderList() {
      const items = getLibrary();
      const list = $('#libList', root);
      if (!items.length) {
        list.innerHTML = `<div class="panel muted tiny">No saved items yet. Build a recipe in “Buffer from image / text” and press Save, or start a protocol here.</div>`;
        return;
      }
      list.innerHTML = items.map(it => `<button class="lib-card ${it.id === self._sel ? 'on' : ''}" data-id="${esc(it.id)}" type="button">
        <span class="lib-badge">${({ recipe: 'Recipe', protocol: 'Protocol', plate: 'Plate' })[it.kind] || 'Item'}</span>
        <span class="lib-title">${esc(it.title || 'Untitled')}</span>
        <span class="lib-date">${esc(fmtDate(it.createdAt))}</span>
      </button>`).join('');
      $$('#libList .lib-card', root).forEach(b => b.addEventListener('click', () => { self._sel = b.dataset.id; renderList(); renderDetail(); }));
    }

    function renderDetail() {
      const det = $('#libDetail', root);
      const it = getLibrary().find(x => x.id === self._sel);
      if (!it) { det.innerHTML = `<div class="panel muted">Select an item to view it, or create one on the left.</div>`; return; }
      if (it.kind === 'recipe') recipeDetail(det, it);
      else if (it.kind === 'plate') plateDetail(det, it);
      else protocolDetail(det, it);
    }

    function recipeDetail(det, it) {
      det.innerHTML = `
        ${panel('', `<div class="row-between">
          <div><div class="panel-title" style="margin:0">Recipe</div><div style="font-size:18px;font-weight:600;margin-top:2px">${esc(it.title || 'Untitled')}</div></div>
          <div class="chip-row"><button class="ghost-btn" id="loadBuilder" type="button">Edit in builder</button><button class="ghost-btn" id="delItem" type="button">Delete</button></div>
        </div>`)}
        ${panel('Batch volume', `<div class="grid g3">${fieldUnit('Total volume', 'lvol', VOL, 'mL')}</div>`)}
        <div id="libRecipeOut"></div>`;

      const s = scale(it.volumeL || 0.05, VOL);
      $('#f-lvol', det).value = fmt(s.v, 5);
      $('[data-k="lvolU"]', det).value = s.u;

      const recompute = () => {
        const V = num($('#f-lvol', det)) * VOL[$('[data-k="lvolU"]', det).value];
        const box = $('#libRecipeOut', det);
        if (!ok(V) || V <= 0) { box.innerHTML = `<div class="panel muted">Enter a batch volume.</div>`; return; }
        box.innerHTML = renderRecipeOutput(computeRecipe(it.components.map(hydrateComponent), V), V);
      };
      $('#f-lvol', det).addEventListener('input', recompute);
      $('[data-k="lvolU"]', det).addEventListener('change', recompute);
      $('#delItem', det).addEventListener('click', () => { if (confirm('Delete this recipe?')) { deleteLibraryItem(it.id); self._sel = null; renderList(); renderDetail(); } });
      $('#loadBuilder', det).addEventListener('click', () => {
        store['import.rows'] = it.components.map(c => ({ name: c.name, conc: c.conc, unit: c.unit, mw: c.mw, pH: c.pH, phys: c.phys }));
        writeStore();
        go('import');
      });
      recompute();
    }

    function protocolDetail(det, it) {
      det.innerHTML = `
        ${panel('', `<div class="row-between">
          <div style="flex:1"><div class="panel-title" style="margin:0">Protocol</div>
            <input id="protoTitle" value="${esc(it.title || '')}" placeholder="Protocol name"
                   style="font-size:17px;font-weight:600;border:0;background:transparent;padding:4px 0;width:100%"></div>
          <div class="chip-row"><button class="ghost-btn" id="delItem" type="button">Delete</button></div>
        </div>`)}
        ${panel('Steps', `<textarea id="protoBody" spellcheck="false" style="min-height:300px;font-family:var(--sans);font-size:14px;letter-spacing:normal">${esc(it.body || '')}</textarea>
          <div class="muted tiny" id="protoSaved" style="margin-top:6px">Saved automatically.</div>`)}`;

      const saveNow = () => {
        updateLibraryItem(it.id, { title: $('#protoTitle', det).value, body: $('#protoBody', det).value });
        $('#protoSaved', det).textContent = 'Saved ' + new Date().toLocaleTimeString();
        renderList();
      };
      $('#protoTitle', det).addEventListener('input', saveNow);
      $('#protoBody', det).addEventListener('input', saveNow);
      $('#delItem', det).addEventListener('click', () => { if (confirm('Delete this protocol?')) { deleteLibraryItem(it.id); self._sel = null; renderList(); renderDetail(); } });
    }

    function plateDetail(det, it) {
      const [rows, cols] = ({ 96: [8, 12], 384: [16, 24], 24: [4, 6], 6: [2, 3] })[it.format] || [8, 12];
      const map = it.map || {};
      const conds = it.conds || [];
      const counts = conds.map(() => 0);
      Object.values(map).forEach(i => { if (counts[i] !== undefined) counts[i]++; });
      const used = Object.keys(map).length;

      det.innerHTML = `
        ${panel('', `<div class="row-between">
          <div><div class="panel-title" style="margin:0">Plate layout</div><div style="font-size:18px;font-weight:600;margin-top:2px">${esc(it.title || 'Untitled')}</div></div>
          <div class="chip-row"><button class="ghost-btn" id="loadPlate" type="button">Edit in designer</button><button class="ghost-btn" id="delItem" type="button">Delete</button></div>
        </div>`)}
        ${panel('Summary', readout([
          ['Format', `${esc(it.format)}-well`],
          ['Conditions', String(conds.length)],
          ['Wells used', `${used} / ${rows * cols}`],
          ['Empty', String(rows * cols - used)],
        ]))}
        ${panel('Conditions', conds.length
          ? `<div class="legend">${conds.map((c, i) => `<div class="item"><span class="sw" style="background:${esc(c.color)}"></span>${esc(c.name || 'Untitled')} · ${counts[i]} well${counts[i] === 1 ? '' : 's'}</div>`).join('')}</div>`
          : `<div class="muted">No conditions.</div>`)}`;

      $('#loadPlate', det).addEventListener('click', () => {
        store['plate.conds'] = JSON.parse(JSON.stringify(conds));
        store['plate.map'] = { ...map };
        store['plate.fmt'] = it.format;
        writeStore();
        go('plate');
      });
      $('#delItem', det).addEventListener('click', () => { if (confirm('Delete this plate layout?')) { deleteLibraryItem(it.id); self._sel = null; renderList(); renderDetail(); } });
    }

    $('#addProto', root).addEventListener('click', () => {
      const it = addLibraryItem({ kind: 'protocol', title: 'Untitled protocol', body: '' });
      self._sel = it.id; renderList(); renderDetail();
      const t = $('#protoTitle', $('#libDetail', root)); if (t) { t.focus(); t.select(); }
    });
    $('#exportLib', root).addEventListener('click', () => {
      const blob = new Blob([JSON.stringify(getLibrary(), null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'labtoolkit-library.json'; a.click();
      URL.revokeObjectURL(a.href);
    });
    $('#importLib', root).addEventListener('click', () => $('#importFile', root).click());
    $('#importFile', root).addEventListener('change', (e) => {
      const f = e.target.files && e.target.files[0]; if (!f) return;
      const r = new FileReader();
      r.onload = () => {
        try {
          const data = JSON.parse(r.result);
          if (!Array.isArray(data)) throw new Error('bad');
          const items = getLibrary();
          for (const it of data) if (it && it.kind) { it.id = uid(); if (!it.createdAt) it.createdAt = Date.now(); items.push(it); }
          setLibrary(items); renderList(); renderDetail();
        } catch { alert('That file is not a TheLabToolkit library export.'); }
      };
      r.readAsText(f); e.target.value = '';
    });

    renderList(); renderDetail();
  },
  compute() { /* self-managed */ },
};

/* ============================================================
   Accounts & sync (Supabase)
   ============================================================ */

/* PRIVACY MODEL: synced items are stored on the server, protected by per-user Row-Level
   Security and Supabase's encryption at rest. This is NOT end-to-end encryption — the
   operator can, in principle, read stored rows. This model was chosen so a standard
   "forgot password" reset can restore a user's data (only possible if the server can
   recover it). The UI states this plainly. Local-only use needs no account. */

let sb = null;             // supabase client, or null until configured + lib loaded
let authSession = null;    // current auth session, or null
let recoveryMode = false;  // true when arriving from a password-reset email link
let syncBusy = false;
let syncMsg = '';

function initSupabase() {
  if (sb) return sb;
  if (!SYNC_ENABLED || !window.supabase) return null;
  const c = window.LABTOOLKIT_CONFIG;
  sb = window.supabase.createClient(c.supabaseUrl, c.supabaseAnonKey, {
    auth: { persistSession: true, autoRefreshToken: true, detectSessionInUrl: true, flowType: 'pkce' },
  });
  sb.auth.onAuthStateChange((event, sess) => onAuth(event, sess));
  return sb;
}

async function onAuth(event, sess) {
  if (event === 'PASSWORD_RECOVERY') {
    recoveryMode = true;
    authSession = sess || authSession;
    updateAuthButton();
    if (current !== 'account') go('account'); else renderAccount($('#content'));
    return;
  }
  const had = !!authSession;
  authSession = sess || null;
  recoveryMode = false;
  updateAuthButton();
  if (current === 'account') renderAccount($('#content'));
  if (authSession && (!had || event === 'SIGNED_IN')) fullSync();
}

/* ---- auth ---- */
async function signUpEmail(email, pw) {
  const { data, error } = await sb.auth.signUp({ email, password: pw, options: { emailRedirectTo: location.origin } });
  if (error) throw error;
  return data.session ? 'signed-in' : 'confirm-email';
}
async function signInEmail(email, pw) {
  const { error } = await sb.auth.signInWithPassword({ email, password: pw });
  if (error) throw error;
}
async function signInGoogle() {
  const { error } = await sb.auth.signInWithOAuth({ provider: 'google', options: { redirectTo: location.origin } });
  if (error) throw error;
}
async function sendPasswordReset(email) {
  const { error } = await sb.auth.resetPasswordForEmail(email, { redirectTo: location.origin });
  if (error) throw error;
}
async function setNewPassword(pw) {
  const { error } = await sb.auth.updateUser({ password: pw });
  if (error) throw error;
  recoveryMode = false;
}
async function signOutAccount() {
  try { await sb.auth.signOut(); } catch {}
  authSession = null; recoveryMode = false;
}

/* ---- sync (plaintext payload — see privacy note above) ---- */
const canSync = () => !!(sb && authSession);

async function syncPushItem(item) {
  if (!canSync()) return;
  try {
    await sb.from('items').upsert({ id: item.id, user_id: authSession.user.id, kind: item.kind, payload: item, updated_at: new Date(item.updatedAt || Date.now()).toISOString(), deleted: false });
  } catch {}
}
async function syncPushTombstone(id, kind) {
  if (!canSync()) return;
  try {
    await sb.from('items').upsert({ id, user_id: authSession.user.id, kind: kind || 'recipe', payload: {}, updated_at: new Date().toISOString(), deleted: true });
  } catch {}
}

async function fullSync() {
  if (!canSync() || syncBusy) return;
  syncBusy = true; syncMsg = 'Syncing…';
  if (current === 'account') renderAccount($('#content'));
  try {
    const { data: rows, error } = await sb.from('items').select('id,kind,payload,updated_at,deleted');
    if (error) throw error;
    const remote = (rows || []).map(r => ({ id: r.id, kind: r.kind, updatedAt: Date.parse(r.updated_at), deleted: r.deleted, item: r.deleted ? null : r.payload }));
    const { merged, toPush } = mergeItems(getLibrary(), remote);
    setLibrary(merged);
    for (const it of toPush) await syncPushItem(it);
    store['sync.lastAt'] = Date.now(); writeStore();
    syncMsg = 'Last synced ' + new Date().toLocaleTimeString();
    if (current === 'library') go('library');
  } catch (e) {
    syncMsg = 'Sync failed: ' + (e.message || 'error');
  } finally {
    syncBusy = false;
    if (current === 'account') renderAccount($('#content'));
  }
}

async function deleteAccountData() {
  if (!sb || !authSession) return;
  await sb.from('items').delete().eq('user_id', authSession.user.id);
  await signOutAccount();
}

/* ---- Account UI ---- */

function renderAccount(root) {
  const box = root && $('#acctBody', root);
  if (!box) return;
  if (!SYNC_ENABLED) {
    box.innerHTML = panel('', `<div class="muted">Accounts aren’t enabled in this build. The calculators and local saving work without an account.</div>`);
    return;
  }
  if (!initSupabase()) {
    box.innerHTML = panel('', `<div class="note">Couldn’t reach the accounts service — you may be offline, or opening the app as a file. The calculators still work and your saved items stay on this device.</div>`);
    return;
  }
  if (recoveryMode) return acctSetNewPassword(box);
  if (!authSession) return acctSignedOut(box);
  return acctSignedIn(box);
}

const bindSignOut = (box) => $('#acSignOut', box)?.addEventListener('click', async () => { await signOutAccount(); renderAccount($('#content')); });

function acctSignedOut(box) {
  box.innerHTML = `
    ${panel('Sign in', `
      <div class="grid g2">
        <div class="field"><label for="acEmail">Email</label><input id="acEmail" type="email" autocomplete="email"></div>
        <div class="field"><label for="acPw">Password</label><input id="acPw" type="password" autocomplete="current-password"></div>
      </div>
      <div class="chip-row" style="margin-top:12px">
        <button class="primary-btn" id="acSignIn" type="button">Sign in</button>
        <button class="ghost-btn" id="acSignUp" type="button">Create account</button>
        <button class="ghost-btn" id="acGoogle" type="button">Continue with Google</button>
        <button class="ghost-btn" id="acForgot" type="button">Forgot password?</button>
      </div>
      <div class="muted tiny" id="acMsg" style="margin-top:10px"></div>
    `)}
    ${panel('', `<div class="muted tiny">You don’t need an account to use TheLabToolkit — the calculators and local saving work without one. Signing in syncs your saved recipes, protocols and plate layouts across your devices. Synced items are stored on our server, private to your account (but not end-to-end encrypted) — see About &amp; privacy.</div>`)}`;
  const msg = (t) => { const m = $('#acMsg', box); if (m) m.textContent = t; };
  const email = () => $('#acEmail', box).value.trim();
  const pw = () => $('#acPw', box).value;
  $('#acSignIn', box).addEventListener('click', async () => { msg('Signing in…'); try { await signInEmail(email(), pw()); } catch (e) { msg(e.message || 'Sign-in failed.'); } });
  $('#acSignUp', box).addEventListener('click', async () => { msg('Creating account…'); try { const r = await signUpEmail(email(), pw()); msg(r === 'confirm-email' ? 'Check your email to confirm, then sign in.' : 'Account created.'); } catch (e) { msg(e.message || 'Sign-up failed.'); } });
  $('#acGoogle', box).addEventListener('click', async () => { try { await signInGoogle(); } catch (e) { msg(e.message || 'Google sign-in failed.'); } });
  $('#acForgot', box).addEventListener('click', async () => {
    const e = email();
    if (!e) return msg('Enter your email above first, then tap Forgot password.');
    msg('Sending reset link…');
    try { await sendPasswordReset(e); msg(`If an account exists for ${e}, a password-reset link is on its way. Open it on this device.`); }
    catch (err) { msg(err.message || 'Could not send the reset email.'); }
  });
}

function acctSetNewPassword(box) {
  box.innerHTML = panel('Set a new password', `
    <p class="muted" style="margin:0 0 10px">Resetting the password for <b>${esc((authSession && authSession.user && authSession.user.email) || 'your account')}</b>. Choose a new one.</p>
    <div class="grid g2">
      <div class="field"><label for="acNew1">New password</label><input id="acNew1" type="password" autocomplete="new-password"></div>
      <div class="field"><label for="acNew2">Confirm password</label><input id="acNew2" type="password" autocomplete="new-password"></div>
    </div>
    <div class="chip-row" style="margin-top:12px"><button class="primary-btn" id="acSetPw" type="button">Save new password</button></div>
    <div class="muted tiny" id="acMsg" style="margin-top:10px"></div>
  `);
  const msg = (t) => { const m = $('#acMsg', box); if (m) m.textContent = t; };
  $('#acSetPw', box).addEventListener('click', async () => {
    const a = $('#acNew1', box).value, b = $('#acNew2', box).value;
    if (a.length < 8) return msg('Use at least 8 characters.');
    if (a !== b) return msg('Passwords don’t match.');
    msg('Saving…');
    try { await setNewPassword(a); renderAccount($('#content')); } catch (e) { msg(e.message || 'Could not update the password.'); }
  });
}

function acctSignedIn(box) {
  box.innerHTML = `
    ${panel('Account', readout([
      ['Signed in as', esc(authSession.user.email || '—')],
      ['Sync', 'On (across your devices)'],
      ['Status', esc(syncBusy ? 'Syncing…' : (syncMsg || (store['sync.lastAt'] ? 'Last synced ' + new Date(store['sync.lastAt']).toLocaleTimeString() : 'Ready')))],
    ]))}
    ${panel('', `<div class="chip-row">
      <button class="primary-btn" id="acSyncNow" type="button">Sync now</button>
      <button class="ghost-btn" id="acSignOut" type="button">Sign out</button>
    </div>`)}
    ${panel('Your data (GDPR)', `
      <div class="chip-row">
        <button class="ghost-btn" id="acExport" type="button">Download my data</button>
        <button class="ghost-btn" id="acDelete" type="button">Delete account data</button>
      </div>
      <div class="muted tiny" style="margin-top:10px">Download gives you all your saved items as JSON. Delete permanently removes every item synced to your account from the server and signs you out. Items saved on this device stay in this browser until you clear them (see About &amp; privacy).</div>`)}`;
  bindSignOut(box);
  $('#acSyncNow', box).addEventListener('click', () => fullSync());
  $('#acExport', box).addEventListener('click', () => {
    const blob = new Blob([JSON.stringify({ app: 'TheLabToolkit', exportedAt: new Date().toISOString(), items: getLibrary() }, null, 2)], { type: 'application/json' });
    const a = document.createElement('a'); a.href = URL.createObjectURL(blob); a.download = 'labtoolkit-my-data.json'; a.click(); URL.revokeObjectURL(a.href);
  });
  $('#acDelete', box).addEventListener('click', async () => {
    if (!confirm('Permanently delete every item synced to your account from the server, and sign out? Items saved on this device are kept locally. This cannot be undone.')) return;
    try { await deleteAccountData(); renderAccount($('#content')); } catch (e) { alert('Delete failed: ' + (e.message || 'error')); }
  });
}

TOOLS.account = {
  group: 'Account',
  system: true,
  name: 'Account & sync',
  title: 'Account & sync',
  blurb: 'Optional. Sign in to sync your saved recipes, protocols and plate layouts across your devices. Synced items are private to your account, but not end-to-end encrypted.',
  render() { return `<div id="acctBody"></div>`; },
  mount(root) { renderAccount(root); },
  compute() {},
};

/* ---------- Customize toolkit (system) ---------- */

TOOLS.settings = {
  group: 'Settings',
  system: true,
  name: 'Customize toolkit',
  title: 'Customize your toolkit',
  blurb: 'Choose which calculators appear in the sidebar and the order they show in. Hidden tools are only removed from the menu — nothing is deleted, and you can bring them back any time. Saved on this device.',
  render() {
    return `<div id="custList"></div>
      ${panel('', `<div class="chip-row"><button class="ghost-btn" id="custReset" type="button">Reset to default</button></div>`)}`;
  },
  mount(root) {
    const self = this;
    const listEl = $('#custList', root);

    function draw() {
      const order = toolOrder();
      const groups = {};
      for (const id of order) (groups[TOOLS[id].group] ||= []).push(id);

      listEl.innerHTML = Object.entries(groups).map(([g, ids]) => panel(g,
        ids.map((id, i) => {
          const t = TOOLS[id];
          const hidden = isToolHidden(id);
          return `<div class="cust-row">
            <label class="cust-toggle">
              <input type="checkbox" data-show="${esc(id)}" ${hidden ? '' : 'checked'}>
              <span class="${hidden ? 'muted' : ''}">${esc(t.name)}</span>
            </label>
            <div class="chip-row">
              <button class="ghost-btn cust-move" data-up="${esc(id)}" type="button" ${i === 0 ? 'disabled' : ''} aria-label="Move up">↑</button>
              <button class="ghost-btn cust-move" data-down="${esc(id)}" type="button" ${i === ids.length - 1 ? 'disabled' : ''} aria-label="Move down">↓</button>
            </div>
          </div>`;
        }).join('')
      )).join('');

      $$('[data-show]', listEl).forEach(cb => cb.addEventListener('change', () => {
        setToolHidden(cb.dataset.show, !cb.checked);
        buildNav(); draw();
      }));
      $$('[data-up]', listEl).forEach(b => b.addEventListener('click', () => { moveTool(b.dataset.up, -1); buildNav(); draw(); }));
      $$('[data-down]', listEl).forEach(b => b.addEventListener('click', () => { moveTool(b.dataset.down, 1); buildNav(); draw(); }));
    }

    $('#custReset', root).addEventListener('click', () => {
      delete store['nav.hidden']; delete store['nav.order'];
      writeStore(); buildNav(); draw();
    });

    draw();
  },
  compute() {},
};

/* ---------- About & privacy (system) ---------- */

TOOLS.about = {
  group: 'Settings',
  system: true,
  name: 'About & privacy',
  title: 'About, privacy & your data',
  blurb: 'What TheLabToolkit does with what you type — and the controls to take your data with you or wipe it.',
  render() {
    return `
      ${panel('How your data is handled', `
        <div class="stack">
          <p style="margin:0">The <b>calculators run entirely in your browser</b>. Numbers you type into a
          calculator are never sent anywhere.</p>
          <p style="margin:0">Your <b>saved recipes, protocols and plate layouts</b> are stored on this device.
          ${SYNC_ENABLED
            ? `If you <b>sign in</b>, they also sync to your account so you can reach them on other devices.
               Synced items are stored on our server and are private to your account (protected by
               per-user access control and encryption at rest), but they are <b>not end-to-end encrypted</b> —
               so, like any hosted service, they are technically readable by the operator. Don’t sync anything
               you need to keep provably private; keep that local-only (don’t sign in), or export it.`
            : `Account sign-in and cross-device sync are coming; until then nothing you save leaves this device.`}</p>
          <p style="margin:0">Photographs you scan are read on your device (in-browser OCR). The image is
          not uploaded.</p>
        </div>
      `)}
      ${panel('Your data controls', `
        <div class="chip-row">
          <button class="primary-btn" id="aboutExport" type="button">Export my data</button>
          <button class="ghost-btn" id="aboutWipe" type="button">Delete all data on this device</button>
        </div>
        <div class="muted tiny" id="aboutMsg" style="margin-top:10px">
          Export downloads everything saved on this device as a JSON file. Delete removes it permanently
          from this browser — this cannot be undone.
        </div>
      `)}
      ${panel('', `<div class="muted tiny">TheLabToolkit performs standard textbook calculations and makes no claim
        about any specific assay, reagent or protocol. Always check values against your own records.</div>`)}
    `;
  },
  mount(root) {
    $('#aboutExport', root).addEventListener('click', () => {
      const dump = { app: 'TheLabToolkit', exportedAt: new Date().toISOString(), data: {} };
      try { for (const k in localStorage) dump.data[k] = localStorage.getItem(k); } catch {}
      const blob = new Blob([JSON.stringify(dump, null, 2)], { type: 'application/json' });
      const a = document.createElement('a');
      a.href = URL.createObjectURL(blob); a.download = 'labtoolkit-data-export.json'; a.click();
      URL.revokeObjectURL(a.href);
    });
    $('#aboutWipe', root).addEventListener('click', () => {
      if (!confirm('Delete every TheLabToolkit recipe, protocol and setting stored in this browser? This cannot be undone.')) return;
      try { localStorage.removeItem(STORE_KEY); } catch {}
      store = {};
      $('#aboutMsg', root).textContent = 'All local data deleted. Reloading…';
      setTimeout(() => location.reload(), 700);
    });
  },
  compute() {},
};

/* ============================================================
   Persistence
   ============================================================ */

/* Set once a Supabase config is present (see config.js + SETUP.md). Until then the app
   is fully functional in local-only mode and the messaging reflects that. */
const SYNC_ENABLED = typeof window !== 'undefined'
  && window.LABTOOLKIT_CONFIG && !!window.LABTOOLKIT_CONFIG.supabaseUrl;

const STORE_KEY = 'labtoolkit.v1';
let store = {};

function readStore() {
  try { store = JSON.parse(localStorage.getItem(STORE_KEY)) || {}; }
  catch { store = {}; }
}
function writeStore() {
  try { localStorage.setItem(STORE_KEY, JSON.stringify(store)); } catch { /* private mode */ }
}

/** Snapshot every [data-k] control in the current tool. */
function save() {
  const root = $('#content');
  $$('[data-k]', root).forEach(el => { store[`${current}.${el.dataset.k}`] = el.value; });
  writeStore();
}

function restore(root) {
  $$('[data-k]', root).forEach(el => {
    const v = store[`${current}.${el.dataset.k}`];
    if (v !== undefined && v !== null) el.value = v;
  });
}

/* ============================================================
   Shell
   ============================================================ */

let current = 'molarity';

/* ---------- customization state ---------- */

// User-visible (non-system) tool ids, in the user's saved order, with any newly shipped
// tools appended so an update never hides a new calculator.
function toolOrder() {
  const all = Object.keys(TOOLS).filter(id => !TOOLS[id].system);
  const saved = Array.isArray(store['nav.order']) ? store['nav.order'] : [];
  const known = saved.filter(id => TOOLS[id] && !TOOLS[id].system);
  return [...known, ...all.filter(id => !known.includes(id))];
}
const isToolHidden = (id) => Array.isArray(store['nav.hidden']) && store['nav.hidden'].includes(id);
function setToolHidden(id, hidden) {
  const set = new Set(Array.isArray(store['nav.hidden']) ? store['nav.hidden'] : []);
  if (hidden) set.add(id); else set.delete(id);
  store['nav.hidden'] = [...set];
  writeStore();
}
// Swap a tool with its nearest neighbour in the same group.
function moveTool(id, dir) {
  const order = toolOrder();
  const idx = order.indexOf(id);
  if (idx < 0) return;
  const group = TOOLS[id].group;
  let j = idx + dir;
  while (j >= 0 && j < order.length && TOOLS[order[j]].group !== group) j += dir;
  if (j < 0 || j >= order.length) return;
  [order[idx], order[j]] = [order[j], order[idx]];
  store['nav.order'] = order;
  writeStore();
}

function buildNav() {
  const groups = {};
  for (const id of toolOrder()) {
    if (isToolHidden(id)) continue;
    (groups[TOOLS[id].group] ||= []).push([id, TOOLS[id]]);
  }

  const groupHTML = ([g, items]) => `
    <div class="nav-group">${esc(g)}</div>
    ${items.map(([id, t]) => `<button class="nav-item" data-tool="${id}" type="button">${esc(t.name)}</button>`).join('')}`;

  // System tools (Customize, About) always appear, pinned to the bottom.
  const systemItems = Object.entries(TOOLS).filter(([, t]) => t.system);

  $('#nav').innerHTML = Object.entries(groups).map(groupHTML).join('')
    + groupHTML(['Settings', systemItems]);

  $$('#nav .nav-item').forEach(b =>
    b.addEventListener('click', () => { go(b.dataset.tool); closeSidebar(); }));
}

function go(id) {
  if (!TOOLS[id]) id = 'molarity';
  current = id;
  const tool = TOOLS[id];

  $$('#nav .nav-item').forEach(b => b.classList.toggle('active', b.dataset.tool === id));
  $('#topbarTitle').textContent = tool.title;

  const root = $('#content');
  root.innerHTML = `<div class="wrap">
    <div class="tool-head"><h1>${esc(tool.title)}</h1><p>${esc(tool.blurb)}</p></div>
    ${tool.render()}
  </div>`;

  restore(root);
  tool._solved = store[`${id}.__solved`] || null;
  lastEdited = null;
  tool.mount(root);
  tool.compute(root);
  root.scrollTop = 0;

  if (location.hash.slice(1) !== id) history.replaceState(null, '', `#${id}`);
  store['labtoolkit.last'] = id;
  writeStore();
}

let lastEdited = null;

function onChange(e) {
  if (e.target.matches('[data-k]')) { lastEdited = e.target.dataset.k; save(); }
  TOOLS[current].compute($('#content'));
}

/* Tools that back-fill a field (molarity, dilution, centrifugation) remember which one
   they solved. When the user edits a *different* field the stale answer is cleared so it
   can be solved again; when they edit the solved field itself they take ownership of it. */
function releaseSolved(root, tool) {
  if (!tool._solved) return;

  // The user typed into the field we had solved — they now own it.
  if (lastEdited === tool._solved) { tool._solved = null; return; }

  // The user *cleared* some other field: that blank is the new target, so keep our
  // previous answer as an input rather than blanking it too (which would leave two holes).
  const edited = lastEdited ? $(`#f-${lastEdited}`, root) : null;
  if (edited && String(edited.value).trim() === '') { tool._solved = null; return; }

  const el = $(`#f-${tool._solved}`, root);
  if (el) { el.value = ''; el.classList.remove('solved'); }
}

function markSolved(tool, key) {
  tool._solved = key || null;
  store[`${current}.__solved`] = tool._solved;
  writeStore();
}

/* ---------- top-bar auth button ---------- */

// Reflects auth state: "Sign in / Register" when signed out, "Sign out" when signed in.
function updateAuthButton() {
  const b = $('#authBtn');
  if (!b) return;
  b.textContent = (SYNC_ENABLED && authSession) ? 'Sign out' : 'Sign in / Register';
}

async function onAuthButtonClick() {
  if (SYNC_ENABLED && authSession) {
    await signOutAccount();
    updateAuthButton();
    if (current === 'account') renderAccount($('#content'));
  } else {
    go('account');
  }
}

/* ---------- theme & mobile nav ---------- */

function applyTheme(t) {
  document.documentElement.dataset.theme = t;
  store['labtoolkit.theme'] = t;
  writeStore();
}

const closeSidebar = () => {
  $('#sidebar').classList.remove('open');
  $('#scrim').classList.remove('on');
};

/* ---------- boot ---------- */

readStore();
applyTheme(store['labtoolkit.theme'] ||
  (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'));

buildNav();

$('#themeToggle').addEventListener('click', () =>
  applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));

$('#authBtn').addEventListener('click', onAuthButtonClick);
updateAuthButton();

// One delegated listener for the whole content area, attached once.
$('#content').addEventListener('input', onChange);
$('#content').addEventListener('change', onChange);

$('#menuBtn').addEventListener('click', () => {
  $('#sidebar').classList.add('open');
  $('#scrim').classList.add('on');
});
$('#scrim').addEventListener('click', closeSidebar);

// Dismissible footer disclaimer — hidden once, remembered per device.
const foot = $('#foot');
if (foot && store['foot.dismissed']) foot.hidden = true;
$('#footClose')?.addEventListener('click', () => {
  if (foot) foot.hidden = true;
  store['foot.dismissed'] = true;
  writeStore();
});

window.addEventListener('hashchange', () => go(location.hash.slice(1)));

/* ---------- installable app (PWA) ---------- */

// A service worker needs a secure context; it can't run from a file:// double-click.
if ('serviceWorker' in navigator && location.protocol.startsWith('http')) {
  window.addEventListener('load', () => navigator.serviceWorker.register('sw.js').catch(() => {}));
}

// Chromium fires beforeinstallprompt, which lets the button trigger a native install.
// Safari/iOS never fires it, so the button shows step-by-step instructions instead.
let deferredPrompt = null;
const installBtn = $('#installBtn');

const isIOS = /iphone|ipad|ipod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1); // iPadOS masquerades as Mac
const isStandalone = matchMedia('(display-mode: standalone)').matches || navigator.standalone === true;

// Show the button whenever we're not already installed — every platform can install
// *somehow*, and the click handler explains how for those without a native prompt.
if (installBtn && !isStandalone) installBtn.hidden = false;

window.addEventListener('beforeinstallprompt', (e) => {
  e.preventDefault();
  deferredPrompt = e;
  if (installBtn) installBtn.hidden = false;
  maybeShowInstallBanner();
});
window.addEventListener('appinstalled', () => {
  if (installBtn) installBtn.hidden = true;
  const banner = $('#installBanner'); if (banner) banner.hidden = true;
});

/* First-visit teaching banner: shows new visitors how to add TheLabToolkit to their home
   screen. Appears once (until dismissed or installed), only when not already running as an
   installed app, and is tailored to the platform. */
const IOS_SHARE = '<span class="ib-share" aria-hidden="true"><svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 15V3M12 3l-4 4M12 3l4 4"/><path d="M6 11H5a2 2 0 0 0-2 2v6a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-6a2 2 0 0 0-2-2h-1"/></svg></span>';

function maybeShowInstallBanner() {
  const banner = $('#installBanner');
  if (!banner || isStandalone || store['install.dismissed']) return;

  let msg;
  if (isIOS) {
    msg = `<b>Add TheLabToolkit to your Home Screen.</b> In Safari, tap Share ${IOS_SHARE} then “Add to Home Screen”.`;
  } else if (deferredPrompt) {
    msg = `<b>Install TheLabToolkit</b> as an app — works offline, opens full-screen.`;
  } else if (/android/i.test(navigator.userAgent)) {
    msg = `<b>Add TheLabToolkit to your Home Screen.</b> In Chrome, open the ⋮ menu then “Add to Home screen”.`;
  } else {
    return; // desktop without an install prompt — don't nag
  }

  $('.ib-text', banner).innerHTML = msg;
  const action = $('#ibAction', banner);
  action.hidden = !deferredPrompt;
  banner.hidden = false;
}

$('#ibDismiss')?.addEventListener('click', () => {
  const banner = $('#installBanner'); if (banner) banner.hidden = true;
  store['install.dismissed'] = true; writeStore();
});
$('#ibAction')?.addEventListener('click', async () => {
  if (!deferredPrompt) return;
  deferredPrompt.prompt();
  await deferredPrompt.userChoice;
  deferredPrompt = null;
  const banner = $('#installBanner'); if (banner) banner.hidden = true;
});

if (installBtn) {
  installBtn.addEventListener('click', async () => {
    if (deferredPrompt) {
      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      installBtn.hidden = true;
    } else if (isIOS) {
      alert('Add TheLabToolkit to your iPhone or iPad:\n\n'
        + '1. Make sure you are in Safari (Chrome cannot install on iPhone)\n'
        + '2. Tap the Share button — the square with an up-arrow at the bottom\n'
        + '3. Scroll down and tap "Add to Home Screen"\n'
        + '4. Tap "Add"\n\n'
        + 'TheLabToolkit then appears as an icon on your home screen.');
    } else {
      alert('Install TheLabToolkit on your device:\n\n'
        + '• Android (Chrome): ⋮ menu → Add to Home screen / Install app\n'
        + '• Desktop (Chrome / Edge): the install icon at the right of the address bar\n'
        + '• iPhone / iPad: open this page in Safari, then Share → Add to Home Screen\n\n'
        + 'The page must be opened from its web address (https), not a downloaded file.');
    }
  });
}

// Initialise auth on load. The onAuthStateChange listener fires INITIAL_SESSION to restore
// an existing session, handle the OAuth redirect, and catch password-recovery links.
if (SYNC_ENABLED) initSupabase();

go(location.hash.slice(1) || store['labtoolkit.last'] || 'molarity');

// iOS/Android fire no install event, so try to show the teaching banner on first paint too.
maybeShowInstallBanner();
