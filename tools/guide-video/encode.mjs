// tour.mjs가 저장한 프레임(JPEG+타임스탬프)을 실제 시간 간격대로 재생하며 MP4로 녹화한다(이 PC의 Edge MediaRecorder, 외부 서비스 없음).
// 사용: node encode.mjs <프레임 폴더> <결과.mp4>
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, createReadStream, existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const [FRAMES, OUT] = process.argv.slice(2);
const frames = JSON.parse(readFileSync(path.join(FRAMES, 'frames.json'), 'utf8'));
const server = http.createServer((req, res) => {
  const name = decodeURIComponent(new URL(req.url, 'http://x').pathname.slice(1));
  if (!/^\d{5}\.jpg$/.test(name) || !existsSync(path.join(FRAMES, name))) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Access-Control-Allow-Origin': '*', 'Content-Type': 'image/jpeg' }); createReadStream(path.join(FRAMES, name)).pipe(res);
}).listen(4191, '127.0.0.1');
const PROFILE = path.join(process.env.TEMP, 'edge-encode-profile'); rmSync(PROFILE, { recursive: true, force: true });
const proc = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--remote-debugging-port=9251', `--user-data-dir=${PROFILE}`, '--no-first-run', '--disable-extensions', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 40 && !target; i++) { try { target = (await (await fetch('http://127.0.0.1:9251/json')).json()).find((t) => t.type === 'page'); } catch { /* wait */ } if (!target) await sleep(300); }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, (m) => (m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result))); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:4191/00000.jpg' }); await sleep(800);
const info = (await send('Runtime.evaluate', { awaitPromise: true, returnByValue: true, expression: `(async () => {
  const fr = ${JSON.stringify(frames)}; const t0 = fr[0].ts; const total = fr[fr.length - 1].ts - t0 + 1.6;
  document.body.innerHTML = ''; const cv = document.createElement('canvas'); cv.width = 1920; cv.height = 1080; document.body.append(cv); const ctx = cv.getContext('2d');
  const load = async (i) => createImageBitmap(await (await fetch('http://127.0.0.1:4191/' + fr[i].file)).blob());
  let cur = await load(0); ctx.drawImage(cur, 0, 0, 1920, 1080);
  const stream = cv.captureStream(0); const track = stream.getVideoTracks()[0];
  const mime = ['video/mp4;codecs=avc1', 'video/mp4'].find((x) => MediaRecorder.isTypeSupported(x)); if (!mime) return { error: 'no mp4' };
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 750000 });
  const chunks = []; rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); }; const stopped = new Promise((r) => { rec.onstop = r; });
  rec.start(1000); const start = performance.now(); let next = 1; let nextBmp = fr.length > 1 ? load(1) : null; let tick = 0;
  while ((performance.now() - start) / 1000 < total) {
    const now = (performance.now() - start) / 1000;
    while (next < fr.length && fr[next].ts - t0 <= now) { cur = await nextBmp; next++; nextBmp = next < fr.length ? load(next) : null; }
    ctx.drawImage(cur, 0, 0, 1920, 1080); ctx.fillStyle = (tick++ % 2) ? '#ffffff' : '#fefefe'; ctx.fillRect(0, 0, 1, 1); track.requestFrame(); await new Promise((r) => setTimeout(r, 66));
  }
  rec.stop(); await stopped; const blob = new Blob(chunks, { type: mime }); window.__out = new Uint8Array(await blob.arrayBuffer());
  return { mime, size: window.__out.length, total };
})()`, timeout: 900000 })).result.value;
console.log(JSON.stringify(info));
if (info && info.size) {
  const parts = [];
  for (let off = 0; off < info.size; off += 900000) { const c = await send('Runtime.evaluate', { expression: `(() => { let s = ''; const a = window.__out.subarray(${off}, ${off + 900000}); for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode.apply(null, a.subarray(i, i + 8192)); return btoa(s); })()`, returnByValue: true }); parts.push(Buffer.from(c.result.value, 'base64')); }
  writeFileSync(OUT, Buffer.concat(parts)); console.log('saved', OUT, Buffer.concat(parts).length);
}
ws.close(); proc.kill(); server.close();
