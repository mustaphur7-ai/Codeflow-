'use strict';
const $ = s => document.querySelector(s);
const TFS = ['1m', '5m', '15m', '1h', '4h', '1d'], SEC = { '1m': 60, '5m': 300, '15m': 900, '1h': 3600, '4h': 14400, '1d': 86400 };
const def = { tf: '15m', tab: 'levels', groups: { opt: 1, gex: 1, vp: 1, sess: 1, vwap: 1 }, tol: 0.5, auto: false, armed: {}, fired: {}, custom: [], log: [], sound: 1, vib: 1, vol: 0.6 };
let S = { ...def };
try { S = { ...def, ...JSON.parse(localStorage.getItem('gt') || '{}') }; } catch (e) {}
S.groups = { ...def.groups, ...S.groups };
const save = () => { try { localStorage.setItem('gt', JSON.stringify(S)); } catch (e) {} };
for (const k in S.fired) if (Date.now() - S.fired[k] > 3 * 864e5) delete S.fired[k];

let LV = [], OPT = null, LIVE = null, lines = [], lastSeen = 0, open = false, fit = true, ac, ringTimer, lastMsg = '';

// ---------- chart ----------
const chart = LightweightCharts.createChart($('#chart'), {
  autoSize: true,
  layout: { background: { color: '#0a0d13' }, textColor: '#8794a6' },
  grid: { vertLines: { color: '#121927' }, horzLines: { color: '#121927' } },
  rightPriceScale: { borderColor: '#1e2736' }, timeScale: { borderColor: '#1e2736', timeVisible: true }, crosshair: { mode: 0 }
});
const series = chart.addCandlestickSeries({ upColor: '#26a69a', downColor: '#ef5350', borderVisible: false, wickUpColor: '#26a69a', wickDownColor: '#ef5350' });

// ---------- levels ----------
const col = l => /Call/.test(l.name) ? '#ef5350' : /Put/.test(l.name) ? '#26a69a' : (l.group === 'opt' || l.group === 'gex') ? '#b388ff' : l.group === 'vp' ? '#4dd0e1' : l.group === 'sess' ? '#ffb74d' : '#ffee58';
const alertable = l => l.frozen || l.fixed;
const utcDay = () => new Date().toISOString().slice(0, 10);
const keyOf = l => l.frozen ? `${l.name}|${l.price.toFixed(1)}` : `${l.name}|${utcDay()}`;
const isArmed = l => alertable(l) && (S.armed[l.name] || S.auto);
const live = () => LV.filter(l => S.groups[l.group]);

function draw() {
  lines.forEach(l => series.removePriceLine(l)); lines = [];
  for (const l of live()) {
    const a = isArmed(l) && !S.fired[keyOf(l)];
    lines.push(series.createPriceLine({ price: l.price, color: col(l), lineWidth: l.frozen ? 2 : 1, lineStyle: l.frozen ? 0 : 2, axisLabelVisible: true, title: `${l.frozen ? '🔒 ' : ''}${a ? '🔔 ' : ''}${l.name}` }));
  }
  for (const c of S.custom) if (!S.fired['c:' + c.id]) lines.push(series.createPriceLine({ price: c.price, color: '#ffffff', lineWidth: 1, lineStyle: 1, axisLabelVisible: true, title: '🔔 ' + (c.label || 'Alarm') }));
}

// ---------- data ----------
const J = async f => { try { const r = await fetch(`data/${f}.json?t=${Date.now()}`); return r.ok ? await r.json() : null; } catch (e) { return null; } };
async function load() {
  const [c, lv, opt, m1] = await Promise.all([J('candles-' + S.tf), J('live-levels'), J('options-levels'), J('candles-1m')]);
  if (c?.length) { series.setData(c); if (fit) { chart.timeScale().fitContent(); fit = false; } }
  LIVE = lv; OPT = opt; LV = [...(opt?.levels || []), ...(lv?.levels || [])];
  if (m1?.length) { if (!lastSeen) lastSeen = m1.at(-1).time; else check(m1); }
  $('#px').textContent = lv?.price ? lv.price.toFixed(2) : '';
  $('#px').title = lv?.updated ? 'Data updated ' + new Date(lv.updated * 1000).toLocaleTimeString() : '';
  $('#badge').textContent = opt?.generated
    ? `🔒 Options levels frozen · analysed ${new Date(opt.generated).toLocaleString([], { weekday: 'short', hour: '2-digit', minute: '2-digit' })} · next update tomorrow 10:30 ET`
    : 'No options analysis yet. Run the “Options daily” workflow once to create the first levels.';
  draw(); renderLevels(); renderSet();
  if (!document.activeElement?.closest('#p-alerts')) renderAlerts();
}
function legend() {
  const s = SEC[S.tf], left = s - Math.floor(Date.now() / 1000) % s, h = Math.floor(left / 3600), m = Math.floor(left % 3600 / 60);
  $('#legend').innerHTML = `GOLD · ${S.tf.toUpperCase()} · 24/7 · GLD options at last analysis<br>Gamma GEX Flow Front<br>GEX 1-10 DTE · Key levels<br>Candle closes in ${h ? h + 'h ' : ''}${m}m ${left % 60}s`;
}

