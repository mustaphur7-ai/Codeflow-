// Every 5 min: candles for all timeframes + LIVE levels (volume profile, sessions, previous day, VWAP).
import { writeFileSync, mkdirSync } from 'fs';
import { yf, SYMBOL } from './common.mjs';
mkdirSync('data', { recursive: true });

const TF = { '1m': ['1m', '2d'], '5m': ['5m', '5d'], '15m': ['15m', '10d'], '1h': ['60m', '60d'], '1d': ['1d', '1y'] }, out = {};
for (const [k, [i, r]] of Object.entries(TF)) {
  try { out[k] = await yf(i, r); writeFileSync(`data/candles-${k}.json`, JSON.stringify(out[k])); }
  catch (e) { console.warn(k, e.message); if (k === '5m') throw e; }
}
if (out['1h']) { // build 4h bars from 1h
  const m = new Map();
  for (const b of out['1h']) {
    const t = Math.floor(b.time / 14400) * 14400, x = m.get(t);
    if (!x) m.set(t, { ...b, time: t }); else { x.high = Math.max(x.high, b.high); x.low = Math.min(x.low, b.low); x.close = b.close; x.volume += b.volume; }
  }
  writeFileSync('data/candles-4h.json', JSON.stringify([...m.values()]));
}

function prof(a, bin = 0.5) { // volume (or time-at-price if no volume) profile: POC + 70% value area
  const m = new Map();
  for (const x of a) { const lo = Math.floor(x.low / bin), hi = Math.floor(x.high / bin), w = (x.volume || 1) / (hi - lo + 1); for (let i = lo; i <= hi; i++) m.set(i, (m.get(i) || 0) + w); }
  const e = [...m].sort((p, q) => p[0] - q[0]), tot = e.reduce((s, x) => s + x[1], 0);
  let pi = 0; e.forEach((x, i) => { if (x[1] > e[pi][1]) pi = i; });
  let lo = pi, hi = pi, acc = e[pi][1];
  while (acc < 0.7 * tot && (lo > 0 || hi < e.length - 1)) {
    const dn = lo > 0 ? e[lo - 1][1] : -1, up = hi < e.length - 1 ? e[hi + 1][1] : -1;
    if (up >= dn) acc += e[++hi][1]; else acc += e[--lo][1];
  }
  return { poc: (e[pi][0] + 0.5) * bin, val: e[lo][0] * bin, vah: (e[hi][0] + 1) * bin };
}

const b = out['5m'], last = b.at(-1), dOf = t => Math.floor(t / 86400), hOf = t => (t % 86400) / 3600;
const days = [...new Set(b.map(x => dOf(x.time)))].sort((p, q) => p - q);
const D = dOf(last.time), P = days.filter(d => d < D).at(-1);
const today = b.filter(x => dOf(x.time) === D), prev = b.filter(x => dOf(x.time) === P);
const hl = a => [Math.max(...a.map(x => x.high)), Math.min(...a.map(x => x.low))];
const L = [], add = (name, price, group, fixed) => L.push({ name, price: +price.toFixed(2), group, fixed: !!fixed });

if (prev.length) { // previous day = complete, so these are "fixed" (alertable)
  const [h, l] = hl(prev), p = prof(prev);
  add('PDH', h, 'sess', 1); add('PDL', l, 'sess', 1); add('pPOC', p.poc, 'vp', 1); add('pVAH', p.vah, 'vp', 1); add('pVAL', p.val, 'vp', 1);
}
// Sessions in UTC: Asia 00-08, London 08-13, New York 13-21. Fixed once the session has ended.
for (const [n, s, e] of [['Asia', 0, 8], ['London', 8, 13], ['NY', 13, 21]]) {
  const a = today.filter(x => hOf(x.time) >= s && hOf(x.time) < e);
  if (a.length) { const [h, l] = hl(a), done = hOf(last.time) >= e; add(n + ' H', h, 'sess', done); add(n + ' L', l, 'sess', done); }
}
const p = prof(today); add('POC', p.poc, 'vp'); add('VAH', p.vah, 'vp'); add('VAL', p.val, 'vp');
const wv = today.reduce((s, x) => s + (x.volume || 1), 0);
add('VWAP', today.reduce((s, x) => s + (x.high + x.low + x.close) / 3 * (x.volume || 1), 0) / wv, 'vwap');

writeFileSync('data/live-levels.json', JSON.stringify({ updated: last.time, price: last.close, symbol: SYMBOL, levels: L }));
console.log('Market data updated. Price', last.close);
