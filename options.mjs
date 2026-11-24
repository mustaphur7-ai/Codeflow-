// Daily options analysis (GLD chain -> gold levels). Runs once, 1h after the New York open (10:30 ET).
// The result is FROZEN in data/options-levels.json until the next analysis the following day.
import { readFileSync, writeFileSync, mkdirSync } from 'fs';
import { yf, nyNow } from './common.mjs';

const F = 'data/options-levels.json';
let prev = null; try { prev = JSON.parse(readFileSync(F, 'utf8')); } catch {}
const ny = nyNow(), mins = ny.h * 60 + ny.m;
const due = ny.wd >= 1 && ny.wd <= 5 && mins >= 630 && mins < 720 && (prev?.validFor !== ny.date || prev?.bootstrap); // 10:30-12:00 ET, once per day
const force = process.env.FORCE === 'true' || process.argv.includes('--force');
if (!force && prev?.levels?.length && !due) { console.log('Options levels stay frozen. Next analysis: 10:30 ET.'); process.exit(0); }

const r = await fetch('https://cdn.cboe.com/api/global/delayed_quotes/options/GLD.json', { headers: { 'User-Agent': 'Mozilla/5.0' } });
if (!r.ok) throw new Error('CBOE HTTP ' + r.status);
const { data } = await r.json();
const spot = data.current_price ?? data.close;
const gold = (await yf('5m', '5d')).at(-1).close, ratio = gold / spot; // GLD strike -> gold price
const today = Date.UTC(ny.y, ny.mo - 1, ny.d);

// Aggregate by strike for expiries 0-10 days out. GEX = gamma x OI x 100 x spot (calls +, puts -).
const K = new Map();
for (const o of data.options) {
  const m = /^GLD(\d{2})(\d{2})(\d{2})([CP])(\d{8})$/.exec(o.option); if (!m) continue;
  const dte = (Date.UTC(2000 + +m[1], +m[2] - 1, +m[3]) - today) / 864e5;
  if (dte < 0 || dte > 10) continue;
  const k = +m[5] / 1000, oi = o.open_interest || 0, g = (o.gamma || 0) * oi * 100 * spot;
  const e = K.get(k) || { k, c: 0, p: 0, coi: 0, poi: 0 };
  if (m[4] === 'C') { e.c += g; e.coi += oi; } else { e.p -= g; e.poi += oi; }
  K.set(k, e);
}
const A = [...K.values()].sort((a, b) => a.k - b.k);
if (!A.length) throw new Error('No options found in 0-10 DTE window');

const L = [], add = (name, k, group) => L.push({ name, price: +(k * ratio).toFixed(2), gld: +k.toFixed(2), group, frozen: true });
add('Call wall', A.reduce((a, b) => b.c > a.c ? b : a).k, 'opt');
add('Put wall', A.reduce((a, b) => b.p < a.p ? b : a).k, 'opt');
let cum = 0;
for (let i = 0; i < A.length; i++) { // gamma flip: where cumulative net GEX changes sign
  const n = cum + A[i].c + A[i].p;
  if (cum !== 0 && cum * n < 0) { add('Gamma flip', A[i - 1].k + (A[i].k - A[i - 1].k) * Math.abs(cum) / (Math.abs(cum) + Math.abs(n)), 'opt'); break; }
  cum = n;
}
const pain = A.map(s => [s.k, A.reduce((t, x) => t + x.coi * Math.max(0, s.k - x.k) + x.poi * Math.max(0, x.k - s.k), 0)]);
add('Max pain', pain.reduce((a, b) => b[1] < a[1] ? b : a)[0], 'opt');
[...A].sort((a, b) => Math.abs(b.c + b.p) - Math.abs(a.c + a.p)).slice(0, 6).forEach((s, i) => add('GEX' + (i + 1), s.k, 'gex'));

mkdirSync('data', { recursive: true });
writeFileSync(F, JSON.stringify({ generated: new Date().toISOString(), validFor: ny.date, bootstrap: !due, gld: spot, gold, ratio: +ratio.toFixed(4), levels: L }, null, 1));
console.log(`Options levels saved for ${ny.date}: ${L.length} levels`);
