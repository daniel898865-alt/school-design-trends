// 직접 녹음한 블록별 음성(내_녹음\NN.m4a)을 자동 조작 화면 프레임에 결합해 MP4로 만든다. 이 PC의 Edge만 사용(외부 서비스·설치 없음).
// 녹음이 장면보다 길면 그 블록의 마지막 화면을 늘려 맞춘다(화면 동작은 그대로).
// 사용: node mux-guide.mjs <프레임 폴더(frames.json·caps.json)> <결과.mp4> [--measure]
import { spawn } from 'node:child_process';
import { readFileSync, writeFileSync, rmSync, createReadStream, existsSync } from 'node:fs';
import http from 'node:http';
import path from 'node:path';

const [FRAMES, OUT, flag] = process.argv.slice(2);
const HERE = path.dirname(new URL(import.meta.url).pathname.replace(/^\/([A-Za-z]:)/, '$1'));
const REC = path.join(decodeURIComponent(HERE), '내_녹음');
const frames = JSON.parse(readFileSync(path.join(FRAMES, 'frames.json'), 'utf8'));
const plan = JSON.parse(readFileSync(path.join(decodeURIComponent(HERE), '낭독_블록.json'), 'utf8'));
const blocks = plan.blocks;
const audio = blocks.map((b) => { const n = Number(b.n); return [`${b.n}`, String(n).padStart(3, '0')].flatMap((k) => ['m4a', 'wav', 'mp3'].map((e) => `${k}.${e}`)).find((f) => existsSync(path.join(REC, f))); });
const missing = blocks.filter((_, i) => !audio[i]).map((b) => b.n);
if (missing.length) { console.error('녹음 파일이 없는 블록:', missing.join(',')); process.exit(1); }

const server = http.createServer((req, res) => {
  const [kind, name] = decodeURIComponent(new URL(req.url, 'http://x').pathname.slice(1)).split('/');
  const dir = kind === 'img' ? FRAMES : kind === 'aud' ? REC : null;
  if (!dir || !/^[\w.-]+$/.test(name || '') || !existsSync(path.join(dir, name))) { res.writeHead(404); res.end(); return; }
  res.writeHead(200, { 'Access-Control-Allow-Origin': '*' }); createReadStream(path.join(dir, name)).pipe(res);
}).listen(4192, '127.0.0.1');
const PROFILE = path.join(process.env.TEMP, 'edge-mux-guide'); rmSync(PROFILE, { recursive: true, force: true });
const proc = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--remote-debugging-port=9252', `--user-data-dir=${PROFILE}`, '--no-first-run', '--disable-extensions', '--autoplay-policy=no-user-gesture-required', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 40 && !target; i++) { try { target = (await (await fetch('http://127.0.0.1:9252/json')).json()).find((t) => t.type === 'page'); } catch { /* wait */ } if (!target) await sleep(300); }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map();
ws.addEventListener('message', (e) => { const m = JSON.parse(e.data); if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); } });
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, (m) => (m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result))); ws.send(JSON.stringify({ id: i, method, params })); });
await send('Page.enable'); await send('Runtime.enable');
await send('Page.navigate', { url: 'http://127.0.0.1:4192/img/00000.jpg' }); await sleep(800);
const run = async (expression) => { const r = await send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 400)); return r.result.value; };

const measure = await run(`(async () => {
  const ac = new AudioContext(); const out = [];
  for (const f of ${JSON.stringify(audio)}) {
    const buf = await ac.decodeAudioData(await (await fetch('http://127.0.0.1:4192/aud/' + f)).arrayBuffer());
    const d = buf.getChannelData(0), sr = buf.sampleRate, thr = 0.012;
    let a = 0; while (a < d.length && Math.abs(d[a]) < thr) a++; let b = d.length - 1; while (b > a && Math.abs(d[b]) < thr) b--;
    const pad = Math.floor(0.12 * sr); a = Math.max(0, a - pad); b = Math.min(d.length - 1, b + pad);
    let pk = 0, sum = 0; for (let i = a; i <= b; i++) { const v = Math.abs(d[i]); if (v > pk) pk = v; sum += d[i] * d[i]; }
    out.push({ file: f, total: +(d.length / sr).toFixed(2), trimStart: a / sr, len: (b - a) / sr, peak: +pk.toFixed(3), rms: Math.sqrt(sum / (b - a)), ch: buf.numberOfChannels, sr });
  }
  return out;
})()`);
measure.forEach((m, i) => console.log(`${blocks[i].n} ${m.file} 길이 ${m.len.toFixed(1)}s (장면 ${blocks[i].room_sec}s) peak ${m.peak} rms ${m.rms.toFixed(3)}`));
if (flag === '--measure') { ws.close(); proc.kill(); server.close(); process.exit(0); }

