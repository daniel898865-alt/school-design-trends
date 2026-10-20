// 개인 홈페이지와 사용설명 페이지를 마우스 커서가 보이게 천천히 조작하며 화면 프레임을 저장한다(자동 조작, 헤드리스 Edge).
// 공개 배포 주소만 연다. 입력·로그인·업로드 없음. 결과: <프레임 폴더>/NNNNN.jpg 와 frames.json(타임스탬프)
// 사용: node tour.mjs <프레임 폴더>
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync, rmSync } from 'node:fs';
import path from 'node:path';

const OUT = process.argv[2];
rmSync(OUT, { recursive: true, force: true }); mkdirSync(OUT, { recursive: true });
const BASE = process.env.TOUR_BASE || 'http://127.0.0.1:4173/';
const PROFILE = path.join(process.env.TEMP, 'edge-tour-profile'); rmSync(PROFILE, { recursive: true, force: true });
const proc = spawn('C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', ['--headless=new', '--remote-debugging-port=9250', `--user-data-dir=${PROFILE}`, '--no-first-run', '--disable-extensions', '--hide-scrollbars', '--lang=ko-KR', 'about:blank'], { stdio: 'ignore' });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
let target;
for (let i = 0; i < 40 && !target; i++) { try { target = (await (await fetch('http://127.0.0.1:9250/json')).json()).find((t) => t.type === 'page'); } catch { /* wait */ } if (!target) await sleep(300); }
const ws = new WebSocket(target.webSocketDebuggerUrl); await new Promise((r) => ws.addEventListener('open', r, { once: true }));
let id = 0; const pending = new Map(); const frames = [];
ws.addEventListener('message', (e) => {
  const m = JSON.parse(e.data);
  if (m.id && pending.has(m.id)) { pending.get(m.id)(m); pending.delete(m.id); return; }
});
const send = (method, params = {}) => new Promise((res, rej) => { const i = ++id; pending.set(i, (m) => (m.error ? rej(new Error(JSON.stringify(m.error))) : res(m.result))); ws.send(JSON.stringify({ id: i, method, params })); });
const ev = async (expr) => { const r = await send('Runtime.evaluate', { expression: expr, awaitPromise: true, returnByValue: true }); if (r.exceptionDetails) throw new Error(JSON.stringify(r.exceptionDetails).slice(0, 300)); return r.result.value; };

await send('Page.enable'); await send('Runtime.enable');
await send('Emulation.setDeviceMetricsOverride', { width: 1280, height: 720, deviceScaleFactor: 1.5, mobile: false });