// ---------- alarms ----------
function check(m1) {
  const nb = m1.filter(b => b.time > lastSeen); lastSeen = m1.at(-1).time;
  if (!nb.length) return;
  const i = m1.indexOf(nb[0]), pc = i > 0 ? m1[i - 1].close : nb[0].open, tol = +S.tol;
  const lo = Math.min(...nb.map(b => b.low)), hi = Math.max(...nb.map(b => b.high));
  const hit = (p, d) => lo - tol <= p && p <= hi + tol && (d === 'up' ? pc < p : d === 'down' ? pc > p : true);
  for (const l of LV) { const k = keyOf(l); if (S.groups[l.group] && isArmed(l) && !S.fired[k] && hit(l.price)) { S.fired[k] = Date.now(); ring(`GOLD reached ${l.name} at ${l.price.toFixed(2)}`); } }
  for (const c of S.custom) { const k = 'c:' + c.id; if (!S.fired[k] && hit(c.price, c.dir)) { S.fired[k] = Date.now(); ring(`GOLD reached ${c.label || 'alarm'} at ${c.price.toFixed(2)}`); } }
  save();
}
function beep() {
  if (!S.sound) return;
  ac = ac || new AudioContext(); const o = ac.createOscillator(), g = ac.createGain();
  o.type = 'square'; o.frequency.value = 880; g.gain.value = S.vol * 0.3; o.connect(g); g.connect(ac.destination); o.start(); o.stop(ac.currentTime + 0.25);
}
function ring(msg) {
  lastMsg = msg; $('#alarm b').textContent = msg; $('#alarm').hidden = false;
  clearInterval(ringTimer); beep();
  ringTimer = setInterval(() => { beep(); if (S.vib) navigator.vibrate?.([300, 150, 300]); }, 900);
  if ('Notification' in window && Notification.permission === 'granted') new Notification('GOLD alert', { body: msg });
  S.log.unshift({ t: Date.now(), m: msg }); S.log = S.log.slice(0, 20); save(); draw(); renderAlerts();
}
function stop() { clearInterval(ringTimer); $('#alarm').hidden = true; }

// ---------- panels ----------
function renderLevels() {
  const px = LIVE?.price, rows = live().sort((a, b) => b.price - a.price); let h = '', ins = false;
  const pr = `<div class="row px"><span>▶ Price</span><em>${px?.toFixed(2)}</em></div>`;
  for (const l of rows) {
    if (px != null && !ins && l.price < px) { h += pr; ins = true; }
    h += `<div class="row"><i style="background:${col(l)}"></i><span>${l.frozen ? '🔒 ' : ''}${l.name}</span><em>${l.price.toFixed(2)}</em>${alertable(l) ? `<button class="bell ${isArmed(l) ? 'on' : ''}" data-bell="${l.name}" aria-label="Alarm on ${l.name}">🔔</button>` : '<span style="flex:none;width:44px"></span>'}</div>`;
  }
  if (px != null && !ins) h += pr;
  $('#p-levels').innerHTML = h || '<p>No data yet. Run the “Market data” workflow, then reload.</p>';
}
function renderAlerts() {
  $('#p-alerts').innerHTML = `<div class="form"><input id="cp" type="number" step="0.01" placeholder="Price"><select id="cd"><option value="touch">touch</option><option value="up">cross up</option><option value="down">cross down</option></select><button id="ca">Add alarm</button></div>`
    + S.custom.map(c => `<div class="row"><span>${c.label || 'Alarm'} · ${c.dir}</span><em>${c.price.toFixed(2)}</em><button data-del="${c.id}" aria-label="Remove">✕</button></div>`).join('')
    + `<div class="form"><button id="bn">Enable notifications</button><button id="bt">Test alarm</button><button id="br">Re-arm all</button><button id="bc">Copy for repo</button></div><h4>Recent alarms</h4>`
    + (S.log.map(x => `<div class="row"><span>${x.m}</span><em>${new Date(x.t).toLocaleTimeString()}</em></div>`).join('') || '<p>None yet.</p>');
}
function renderSet() {
  if (document.activeElement?.closest('#p-set')) return;
  const g = (k, n) => `<label><input type="checkbox" data-g="${k}" ${S.groups[k] ? 'checked' : ''}> ${n}</label>`;
  $('#p-set').innerHTML = `<h4>Levels shown</h4>${g('opt', 'Options levels (frozen)')}${g('gex', 'GEX strikes (frozen)')}${g('vp', 'Volume profile')}${g('sess', 'Sessions and previous day')}${g('vwap', 'VWAP')}
<h4>Alarms</h4><label><input type="checkbox" data-f="auto" ${S.auto ? 'checked' : ''}> Alarm on all fixed levels</label>
<label><input type="checkbox" data-f="sound" ${S.sound ? 'checked' : ''}> Sound</label><label><input type="checkbox" data-f="vib" ${S.vib ? 'checked' : ''}> Vibration</label>
<label>Tolerance (USD) <input type="number" step="0.1" min="0" data-n="tol" value="${S.tol}"></label><label>Volume <input type="range" min="0" max="1" step="0.1" data-n="vol" value="${S.vol}"></label>`;
}
function showTab() {
  ['levels', 'alerts', 'set'].forEach(k => $('#p-' + k).hidden = k !== S.tab);
  document.querySelectorAll('.tabs button').forEach(b => b.classList.toggle('on', b.dataset.tab === S.tab));
  $('#side').classList.toggle('open', open); save();
}
function tab(t) { if (S.tab === t && open && innerWidth < 1100) open = false; else { S.tab = t; open = true; } showTab(); }
function setTf(t) {
  S.tf = t; fit = true; save();
  $('#tfs').innerHTML = TFS.map((x, i) => `<button data-tf="${x}" class="${x === t ? 'on' : ''}" title="Key ${i + 1}">${x.toUpperCase()}</button>`).join('');
  load();
}
const fs = () => document.fullscreenElement ? document.exitFullscreen() : document.documentElement.requestFullscreen?.();

