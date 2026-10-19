---
name: school-design-research
description: "학교건축 설계 리서치. 사용자가 설계안 PDF와 분석 목적을 주면, 그 설계안의 학교 조건과 공간 전략을 읽고 후보 검색 도구로 경기도교육청 2023~2025 작품집 당선작 166건(data/goe-annual.snapshot.json)에서 관련 후보를 찾아, 유사점·차이·장점·운영상 부담·조건부 설계 제안을 근거와 함께 Markdown 보고서와 홈페이지용 result.json으로 만든다. '설계안 PDF 비교', '유사 사례 찾아줘', '우리 설계안과 당선작 비교', '학교 설계 리서치', '공모 당선작 근거로 설계 방향 검토' 같은 요청에 사용한다. 점수·순위 산정, 성능·효과 예측, 홈페이지 수정, 데이터 재분류에는 사용하지 않는다."
---

# 학교건축 설계 리서치 (설계안 PDF 비교)

이 스킬은 **사용자 PC에서 Claude Code가 실행**하는 분석 절차다. 홈페이지(정적 웹)는 PDF를 분석하지 않고 AI를 호출하지 않는다. 이 스킬이 만든 `result.json`을 홈페이지의 "③ 설계안 PDF 비교" 화면에서 불러와 보여 주고 저장한다. 결과는 **AI가 읽고 쓴 검수 전 분석**이다.

## 먼저 읽을 것

1. `AGENTS.md` — 이 저장소의 작업 규칙(검수 완료 표시 금지, `award_year`는 수록연도, 2024년 태그·사무소 누락을 0건으로 해석 금지 등)
2. `rules/architecture-analysis.json` — **분석 기준**(영역, 근거 수준, 부합/불일치/정보 없음, 출처 기록, 금지 사항, 후보 선정 규칙, 보고서 구성)
3. `docs/analysis/pilot-comparison.md` — **분석 견본**. 문체·근거 구분·한계 표기를 맞추되 견본의 결론을 새 분석에 가져오지 않는다.
4. `docs/DESIGN_RESEARCH.md` — **result.json 형식**과 도구 사용법(필수 항목, 상태 값, 금지 필드)
5. 필요할 때만 `docs/DATA_CONTRACT.md`, `docs/PROJECT_IMAGES.md`

## 입력

- **설계안 PDF 경로**와 **분석 목적**(예: "주민 개방 영역과 학생 영역의 분리 방식 비교"). 목적이 없으면 한 줄로 되묻는다.
- 선택: 필수조건(예: 반드시 고등학교), 사용자가 정한 후보 사업, 후보 수 상한(기본 5건).

## 작업 위치 (Git 제외)

```
data/private/design-research/<작업명>/input/    사용자 PDF (원본 그대로, 수정하지 않음)
data/private/design-research/<작업명>/work/     page-map.md, query.json, search-result.json, evidence-*.md 등 중간 결과
data/private/design-research/<작업명>/report/   result.json, report.md (최종 결과)
```

- 시작 전에 `git check-ignore -v data/private/design-research/<작업명>/work/x`로 Git 제외를 확인한다. 제외되지 않으면 중단하고 알린다.
- 사용자 PDF·쪽 이미지·원문 도판은 공개 파일(`docs/`, `public/`, `data/` 공개 파일)에 복사하지 않는다. 커밋·업로드·공개는 사용자가 명시적으로 지시할 때만 한다.

## 절차

### ① PDF 페이지 구성 먼저 확인
총 쪽수, 쪽 크기, 글자 추출 가능 여부(이미지뿐인 PDF인지), 쪽별 종류(개념 글·배치도·평면도·단면도·입면도·투시도·범례), 방위 표시 여부, 작은 글씨를 읽을 수 있는지를 `work/page-map.md`에 표로 남긴다. **PDF 쪽 수와 한 쪽 안의 도판 수를 구분한다**(쪽 수 합계가 PDF 쪽 수와 같아야 한다). 사용자에게 요약해 보여 준 뒤 분석 쪽을 정한다. PDF를 열 수 없거나 글씨를 읽을 수 없으면 추측하지 않고 알리고 멈춘다.

