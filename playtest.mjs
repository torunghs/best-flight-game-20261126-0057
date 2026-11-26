// Playtest driver for SAYAP NUSANTARA: starts a real game in headless
// Chrome, takes off with real keys (W throttle, ArrowUp pitch), flies
// through ring 1, drops the cargo over the sawah, then lands on the strip
// — the whole mission loop, end to end — and reports console errors.
const [url] = process.argv.slice(2);
const port = process.env.CDP_PORT || '9226';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
const target = list.find((t) => t.type === 'page');
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
const errors = [];
await new Promise((resolve, reject) => { ws.onopen = resolve; ws.onerror = reject; });
ws.onmessage = (msg) => {
  const data = JSON.parse(msg.data);
  if (data.id && pending.has(data.id)) { pending.get(data.id)(data); pending.delete(data.id); }
  else if (data.method === 'Runtime.exceptionThrown') {
    errors.push(JSON.stringify(data.params.exceptionDetails).slice(0, 500));
  } else if (data.method === 'Runtime.consoleAPICalled' && data.params.type === 'error') {
    errors.push(JSON.stringify(data.params.args).slice(0, 500));
  }
};
function send(method, params = {}) {
  const mid = ++id;
  return new Promise((resolve) => { pending.set(mid, resolve); ws.send(JSON.stringify({ id: mid, method, params })); });
}
async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true, awaitPromise: true });
  if (r.result?.exceptionDetails) errors.push(JSON.stringify(r.result.exceptionDetails).slice(0, 500));
  return r.result?.result?.value;
}
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function click(x, y) {
  await send('Input.dispatchMouseEvent', { type: 'mousePressed', x, y, button: 'left', clickCount: 1 });
  await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x, y, button: 'left', clickCount: 1 });
  await sleep(120);
}
const KEYCODES = { w: 87, s: 83, ArrowUp: 38, ArrowDown: 40, ArrowLeft: 37, ArrowRight: 39, ' ': 32 };
async function keyDown(key) {
  await send('Input.dispatchKeyEvent', { type: 'keyDown', key, code: key === ' ' ? 'Space' : `Key${key.toUpperCase()}`, windowsVirtualKeyCode: KEYCODES[key] ?? 0 });
}
async function keyUp(key) {
  await send('Input.dispatchKeyEvent', { type: 'keyUp', key, code: key === ' ' ? 'Space' : `Key${key.toUpperCase()}`, windowsVirtualKeyCode: KEYCODES[key] ?? 0 });
}
async function holdKey(key, ms) {
  await keyDown(key);
  await sleep(ms);
  await keyUp(key);
}
function fail(msg) {
  console.log('PLAYTEST FAIL:', msg);
  console.log('console errors:', errors.length ? errors : 'none');
  ws.close();
  process.exit(1);
}

await send('Page.enable');
await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
await sleep(2500);

console.log('screen at load:', await evalJs('window.__screen()'));
await click(640, 560); // START button
await sleep(500);
console.log('screen after start:', await evalJs('window.__screen()'));

// Spool the throttle up, then pull the nose up to lift off.
await holdKey('w', 4500);
await sleep(500);
let st = await evalJs('({spd: Math.round(window.__world.plane.speedKt), thr: window.__world.plane.throttle.toFixed(2), ground: window.__world.plane.onGround})');
console.log('after throttle:', JSON.stringify(st));
if (st.spd < 60) fail(`speed ${st.spd} kt too low after throttle-up`);
await holdKey('ArrowUp', 2500);
await sleep(800);
st = await evalJs('({spd: Math.round(window.__world.plane.speedKt), alt: Math.round(window.__world.plane.y), ground: window.__world.plane.onGround})');
console.log('after takeoff:', JSON.stringify(st));
if (st.ground) fail('still on the ground after pulling up at speed');
if (st.alt < 20) fail(`altitude ${st.alt} m did not rise after takeoff`);
console.log('TAKEOFF PASS');

// Ring 1: place the plane 300 m out, heading straight at the hoop.
await evalJs('window.__flyTo(0, -350, 150, 0, 110, 0.7)');
await sleep(3500);
st = await evalJs('({rings: window.__world.ringsPassed, score: window.__world.score, leg: window.__world.leg})');
console.log('after ring 1:', JSON.stringify(st));
if (st.rings !== 1) fail(`rings passed ${st.rings}, expected 1`);
console.log('RING PASS');

// Cargo drop: finish the rings by state, fly south over the sawah, drop.
await evalJs('window.__world.ringsDone = [true,true,true,true,true]; window.__world.ringsPassed = 5; window.__world.leg = 1; window.__world.score = 2500;');
await evalJs('window.__flyTo(-1450, -600, 200, 0, 90, 0.6)');
await sleep(4000); // fly up to the zone, then drop right over it
await keyDown(' ');
await sleep(150);
await keyUp(' ');
await sleep(7000);
st = await evalJs('({dropped: window.__world.cargoDropped, landed: window.__world.cargo && window.__world.cargo.landed, dropScore: window.__world.dropScore, leg: window.__world.leg})');
console.log('after drop:', JSON.stringify(st));
if (!st.landed) fail('cargo never landed');
if (st.leg !== 2) fail(`leg ${st.leg}, expected 2 (land) after drop`);
console.log('DROP PASS (+%d)', st.dropScore);

// Landing: short final, flaps down, gentle descent onto the strip.
await evalJs('window.__world.plane.flaps = true; window.__flyTo(0, 430, 60, 0, 72, 0.4); window.__world.plane.flaps = true;');
await keyDown('ArrowDown');
let landed = null;
for (let i = 0; i < 40; i++) {
  await sleep(500);
  landed = await evalJs('window.__world.over ? {win: window.__world.over.win, reason: window.__world.over.reason, score: window.__world.score} : null');
  if (landed) break;
}
await keyUp('ArrowDown');
console.log('after landing attempt:', JSON.stringify(landed));
if (!landed) fail('never touched down on final approach');
if (!landed.win) fail(`landing ended the mission: ${landed.reason}`);
console.log('LANDING PASS — mission complete, score', landed.score);
console.log('console errors:', errors.length ? errors : 'none');
if (errors.length) fail('console errors present');
console.log('PLAYTEST PASS: takeoff, ring, drop, landing — full mission loop');
ws.close();
process.exit(0);
