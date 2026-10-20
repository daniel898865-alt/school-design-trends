import { test } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';

// 로컬 미리보기(npm start)에서 홈페이지와 사용설명 페이지가 모두 열리는지, 허용하지 않은 파일은 막히는지 확인한다.
test('미리보기 서버: index.html·guide.html은 열리고 비공개 폴더·소스 문서는 막힌다', async () => {
  const port = 4300 + Math.floor(Math.random() * 400);
  const proc = spawn(process.execPath, ['tools/preview.mjs'], { env: { ...process.env, PORT: String(port) }, stdio: ['ignore', 'pipe', 'ignore'] });
  try {
    await new Promise((resolve, reject) => {
      const timer = setTimeout(() => reject(new Error('서버 시작 시간 초과')), 8000);
      proc.stdout.on('data', (d) => { if (String(d).includes('Local:')) { clearTimeout(timer); resolve(); } });
      proc.on('exit', () => reject(new Error('서버가 바로 종료됨')));
    });
    const status = async (p) => (await fetch(`http://127.0.0.1:${port}/${p}`)).status;
    assert.equal(await status('index.html'), 200);
    assert.equal(await status('guide.html'), 200);
    assert.equal(await status('src/styles/user-guide.css'), 200);
    assert.equal(await status('public/design-research/demo-result.json'), 200);
    const video = await fetch(`http://127.0.0.1:${port}/public/videos/user-guide.mp4`, { headers: { Range: 'bytes=0-99' } });
    assert.equal(video.status, 206);                                              // 구간 요청(영상 탐색) 지원
    assert.equal(video.headers.get('content-type'), 'video/mp4');
    assert.match(video.headers.get('content-range'), /^bytes 0-99\/\d+$/);
    assert.equal((await video.arrayBuffer()).byteLength, 100);
    assert.equal(await status('data/private/goe-annual.snapshot.json'), 404);   // 비공개 폴더는 제공하지 않음
    assert.equal(await status('docs/USER_GUIDE.md'), 404);                       // 허용 목록 밖
    assert.equal(await status('../package.json'), 404);
  } finally { proc.kill(); }
});
