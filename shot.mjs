// Screenshot driver for SAYAP NUSANTARA (Node stdlib only): navigate to
// a staged ?shot= scene, wait for window.__shotReady, capture a JPEG.
import { writeFileSync } from 'node:fs';

const [url, out] = process.argv.slice(2);
const port = process.env.CDP_PORT || '9222';
const list = await (await fetch(`http://127.0.0.1:${port}/json/list`)).json();
let target = list.find((t) => t.type === 'page');
if (!target) throw new Error('no page target');
const ws = new WebSocket(target.webSocketDebuggerUrl);
let id = 0;
const pending = new Map();
await new Promise((resolve, reject) => {
  ws.onopen = resolve;
  ws.onerror = reject;
});
ws.onmessage = (msg) => {
  const data = JSON.parse(msg.data);
  if (data.id && pending.has(data.id)) {
    pending.get(data.id)(data);
    pending.delete(data.id);
  }
};
function send(method, params = {}) {
  const mid = ++id;
  return new Promise((resolve) => {
    pending.set(mid, resolve);
    ws.send(JSON.stringify({ id: mid, method, params }));
  });
}
async function evalJs(expr) {
  const r = await send('Runtime.evaluate', { expression: expr, returnByValue: true });
  return r.result?.result?.value;
}
await send('Page.enable');
await send('Runtime.enable');
await send('Network.enable');
await send('Network.setCacheDisabled', { cacheDisabled: true });
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1, mobile: false });
await send('Page.navigate', { url });
const deadline = Date.now() + 20000;
let ready = false;
let errors = [];
while (Date.now() < deadline) {
  await new Promise((r) => setTimeout(r, 300));
  ready = await evalJs('!!window.__shotReady');
  if (ready) break;
}
if (!ready) throw new Error('shot never became ready');
// Collect console errors for the report.
const errs = await evalJs('(window.__errors||[]).join("\\n")');
if (errs) errors.push(errs);
await new Promise((r) => setTimeout(r, 400));
const shot = await send('Page.captureScreenshot', { format: 'jpeg', quality: 82 });
if (shot.error) throw new Error(JSON.stringify(shot.error));
writeFileSync(out, Buffer.from(shot.result.data, 'base64'));
console.log(`wrote ${out}${errors.length ? ' ERRORS: ' + errors.join(';') : ''}`);
ws.close();
process.exit(0);