// 블록별 늘림 계산: 필요 시간 = 시작 0.4초 + 음성 + 끝 0.8초
const LEAD = 0.4, TAIL = 0.8;
const extra = blocks.map((b, i) => Math.max(0, LEAD + measure[i].len + TAIL - (b.end_sec - b.start_sec)));
const shiftBefore = (t) => blocks.reduce((s, b, j) => s + (b.end_sec <= t + 1e-6 ? extra[j] : 0), 0);
const newFrames = frames.map((f) => ({ file: f.file, ts: f.ts + shiftBefore(f.ts) }));
const newStart = blocks.map((b, i) => b.start_sec + extra.slice(0, i).reduce((a, c) => a + c, 0));
const totalNew = frames.at(-1).ts + 1.6 + extra.reduce((a, c) => a + c, 0);
console.log('늘린 블록:', blocks.map((b, i) => (extra[i] > 0.05 ? `${b.n}(+${extra[i].toFixed(1)}s)` : null)).filter(Boolean).join(' ') || '없음', '| 총', totalNew.toFixed(1), '초');
writeFileSync(path.join(decodeURIComponent(HERE), '결합_시간표.json'), JSON.stringify({ total_sec: +totalNew.toFixed(1), blocks: blocks.map((b, i) => ({ n: b.n, start_sec: +newStart[i].toFixed(2), voice_sec: +measure[i].len.toFixed(2), extra_sec: +extra[i].toFixed(2) })) }, null, 2));

const info = await run(`(async () => {
  const fr = ${JSON.stringify(newFrames)}; const t0f = fr[0].ts; const total = ${totalNew}; const meas = ${JSON.stringify(measure)}; const starts = ${JSON.stringify(newStart)}; const LEAD = ${LEAD};
  const ac = new AudioContext(); const dest = ac.createMediaStreamDestination();
  const bufs = []; for (const m of meas) bufs.push(await ac.decodeAudioData(await (await fetch('http://127.0.0.1:4192/aud/' + m.file)).arrayBuffer()));
  document.body.innerHTML = ''; const cv = document.createElement('canvas'); cv.width = 1920; cv.height = 1080; document.body.append(cv); const ctx = cv.getContext('2d');
  const load = async (i) => createImageBitmap(await (await fetch('http://127.0.0.1:4192/img/' + fr[i].file)).blob());
  let cur = await load(0); ctx.drawImage(cur, 0, 0, 1920, 1080);
  const vstream = cv.captureStream(0); const track = vstream.getVideoTracks()[0]; const mixed = new MediaStream([track, ...dest.stream.getAudioTracks()]);
  const mime = ['video/mp4;codecs=avc1.42E01E,mp4a.40.2', 'video/mp4;codecs=avc1,mp4a.40.2', 'video/mp4'].find((x) => MediaRecorder.isTypeSupported(x)); if (!mime) return { error: 'no mp4' };
  const rec = new MediaRecorder(mixed, { mimeType: mime, videoBitsPerSecond: 750000, audioBitsPerSecond: 112000 });
  const chunks = []; rec.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); }; const stopped = new Promise((r) => { rec.onstop = r; });
  await ac.resume(); rec.start(1000); const T0 = ac.currentTime + 0.5;
  meas.forEach((m, i) => { const src = ac.createBufferSource(); src.buffer = bufs[i]; const g = ac.createGain(); let gain = 0.085 / Math.max(m.rms, 0.005); gain = Math.min(gain, 0.92 / Math.max(m.peak, 0.05), 4); g.gain.value = gain; src.connect(g); g.connect(dest); src.start(T0 + starts[i] + LEAD, m.trimStart, m.len); });
  let next = 1; let nextBmp = fr.length > 1 ? load(1) : null; let tick = 0;
  while (ac.currentTime - T0 < total) {
    const now = ac.currentTime - T0;
    while (next < fr.length && fr[next].ts - t0f <= now) { cur = await nextBmp; next++; nextBmp = next < fr.length ? load(next) : null; }
    ctx.drawImage(cur, 0, 0, 1920, 1080); ctx.fillStyle = (tick++ % 2) ? '#ffffff' : '#fefefe'; ctx.fillRect(0, 0, 1, 1); track.requestFrame(); await new Promise((r) => setTimeout(r, 66));
  }
  await new Promise((r) => setTimeout(r, 400)); rec.stop(); await stopped;
  window.__out = new Uint8Array(await new Blob(chunks, { type: mime }).arrayBuffer());
  return { mime, size: window.__out.length, total };
})()`);
console.log(JSON.stringify(info));
if (info && info.size) {
  const parts = [];
  for (let off = 0; off < info.size; off += 900000) { const c = await send('Runtime.evaluate', { expression: `(() => { let s = ''; const a = window.__out.subarray(${off}, ${off + 900000}); for (let i = 0; i < a.length; i += 8192) s += String.fromCharCode.apply(null, a.subarray(i, i + 8192)); return btoa(s); })()`, returnByValue: true }); parts.push(Buffer.from(c.result.value, 'base64')); }
  writeFileSync(OUT, Buffer.concat(parts)); console.log('saved', OUT, Buffer.concat(parts).length);
}
ws.close(); proc.kill(); server.close();
