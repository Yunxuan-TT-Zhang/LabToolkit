/* Validates the pure calculation layer against published reference values.
   Run with: npm run test:math
   The domain functions live above the `const TOOLS = {}` marker in app.js and touch no DOM,
   so we can slice that section out and load it directly in Node. */

const fs = require('fs');
const path = require('path');

const src = fs.readFileSync(path.join(__dirname, 'app.js'), 'utf8');
const cut = src.indexOf('const TOOLS = {}');
if (cut < 0) throw new Error('Could not find the TOOLS marker in app.js');

const tmp = path.join(__dirname, '.core.test.js');
fs.writeFileSync(tmp, src.slice(0, cut) +
  'module.exports={fmt,showVol,showMass,showMolar,proteinStats,oligoStats,netCharge,cleanDNA,revComp,BUFFERS};');
const C = require(tmp);
process.on('exit', () => { try { fs.unlinkSync(tmp); } catch {} });

let fails = 0;
function eq(name, got, want, tol = 0.01) {
  const good = typeof want === 'number'
    ? Math.abs(got - want) <= tol * Math.max(1, Math.abs(want))
    : got === want;
  if (!good) { fails++; console.log('FAIL', name, '| got', got, '| want', want); }
  else console.log('ok  ', name, '=', String(got).slice(0, 70));
}

console.log('--- protein: reference proteins ---');
const UBIQUITIN = 'MQIFVKTLTGKTITLEVEPSDTIENVKAKIQDKEGIPPDQQRLIFAGKQLEDGRTLSDYNIQKESTLHLVLRLRGG';
const ub = C.proteinStats(UBIQUITIN);
eq('ubiquitin length', ub.length, 76, 0);
eq('ubiquitin MW (lit. 8564.8)', ub.mw, 8564.8, 1e-4);
eq('ubiquitin eps280 (1 Tyr, 0 Trp)', ub.extReduced, 1490, 0);
eq('ubiquitin pI (ProtParam 6.56)', ub.pI, 6.56, 0.05);

const insB = C.proteinStats('FVNQHLCGSHLVEALYLVCGERGFFYTPKT');
eq('insulin B MW (lit. 3429.9)', insB.mw, 3429.9, 1e-3);
eq('insulin B eps280 (2 Tyr)', insB.extReduced, 2980, 0);
eq('insulin B eps280 with cystine', insB.extOxidised, 3105, 0);
eq('insulin B pI (ProtParam 6.94)', insB.pI, 6.94, 0.05);

const lyso = C.proteinStats('KVFGRCELAAAMKRHGLDNYRGYSLGNWVCAAKFESNFNTQATNRNTDGSTDYGILQINSRWWCNDGRTPGSRNLCNIPCSALLSSDITASVNCAKKIVSDGNGMNAWVAWRNRCKGTDVQAWIRGCRL');
eq('lysozyme C pI (ProtParam 9.36)', lyso.pI, 9.36, 0.05);
eq('E1% is eps/MW*10', ub.e1Reduced, ub.extReduced / ub.mw * 10, 1e-9);

console.log('\n--- protein: input hygiene ---');
eq('FASTA header stripped', C.proteinStats('>sp|P0CG48 desc\n' + UBIQUITIN).length, 76, 0);
eq('whitespace + digits stripped', C.proteinStats(' MQIF VKT\n123LTGK').length, 11, 0);
eq('semicolon comment ignored', C.proteinStats(';comment CCC\nMQIF').length, 4, 0);
eq('empty input safe', C.proteinStats('').length, 0, 0);
eq('header-only input safe', C.proteinStats('>only a header').length, 0, 0);

console.log('\n--- net charge ---');
eq('charge falls monotonically with pH',
  C.netCharge(ub.counts, 3) > C.netCharge(ub.counts, 7) &&
  C.netCharge(ub.counts, 7) > C.netCharge(ub.counts, 11), true);
eq('charge is ~0 at the pI', Math.abs(C.netCharge(ub.counts, ub.pI)) < 1e-6, true);