// ---------- events ----------
addEventListener('pointerdown', () => { ac = ac || new AudioContext(); ac.resume(); }, { once: true }); // unlock sound
document.addEventListener('click', e => {
  const t = e.target.closest('button'); if (!t) return; const d = t.dataset;
  if (d.tab) tab(d.tab);
  else if (d.tf) setTf(d.tf);
  else if (d.bell) { S.armed[d.bell] = !S.armed[d.bell]; save(); draw(); renderLevels(); }
  else if (d.del) { S.custom = S.custom.filter(c => c.id !== d.del); save(); draw(); renderAlerts(); }
  else if (d.snooze != null) { const m = +d.snooze, msg = lastMsg; stop(); if (m) setTimeout(() => ring(msg), m * 60000); }
  else if (t.id === 'fs') fs();
  else if (t.id === 'ca') { const p = parseFloat($('#cp').value); if (p) { S.custom.push({ id: Date.now().toString(36), price: p, dir: $('#cd').value, label: 'Custom' }); save(); draw(); renderAlerts(); } }
  else if (t.id === 'bn') { window.Notification?.requestPermission?.(); }
  else if (t.id === 'bt') ring('Test alarm: GOLD reached your level');
  else if (t.id === 'br') { S.fired = {}; save(); draw(); }
  else if (t.id === 'bc') navigator.clipboard?.writeText(JSON.stringify(S.custom, null, 2)).then(() => alert('Copied. Paste into the "custom" list in config/alerts.json in your repo to get phone alerts when the page is closed.'));
});
document.addEventListener('change', e => {
  const d = e.target.dataset;
  if (d.g) S.groups[d.g] = e.target.checked ? 1 : 0;
  else if (d.f) S[d.f] = e.target.checked ? 1 : 0;
  else if (d.n) S[d.n] = +e.target.value;
  save(); draw(); renderLevels();
});
addEventListener('keydown', e => {
  if (/INPUT|SELECT|TEXTAREA/.test(e.target.tagName) || e.ctrlKey || e.metaKey || e.altKey) return;
  const i = '123456'.indexOf(e.key);
  if (i >= 0) setTf(TFS[i]);
  else if (/^f$/i.test(e.key)) fs();
  else if (/^a$/i.test(e.key)) { tab('alerts'); setTimeout(() => $('#cp')?.focus(), 50); e.preventDefault(); }
  else if (e.key === 'Escape') { open = false; showTab(); stop(); }
  else if (e.key === '?') alert('Shortcuts: 1-6 timeframes · F fullscreen · A add alarm · Esc close panel / silence alarm');
});

setTf(S.tf); showTab(); renderAlerts(); setInterval(load, 60000); setInterval(legend, 1000); legend();
if ('serviceWorker' in navigator) navigator.serviceWorker.register('sw.js').catch(() => {});