### ② 학교 조건과 공간 전략 추출
`dimensions`(대지·배치, 동선, 학습공간, 공용공간, 주민 이용, 적용 조건) 순서로 정리한다. 학교 조건은 학교급·사업유형·시설 종류·대지·연면적·층수·위치·요구 프로그램. 항목마다 [사실]/[AI 해석]/[제안]을 구분하고 입력 PDF 쪽과 판독 상태(legible/uncertain/illegible)를 기록한다. 읽지 못한 표고·통로·라벨은 추정하지 않고 미확인으로 둔다. **기존 분석을 복사한 것을 새 판독으로 기록하지 않는다.**

### ③ 후보 검색 — 도구를 먼저 실행한다 (전체 JSON을 대화에 읽히지 않는다)
1. `work/query.json`을 쓴다.
```json
{
  "exclude_ids": ["<입력 사업이 데이터에 있으면 그 project_id>"],
  "required": { "facility_kind": "school" },
  "preferred": { "school_level": "high", "project_type": "new", "facility_kind": "school", "site_area": 12503, "gross_floor_area": 12422, "floors_above": 6 },
  "keywords": [{ "id": "open", "label": "주민·개방", "patterns": ["주민", "개방"] }],
  "limit": 40
}
```
   - `required`는 **사용자가 필수조건으로 정한 것만** 넣는다. 정하지 않으면 비운다.
   - `keywords`는 목적에서 나온 좁은 표현만 쓴다('지역'처럼 넓은 말은 거의 모든 사례가 걸린다).
2. 실행한다. 화면에는 요약만 나온다.
```
node tools/design-research.mjs search --query data/private/design-research/<작업명>/work/query.json --out data/private/design-research/<작업명>/work/search-result.json --show 10
```
3. 도구의 규칙: **입력 project_id(`exclude_ids`)만 제외한다.** 이름·주소·학교급이 겹치는 사업(예: 같은 학교의 교사동 신축과 체육관 증축)은 별도 사업일 수 있어 후보에 남기고 `중복 확인 필요`로 알린다. 같은 사업이라고 확정해 제외하지 말고, 후보로 쓸 때는 result.json의 `candidates[].duplicate_check`에 확인 필요를 적는다. 같은 위치인데 학교급이 다르면 이상 징후로 알린다. **정보 없음(미확인·값 없음·언급 확인 안 됨)과 명시적 불일치를 구분**하고, 태그가 없는 2024년 사례를 불일치로 처리하지 않는다. 설계 태그는 근거로 쓰지 않고 부여 여부만 표시한다. 정렬은 일치 항목 수 기준이며 순위·점수가 아니다.
4. 더 자세히 볼 후보만 `search-result.json`에서 프로그램(예: `node -e`)으로 골라 읽는다. 파일 전체나 `data/goe-annual.snapshot.json` 전체를 대화에 출력하지 않는다.
5. 후보는 목적과의 관련성(요약·심사평 내용)과 조건으로 **판단해 고른다**(기본 최대 5건). 고른 이유와 선정하지 않은 후보의 이유를 남긴다. 조건이 부족하거나 정보 없음이 많으면 후보를 억지로 채우지 않고 판단을 보류한다.

### ④ 필요한 후보의 근거만 추가 확인
- 고른 후보의 해당 쪽만 확인한다(작품집 전체 재추출 금지). 데이터의 `yearbook_page`와 쪽 번호 규칙(2025년 데이터의 쪽은 목차 번호일 수 있음)을 확인한다. 원본에 접근할 수 없으면 알리고 데이터의 요약·심사평만 쓰며 '원문 미대조'로 표시한다.
- 이미 읽은 기록(`work/evidence-*.md`, 기존 분석)을 재사용할 수 있다. 이때 `evidence[].basis`를 **reused_analysis**로, 이번에 읽은 것은 **new_reading**으로 구분해 기록한다.
- 직접 쓴 요약으로만 남긴다. 원문 문장·도판·심사위원 이름을 옮기지 않는다.

