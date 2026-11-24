// Shared helpers: Yahoo Finance candles (free) and New York clock.
export const SYMBOL = process.env.PRICE_SYMBOL || 'XAUUSD=X'; // spot gold. Use GC=F for futures + real volume.

export async function yf(interval, range, symbol = SYMBOL) {
  const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(symbol)}?interval=${interval}&range=${range}`;
  const r = await fetch(url, { headers: { 'User-Agent': 'Mozilla/5.0' } });
  if (!r.ok) throw new Error(`Yahoo ${interval}/${range}: HTTP ${r.status}`);
  const x = (await r.json()).chart.result[0], q = x.indicators.quote[0], out = [];
  x.timestamp.forEach((t, i) => {
    if (q.close[i] == null || q.open[i] == null) return;
    out.push({ time: t, open: +q.open[i].toFixed(2), high: +q.high[i].toFixed(2), low: +q.low[i].toFixed(2), close: +q.close[i].toFixed(2), volume: q.volume?.[i] || 0 });
  });
  out.sort((a, b) => a.time - b.time);
  return out.filter((b, i) => i === 0 || b.time !== out[i - 1].time); // charts need unique, ascending times
}

export function nyNow() {
  const p = Object.fromEntries(new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York', hourCycle: 'h23', year: 'numeric', month: '2-digit',
    day: '2-digit', hour: '2-digit', minute: '2-digit', weekday: 'short'
  }).formatToParts(new Date()).map(x => [x.type, x.value]));
  return { y: +p.year, mo: +p.month, d: +p.day, h: +p.hour, m: +p.minute,
    wd: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(p.weekday), date: `${p.year}-${p.month}-${p.day}` };
}