// 화면에 겹쳐 보이는 커서·클릭 표시·자막(페이지 안에 주입)
const OVERLAY = `(() => {
  if (window.__tour) return;
  const boot = () => {
    const c = document.createElement('div'); c.id = '__cursor'; c.innerHTML = '<svg viewBox="0 0 24 24" width="36" height="36"><path d="M3 2 L3 19 L8 14.5 L11.5 22 L14.5 20.6 L11.2 13.4 L18 13 Z" fill="#fff" stroke="#111" stroke-width="1.6" stroke-linejoin="round"/></svg>';
    const r = document.createElement('div'); r.id = '__ripple'; const cap = document.createElement('div'); cap.id = '__cap'; const tag = document.createElement('div'); tag.id = '__tag'; tag.textContent = '자동 조작 화면 녹화 · 공개 페이지 · 사람 검수 전';
    c.style.cssText = 'position:fixed;left:0;top:0;width:36px;height:36px;z-index:2147483647;pointer-events:none;filter:drop-shadow(0 2px 3px rgba(0,0,0,.4))';
    r.style.cssText = 'position:fixed;left:0;top:0;width:26px;height:26px;margin:-13px 0 0 -13px;border-radius:50%;border:4px solid #e0731a;z-index:2147483646;pointer-events:none;opacity:0';
    cap.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147483645;background:rgba(18,52,48,.95);color:#fff;font:700 24px/1.5 "Malgun Gothic",sans-serif;padding:14px 36px;min-height:60px;box-sizing:border-box';
    tag.style.cssText = 'position:fixed;right:10px;top:8px;z-index:2147483645;background:rgba(18,52,48,.9);color:#fff;font:14px "Malgun Gothic",sans-serif;padding:5px 12px;border-radius:4px';
    document.body.append(c, r, cap, tag);
    const p = JSON.parse(sessionStorage.getItem('__pos') || '{"x":640,"y":380}'); c.style.transform = 'translate(' + p.x + 'px,' + p.y + 'px)'; window.__pos = p;
    cap.textContent = sessionStorage.getItem('__cap') || '';
  };
  if (document.body) boot(); else document.addEventListener('DOMContentLoaded', boot);
  window.__tour = {
    caption(t) { sessionStorage.setItem('__cap', t); const e = document.getElementById('__cap'); if (e) e.textContent = t; },
    setPos(x, y) { const c = document.getElementById('__cursor'); if (c) c.style.transform = 'translate(' + x + 'px,' + y + 'px)'; window.__pos = { x, y }; sessionStorage.setItem('__pos', JSON.stringify(window.__pos)); },
            ripple() { const r = document.getElementById('__ripple'); const p = window.__pos; r.style.left = p.x + 'px'; r.style.top = p.y + 'px'; r.animate([{ opacity: 0.9, transform: 'scale(.6)' }, { opacity: 0, transform: 'scale(2.4)' }], { duration: 700 }); },
    rect(sel, nth = 0) { const e = typeof sel === 'string' ? document.querySelectorAll(sel)[nth] : sel(); if (!e) return null; const b = e.getBoundingClientRect(); return { x: b.left + Math.min(b.width / 2, 120), y: b.top + Math.min(b.height / 2, 24), top: b.top + window.scrollY, h: b.height, w: b.width }; },
  };
})()`;
await send('Page.addScriptToEvaluateOnNewDocument', { source: OVERLAY });
let vt = 0;
const snap = async (dur) => { const r = await send('Page.captureScreenshot', { format: 'jpeg', quality: 80 }); const name = String(frames.length).padStart(5, '0') + '.jpg'; writeFileSync(path.join(OUT, name), Buffer.from(r.data, 'base64')); frames.push({ file: name, ts: vt }); vt += dur; };

const go = async (url, wait = 3000) => { await send('Page.navigate', { url }); await sleep(wait); };
const cap = (t) => ev(`__tour.caption(${JSON.stringify(t)})`);
const easeK = (t) => (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
const move = async (x, y, ms = 1400) => { const a = await ev('window.__pos'); const n = Math.max(3, Math.round(ms / 100)); const stepSec = ms / n / 1000; for (let i = 1; i <= n; i++) { const k = easeK(i / n); await ev('__tour.setPos(' + (a.x + (x - a.x) * k) + ',' + (a.y + (y - a.y) * k) + ')'); await snap(stepSec); } };
const scroll = async (y, ms = 1800) => { y = Math.max(0, Math.round(y)); const a = await ev('window.scrollY'); const n = Math.max(3, Math.round(ms / 100)); const stepSec = ms / n / 1000; for (let i = 1; i <= n; i++) { await ev('window.scrollTo(0,' + (a + (y - a) * easeK(i / n)) + ')'); await snap(stepSec); } };
const rectOf = (selOrFn, nth = 0) => ev(`__tour.rect(${selOrFn.startsWith('()') ? selOrFn : JSON.stringify(selOrFn)}, ${nth})`);
const toEl = async (sel, nth = 0, ms = 1400) => { const r = await rectOf(sel, nth); if (!r) { console.log('없음:', sel); return null; } await move(r.x, r.y, ms); return r; };
const clickAt = async () => { const p = await ev('window.__pos'); await send('Input.dispatchMouseEvent', { type: 'mouseMoved', x: p.x, y: p.y }); await ev('__tour.ripple()'); for (let i = 0; i < 4; i++) { await sleep(60); await snap(0.12); } await send('Input.dispatchMouseEvent', { type: 'mousePressed', x: p.x, y: p.y, button: 'left', clickCount: 1 }); await send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: p.x, y: p.y, button: 'left', clickCount: 1 }); await sleep(600); };
const clickEl = async (sel, nth = 0, ms = 1400) => { const r = await toEl(sel, nth, ms); if (r) await clickAt(); return r; };
const headingTop = async (fnSrc) => { const r = await rectOf(fnSrc); return r ? r.top : 0; };
const byText = (tag, text) => `() => [...document.querySelectorAll('${tag}')].find(x => x.innerText.includes(${JSON.stringify(text)}))`;
const hold = (s) => snap(s);

