// 사용설명 영상 낭독 대본과 장면 블록 시간표를 만든다. 입력: 프레임 폴더의 caps.json(자막 시각). 음성·영상은 만들지 않는다.
import { readFileSync, writeFileSync } from 'node:fs';
const caps = JSON.parse(readFileSync(process.argv[2] + '/caps.json', 'utf8'));
const total = JSON.parse(readFileSync(process.argv[2] + '/frames.json', 'utf8')).at(-1).ts + 1.6;
// [시작 자막 번호, 내레이션]
const blocks = [
  [0, '안녕하세요. 강태화입니다. 개선한 홈페이지의 사용설명을 소개합니다. 처음이라면 예시부터 보시면 됩니다.'],
  [2, '왼쪽 목차를 보면 사용설명은 여덟 부분으로 나뉘어 있습니다. 위에서 아래로 순서대로 읽으시면 되고, 목차를 누르면 해당 부분으로 바로 이동합니다. 다루는 자료는 경기도교육청 작품집 당선작 166건이고, 모든 분석은 사람 검수 전입니다.'],
  [4, '첫 번째 부분은 처음 오신 분을 위한 안내입니다. 로그인이나 설치 없이 홈페이지를 볼 수 있고, 설계안 PDF 비교 메뉴에서 시연 예시를 눌러 결과를 위에서 아래로 보시면 됩니다.'],
  [6, '설명대로 홈페이지에서 직접 해 보겠습니다. 위쪽에는 연도별 동향, 향후 설계 방향, 설계안 PDF 비교, 자료 조회, 네 개의 메뉴가 있습니다.'],
  [8, '연도별 동향은 전체 건수와 학교 집계 대상을 나눠서 보여 줍니다. 전체는 42건, 69건, 55건이고, 그중 학교로 집계한 것은 40건, 61건, 35건입니다. 유치원이나 특수학교 등은 별도 유형으로 셉니다. 규모는 정보가 있는 사례의 중앙값이고, 빠진 정보의 수도 함께 보입니다. 2024년의 태그 미부여는 주제가 없다는 뜻이 아닙니다.'],
  [12, '다음은 향후 설계 방향입니다. 카드마다 관찰한 내용, 해석, 적용 조건, 반대 근거와 미확인 사항을 함께 보여 줍니다. 미래를 예측한 것이 아니라 설계자가 검토할 방향입니다.'],
  [14, '설계안 PDF 비교 메뉴입니다. PDF 분석은 Claude Code가 하고, 홈페이지는 만들어진 결과 파일을 불러와 보여 줍니다. 그래서 이 화면에 PDF를 올리는 버튼이 없는 것이 정상입니다.'],
  [18, '시연 예시 보기를 누르면 공개 작품집의 동탄12고를 새 설계안으로 가정한 시험 결과가 나옵니다. 사람 검수 전입니다. 위쪽 버튼으로 보고서와 결과 파일을 저장할 수 있고, 아래에서는 후보를 고른 이유와 정보 없음 항목을 볼 수 있습니다.'],
  [21, '공통 비교표는 부합, 불일치, 정보 없음, 수치 차이를 구분합니다. 장점마다 함께 확인할 운영상 부담을 적고, 제안에는 적용 전에 확인할 조건이 붙습니다.'],
  [23, '다시 사용설명으로 돌아가 나머지를 보겠습니다. 두 번째는 네 가지 메뉴와 읽을 때 주의할 점입니다.'],
  [25, '세 번째는 연도별 동향 읽기로, 전체 건수와 학교 집계 대상, 정보 없음의 뜻을 설명합니다. 네 번째는 설계 방향을 읽는 법으로, 장점만 가져오지 말고 적용 조건과 미확인 사항을 함께 보라고 안내합니다.'],
  [27, '다섯 번째는 내 설계안 비교 방법입니다. Claude Code에서 설계안 PDF를 Git에서 제외되는 폴더에 두고 요청문으로 비교를 맡기면 결과 파일이 만들어집니다. 그 결과 파일을 홈페이지에서 불러오며, 파일은 브라우저 안에서만 읽습니다.'],
  [30, '여섯 번째는 결과에서 쓰는 말입니다. 정보 없음은 실제로 없다는 뜻이 아니고, 부합은 점수나 당선 가능성이 아닙니다. 일곱 번째는 막힐 때입니다. PDF 버튼이 안 보이는 것은 정상이고, 잘못된 결과 파일은 오류 안내 후 다시 고를 수 있습니다.'],
  [32, '마지막은 현재 범위와 한계입니다. 정성 분석은 5건이고, 시연은 공개 작품집을 쓴 시험 입력이며 모든 분석은 사람 검수 전입니다. 사용설명은 깃허브 문서와 웹 페이지에서 볼 수 있습니다. 시청해 주셔서 감사합니다.'],
];
const RATE = 4.8; const rows = blocks.map(([ci, text], i) => {
  const start = caps[ci].t; const end = i + 1 < blocks.length ? caps[blocks[i + 1][0]].t : total;
  const syll = [...text].filter((c) => /[가-힣]/.test(c)).length + Math.round([...text].filter((c) => /[0-9A-Za-z]/.test(c)).length * 0.6);
  return { n: String(i + 1).padStart(2, '0'), cap_from: ci, start_sec: start, end_sec: +end.toFixed(2), room_sec: +(end - start).toFixed(1), syllables: syll, est_read_sec: +(syll / RATE).toFixed(1), text };
});
writeFileSync('낭독_블록.json', JSON.stringify({ total_sec: +total.toFixed(1), rate: RATE, blocks: rows }, null, 2));
const md = ['# 사용설명 영상 낭독 대본 (14개 블록)', '', '> 대본은 영상 자막과 화면에 맞춘 초안입니다. 읽기 어려운 표현은 말하기 편하게 고쳐 읽으셔도 됩니다(뜻을 바꾸지 마세요). 실제로 하지 않은 일(원문 검수 완료 등)은 말하지 않습니다.', '',
  `영상 ${total.toFixed(0)}초. 각 블록은 해당 장면이 화면에 보이는 동안 읽습니다. 녹음이 더 길면 그 장면의 화면을 늘려 맞춥니다.`, '', '| # | 화면 시작(초) | 장면 여유(초) | 예상 낭독(초) | 내레이션 |', '|---|---|---|---|---|',
  ...rows.map((r) => `| ${r.n} | ${r.start_sec} | ${r.room_sec} | ${r.est_read_sec} | ${r.text} |`), '',
  '## 녹음 방법', '- 블록 하나씩 따로 읽어 `01.m4a` ~ `14.m4a`로 저장(wav·mp3도 가능), 폴더: `중간과제_제출자료\사용설명영상\내_녹음\`', '- 조용한 곳, 마이크 가까이, 차분하게 문장 끝까지. 틀리면 같은 번호로 다시 녹음해 덮어쓰기', ''];