### ⑤ 보고서와 result.json 작성
1. `report/result.json`을 쓴다(형식은 `docs/DESIGN_RESEARCH.md`). 필수 항목: 입력 조건·쪽 구성, 단계 기록(`run.steps`의 `basis`로 새 판독/기존 분석 재사용/도구 실행 구분), 제외 목록(입력 사업 포함), 후보와 선정 이유(정보 없음 항목 포함), 공통 비교표(상태: `match`/`mismatch`/`no_information`/`numeric_difference`), 유사점·차이, 장점과 운영상 부담, 조건부 제안(적용 전 확인 조건), 근거 기록, 확인하지 못한 사항.
   - **명시적 불일치(`mismatch`)는 반대되는 내용의 출처 쪽이 있을 때만** 쓴다. 없으면 `no_information`.
   - 제원 숫자가 다른 것은 `numeric_difference`(수치 차이)로 쓴다. 필수조건을 정한 경우에만 조건 불일치를 판정한다.
   - 점수·순위 필드, 내부 경로(`data/private`, 드라이브 경로)를 넣지 않는다. `status.review`는 항상 `ai_draft_human_review_pending`.
2. 검증하고 Markdown을 만든다. 검증에 실패하면 고친다.
```
node tools/design-research.mjs validate data/private/design-research/<작업명>/report/result.json
node tools/design-research.mjs render   data/private/design-research/<작업명>/report/result.json --out data/private/design-research/<작업명>/report/report.md
```
3. 사용자에게 알린다: 쓴 파일 경로, 읽은 쪽, 새로 읽은 것과 재사용한 것, 확인하지 못한 항목. 그리고 **홈페이지에서 보는 방법**을 안내한다: 홈페이지(`npm start` 후 http://127.0.0.1:4173 또는 배포 주소) → "③ 설계안 PDF 비교" → "내 result.json 불러오기"에서 `report/result.json` 선택 → 화면에서 확인하고 Markdown·JSON으로 저장.

## 하지 말 것

- 유사도·적합도 같은 점수나 순위를 만들지 않는다. 자료에 없는 교육 효과·운영 성과·에너지 성능을 단정하지 않는다.
- 정보 없음·태그 없음·판독 불가를 불일치로 바꾸지 않는다. 판독하지 못한 글씨·방위·쪽 번호를 추측하지 않는다.
- AI 해석이나 draft_ai 태그를 사람 검증 완료로 표시하지 않는다. 같은 AI의 재판독을 독립 검증으로 표시하지 않는다.
- 데이터 파일·태그·화면 코드를 이 스킬로 수정하지 않는다(166건 재분류 포함).
- 사용자 PDF·원문 도판·심사위원 이름을 공개 위치에 복사하지 않는다. 커밋·업로드는 사용자 지시 없이 하지 않는다.
- 홈페이지가 PDF를 분석하는 것처럼 안내하지 않는다.

## 사용 예

```
school-design-research 스킬로 설계안 PDF를 비교해줘.
PDF: data/private/design-research/my-school/input/design.pdf
목적: 지역 주민 개방 영역과 학생 영역의 분리 방식 비교
```

## 아직 구현하지 않은 것

- PDF 쪽 구성 확인·쪽 이미지 추출 전용 도구(현재는 Claude가 가진 도구로 읽는다)
- 사용자 PDF 첫 실행 기록(시연 예시는 공개 작품집 발췌를 쓴 시험 입력이다)
- 후보 검색의 키워드는 요약·심사평 요지의 단서이며 원문 검증이 아니다
- 전체 166건의 공간 전략 재분류·태그 부여(2024년 태그 누락 포함)