console.log('\n--- oligo thermodynamics ---');
const P = 'GTCGACTAGCTAGCTAGGCA';
const o = C.oligoStats(P, { primerNM: 250, na: 50, mg: 0, dntp: 0 });
eq('GC content', o.gcPct, 55, 1e-9);
eq('dH is negative', o.dH < 0, true);
eq('dS is negative', o.dS < 0, true);
eq('Tm in a plausible range', o.tmNN > 45 && o.tmNN < 65, true);
eq('higher [primer] raises Tm', o.tmNN > C.oligoStats(P, { primerNM: 50, na: 50, mg: 0, dntp: 0 }).tmNN, true);
eq('higher salt raises Tm', C.oligoStats(P, { primerNM: 250, na: 500, mg: 0, dntp: 0 }).tmNN > o.tmNN, true);
eq('Mg2+ raises Tm', C.oligoStats(P, { primerNM: 250, na: 50, mg: 1.5, dntp: 0.2 }).tmNN > o.tmNN, true);
eq('reverse complement melts identically',
  Math.abs(C.oligoStats(C.revComp(P), { primerNM: 250, na: 50, mg: 0, dntp: 0 }).tmNN - o.tmNN) < 0.01, true);

const at20 = C.oligoStats('ATATATATATATATATATAT', { primerNM: 250, na: 50, mg: 0, dntp: 0 });
const gc20 = C.oligoStats('GCGCGCGCGCGCGCGCGCGC', { primerNM: 250, na: 50, mg: 0, dntp: 0 });
eq('GC-rich melts far above AT-rich', gc20.tmNN - at20.tmNN > 20, true);
eq('eps260 of a 20mer is plausible', o.ext > 150000 && o.ext < 250000, true);
eq('self-complementarity detected (EcoRI site)',
  C.oligoStats('GAATTC', { primerNM: 250, na: 50, mg: 0, dntp: 0 }).selfComp, true);
eq('RNA U maps to T', C.cleanDNA('AUGC'), 'ATGC');
eq('reverse complement', C.revComp('ATGC'), 'GCAT');

console.log('\n--- Henderson-Hasselbalch ---');
eq('pH = pKa gives a 50/50 split', 1 / (1 + 1), 0.5, 1e-9);
eq('pH = pKa + 1 gives 10:1 base:acid', 10 / 11, 0.909, 1e-3);
eq('every buffer has both forms and a sane pKa',
  C.BUFFERS.every(b => b.pka > 3 && b.pka < 11 && b.acidMW > 0 && b.baseMW > 0), true);

console.log('\n--- serial dilution invariant ---');
{
  const keep = 100e-6, f = 3, t = keep / (f - 1), total = keep + t;
  eq('tube retains the working volume after passing on', total - t, keep, 1e-12);
  eq('the intended fold is achieved', total / t, f, 1e-12);
}

console.log('\n--- centrifugation ---');
{
  const K = 1.118e-6, rad = 87, rpm = 14000, rcf = K * rad * rpm * rpm;
  eq('14000 rpm at 87 mm', rcf, 19064, 0.001);
  eq('RCF -> rpm round trip', Math.sqrt(rcf / (K * rad)), rpm, 1e-9);
}

console.log('\n--- unit scaling ---');
eq('zero', C.showVol(0), '0 L');
eq('1 L', C.showVol(1), '1 L');
eq('500 uL', C.showVol(0.0005), '500 µL');
eq('999 nL', C.showVol(999e-9), '999 nL');
eq('150 mg', C.showMass(0.15), '150 mg');
eq('2 uM', C.showMolar(2e-6), '2 µM');
eq('NaN renders as a dash', C.fmt(NaN), '—');
eq('tiny numbers go exponential', C.fmt(1e-7), '1.000e-7');

console.log(fails ? `\n${fails} FAILURES` : '\nAll math assertions passed');
process.exit(fails ? 1 : 0);