writeFileSync('낭독_대본.md', md.join('\n'));
const esc = (t) => t.replace(/&/g, '&amp;').replace(/</g, '&lt;');
writeFileSync('낭독_대본.html', '<!doctype html><html lang="ko"><meta charset="utf-8"><title>사용설명 영상 낭독 대본</title><style>body{font-family:Malgun Gothic,sans-serif;max-width:860px;margin:30px auto;padding:0 20px;line-height:1.9;color:#173c39}h1{font-size:26px}section{border-bottom:1px solid #dce3dd;padding:14px 0}b{color:#166c59;font-size:20px}p{font-size:26px;margin:6px 0}small{color:#657571;font-size:14px}</style><h1>낭독 대본 — 블록별로 따로 녹음 (01~14)</h1><p style="font-size:16px">차분하게 문장 끝까지 읽고, 블록 사이에 잠깐 멈추세요. 파일 이름은 블록 번호(01.m4a …)입니다.</p>' + rows.map((r) => `<section><b>${r.n}</b> <small>(예상 ${r.est_read_sec}초 · 장면 ${r.room_sec}초)</small><p>${esc(r.text)}</p></section>`).join('') + '</html>');
console.log('블록', rows.length, '총', total.toFixed(0) + '초');
rows.forEach((r) => console.log(r.n, '여유', r.room_sec, '예상', r.est_read_sec, r.est_read_sec + 1 > r.room_sec ? '⚠ 장면 늘림 필요' : 'ok'));