// ───────── 1. 사용설명 페이지 첫 화면과 목차 ─────────
await go(BASE + 'guide.html#top');
await cap('사용설명 페이지 첫 화면: "처음이라면, 예시부터 살펴보세요"'); await toEl('h1', 0, 1800); await hold(4);
await cap('이 도구는 경기도교육청 2023~2025 작품집 당선작 166건을 다루며, 모든 분석은 사람 검수 전입니다'); await toEl('.cover p', 0, 1500); await hold(5);
await cap('왼쪽 목차: 사용설명은 8개 부분으로 나뉘어 있습니다'); await scroll(260, 1600); await hold(1);
for (let i = 0; i < 8; i++) { await toEl('.toc a', i, 900); await hold(1.2); }
await cap('①~⑧ 순서로 위에서 아래로 읽으면 됩니다. 목차를 누르면 해당 부분으로 이동합니다'); await hold(2);
// ───────── 2. 1번 섹션 ─────────
await cap('1. 처음이라면 예시 결과부터: 로그인이나 설치 없이 홈페이지를 볼 수 있습니다');
await clickEl('.toc a', 0, 1200); await hold(1); await scroll(await headingTop('() => document.getElementById("section-1")') - 120, 1500);
await toEl('#section-1', 0, 1200); await hold(5);
await cap('순서: ③ 설계안 PDF 비교 → 시연 예시 보기 → 결과를 위에서 아래로 보기 → 저장'); await toEl('#section-1 ~ ol li', 1, 1500); await hold(7);
// ───────── 3. 홈페이지에서 실제로 따라 하기 ─────────
await cap('이제 설명대로 홈페이지에서 직접 해 보겠습니다'); await hold(3);
await go(BASE + '#trends', 3500);
await cap('홈페이지 위쪽 메뉴: ① 연도별 동향 · ② 향후 설계 방향 · ③ 설계안 PDF 비교 · 자료 조회'); await hold(1);
for (let i = 0; i < 4; i++) { await toEl('#navigation button', i, 1100); await hold(1.2); }
await cap('① 연도별 동향: 전체 건수와 학교 집계 대상을 나눠서 보여 줍니다'); await clickEl('#navigation button', 0, 1200); await hold(1);
await scroll(520, 2200); await toEl('.rs-table', 0, 1500); await hold(6);
await cap('전체 42·69·55건 중 학교 집계 대상은 40·61·35건 — 유치원·특수학교·사택·청사는 별도 유형'); await hold(5);
await scroll(1500, 2600); await toEl('.rs-table', 3, 1500); await cap('규모는 정보가 있는 사례의 중앙값, 빠진 정보의 수도 함께 표시합니다'); await hold(6);
await scroll(2150, 2600); await cap('2024년 설계 태그·사무소 연결은 "미부여(정보 없음)" — 주제가 없다는 뜻이 아닙니다'); await hold(6);
await cap('② 향후 설계 방향으로 이동합니다'); await scroll(0, 1200); await clickEl('#navigation button', 1, 1300); await hold(1);
await scroll(150, 1500); await toEl('.rs-direction', 0, 1400); await cap('카드마다 관찰한 내용 · 해석 · 적용 조건 · 반대 근거·미확인을 함께 보여 줍니다 (예측이 아니라 검토할 방향)'); await hold(3);
await scroll(330, 2800); await toEl('.rs-counter', 0, 1500); await hold(6);
await cap('③ 설계안 PDF 비교로 이동합니다'); await scroll(0, 1200); await clickEl('#navigation button', 2, 1300); await hold(1);
await scroll(150, 1500); await toEl('.rs-howto', 0, 1500); await cap('사용 순서: PDF 분석은 Claude Code가 하고, 홈페이지는 만들어진 결과 파일(result.json)을 불러와 보여 줍니다'); await hold(8);
await cap('이 화면에는 PDF를 올리는 버튼이 없는 것이 정상입니다'); await toEl('#result-file', 0, 1500); await hold(4);
await cap('"시연 예시 보기"를 누릅니다'); await clickEl('#load-demo-result', 0, 1500); await hold(2);
await scroll(await headingTop('() => document.querySelector(".rs-result-banner")') - 90, 2200); await cap('시연 결과: 공개 작품집 동탄12고를 새 설계안으로 가정한 시험 입력이며 사람 검수 전입니다'); await toEl('.rs-result-banner', 0, 1500); await hold(7);
await cap('위쪽 버튼으로 Markdown 보고서와 result.json을 저장할 수 있습니다'); await toEl('#save-md', 0, 1400); await hold(2); await toEl('#save-json', 0, 1000); await hold(3);
await scroll(await headingTop(byText('section', '후보 선정')) - 100, 2600); await cap('후보 선정 이유와 정보 없음 항목'); await hold(6);
await scroll(await headingTop(byText('section', '공통 비교표')) - 100, 2400); await toEl('.rs-chip', 0, 1400); await cap('공통 비교표: 부합 · 불일치 · 정보 없음 · 수치 차이를 구분합니다'); await hold(8);
await scroll(await headingTop(byText('section', '장점과')) - 100, 2400); await cap('장점마다 함께 확인할 운영상 부담을 적고, 아래 조건부 제안에는 적용 전에 확인할 조건이 붙습니다'); await hold(8);
// ───────── 4. 다시 사용설명으로 ─────────
await cap('다시 사용설명 페이지로 돌아가 나머지 부분을 봅니다'); await hold(2);
const sections = [
  ['section-2', '2. 네 가지 메뉴: 각 메뉴에서 할 수 있는 일과 읽을 때 주의할 점', 9],
  ['section-3', '3. 연도별 동향 읽기: 전체 건수와 학교 집계 대상, 정보 없음의 뜻', 9],
  ['section-4', '4. 향후 설계 방향 읽기: 관찰·해석·적용 조건·반대 근거를 함께 읽습니다', 9],
  ['section-5', '5. 내 설계안 PDF 비교: Claude Code에서 분석 → 홈페이지에서 결과 보기', 11],
  ['section-6', '6. 결과에서 쓰는 말: 부합·불일치·수치 차이·정보 없음·사람 검수 전', 10],
  ['section-7', '7. 막힐 때: PDF 버튼이 안 보이는 것은 정상입니다', 8],
  ['section-8', '8. 현재 범위와 한계: 정성 분석 5건 · 시험 입력 · 사람 검수 전', 9],
];
await go(BASE + 'guide.html', 3000);
for (const [sid, text, secs] of sections) {
  await cap(text); await scroll(await headingTop(`() => document.getElementById("${sid}")`) - 120, 2400);
  await toEl('#' + sid, 0, 1300); await hold(2);
  const h = await ev(`(() => { const e = document.getElementById("${sid}"); let n = e.nextElementSibling, y = 0; const top = e.getBoundingClientRect().top; let last = e; while (n && !/^H2$/.test(n.tagName)) { last = n; n = n.nextElementSibling; } return last.getBoundingClientRect().bottom - top; })()`);
  if (sid === 'section-5') {
    await scroll(await headingTop(byText('h3', 'A. Claude')) - 120, 1800); await toEl('pre', 0, 1500); await cap('5-A. 설계안 PDF는 Git에서 제외되는 폴더에 두고, 이 요청문으로 Claude Code에 비교를 맡깁니다'); await hold(8);
    await scroll(await headingTop(byText('h3', 'B. 홈페이지')) - 120, 2000); await toEl('h3', 1, 1300); await cap('5-B. 만들어진 result.json을 홈페이지에서 불러옵니다. 파일은 브라우저 안에서만 읽습니다'); await hold(8);
  } else if (h > 450) { await scroll((await headingTop(`() => document.getElementById("${sid}")`)) - 120 + Math.min(h - 420, 460), 3000); await hold(secs - 2); }
  else await hold(secs - 2);
}
await cap('사용설명은 GitHub 문서(docs/USER_GUIDE.md)와 웹 페이지(guide.html) 두 곳에서 볼 수 있습니다'); await scroll(0, 1500); await toEl('.back', 0, 1500); await hold(7);
await ev('1'); await hold(1.5);
await snap(1.5);
writeFileSync(path.join(OUT, 'frames.json'), JSON.stringify(frames));
console.log('frames', frames.length, 'sec', vt.toFixed(1));
ws.close(); proc.kill();
