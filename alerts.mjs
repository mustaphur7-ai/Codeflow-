// Background alerts: checks recent 1m bars against armed levels and pushes to phone/desktop via ntfy.sh and/or Telegram.
import { readFileSync, writeFileSync } from 'fs';
const rd = (f, d) => { try { return JSON.parse(readFileSync(f, 'utf8')); } catch { return d; } };
const { NTFY_TOPIC, TELEGRAM_TOKEN, TELEGRAM_CHAT_ID } = process.env;

async function push(title, msg) {
  if (NTFY_TOPIC) await fetch('https://ntfy.sh/' + NTFY_TOPIC, { method: 'POST', body: msg, headers: { Title: title, Priority: 'urgent', Tags: 'rotating_light' } });
  if (TELEGRAM_TOKEN && TELEGRAM_CHAT_ID) await fetch(`https://api.telegram.org/bot${TELEGRAM_TOKEN}/sendMessage`, {
    method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ chat_id: TELEGRAM_CHAT_ID, text: `${title}\n${msg}` }) });
}
if (process.argv.includes('--test')) { await push('GOLD test alert', 'Test alert from your gold terminal. Push is working.'); process.exit(0); }

const cfg = { tolerance: 0.5, alertAllFixedLevels: true, groups: { opt: 1, gex: 1, vp: 1, sess: 1 }, custom: [], ...rd('config/alerts.json', {}) };
const m1 = rd('data/candles-1m.json', []); if (!m1.length) process.exit(0);
const st = rd('data/alert-state.json', { lastCheck: 0, fired: {} }), last = m1.at(-1).time;
if (!st.lastCheck) { st.lastCheck = last; writeFileSync('data/alert-state.json', JSON.stringify(st)); process.exit(0); } // first run: ignore history
const idx = m1.findIndex(b => b.time > st.lastCheck);
if (idx < 0) process.exit(0);
const nb = m1.slice(idx), pc = idx > 0 ? m1[idx - 1].close : nb[0].open;
const lo = Math.min(...nb.map(b => b.low)), hi = Math.max(...nb.map(b => b.high)), tol = +cfg.tolerance;
const day = new Date(last * 1000).toISOString().slice(0, 10);
const hit = (p, d) => lo - tol <= p && p <= hi + tol && (d === 'up' ? pc < p : d === 'down' ? pc > p : true);

const items = [];
if (cfg.alertAllFixedLevels) {
  const opt = rd('data/options-levels.json', { levels: [] }).levels || [], live = (rd('data/live-levels.json', { levels: [] }).levels || []).filter(l => l.fixed);
  for (const l of [...opt, ...live]) if (cfg.groups[l.group] !== false && cfg.groups[l.group] !== 0)
    items.push({ key: l.frozen ? `${l.name}|${l.price.toFixed(1)}` : `${l.name}|${day}`, name: l.name, price: l.price });
}
for (const c of cfg.custom || []) items.push({ key: 'c:' + c.id, name: c.label || 'Custom', price: c.price, dir: c.dir });

for (const it of items) {
  if (st.fired[it.key] || !hit(it.price, it.dir)) continue;
  st.fired[it.key] = Date.now();
  await push('GOLD alert', `GOLD reached ${it.name} at ${it.price.toFixed(2)} | ${new Date().toISOString().slice(11, 16)} UTC`);
  console.log('Alert sent:', it.name);
}
for (const k in st.fired) if (Date.now() - st.fired[k] > 3 * 864e5) delete st.fired[k];
st.lastCheck = last;
writeFileSync('data/alert-state.json', JSON.stringify(st));
