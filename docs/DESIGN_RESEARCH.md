# 설계 리서치 기능 (개인 과제 1차 완성본)

> 모든 분석은 AI가 읽은 **사람 검수 전** 자료입니다. 연도는 **작품집 수록 기준**이며 실제 당선일·준공일이 아닙니다. 홈페이지는 PDF를 분석하지 않고 AI를 호출하지 않습니다.

## 세 가지 기능과 자료 흐름

| 기능 | 화면 | 자료 | 계산·분석 위치 |
|---|---|---|---|
| ① 연도별 동향 | `#trends` | `data/goe-annual.snapshot.json`(166건) 정량 집계, `public/design-research/directions.json`의 분석 사례 5건(정성) | 브라우저에서 `src/domain/design-research.js`의 `summarizeYearTrends` |
| ② 향후 설계 방향 | `#directions` | `public/design-research/directions.json` | 사람이 쓴 정리 자료를 `validateDirections`로 검증해 표시 |
| ③ 설계안 PDF 비교 | `#compare` | Claude가 만든 `result.json` | **Claude Code의 `school-design-research` 스킬**이 분석, 홈페이지는 불러와 표시·저장 |

① 위쪽은 전체 166건의 정량 집계(시설 구분, 학교 사업유형·학교급·규모, 입력된 정보의 범위), 아래쪽은 5건의 정성 분석입니다. 둘을 구분해 표시합니다. 집계 대상 수와 정보 없음 건수를 함께 표시하고, 2024년 설계 태그·사무소 연결은 "미부여(정보 없음)"로 표시합니다(0건 사례가 아님).

## ③ 사용 순서

1. Claude Code에서 이 저장소를 열고 설계안 PDF를 `data/private/design-research/<작업명>/input/`에 둡니다(Git 제외 폴더).
2. `school-design-research` 스킬로 PDF 비교를 요청합니다(분석 목적 포함). 스킬이 PDF 쪽 구성을 확인하고, 학교 조건·공간 전략을 읽고, **후보 검색 도구를 실행**한 뒤, `report/result.json`과 `report/report.md`를 만듭니다.
3. 홈페이지(`npm start` → http://127.0.0.1:4173 또는 배포 주소)의 "③ 설계안 PDF 비교"에서 `result.json`을 불러와 확인하고 Markdown·JSON으로 저장합니다. 파일은 브라우저 안에서만 읽습니다.

## 도구: `tools/design-research.mjs`

```
node tools/design-research.mjs search   --query <query.json> [--out <후보.json>] [--show 8] [--snapshot data/goe-annual.snapshot.json]
node tools/design-research.mjs validate <result.json>
node tools/design-research.mjs render   <result.json> [--out <report.md>]
```

- `search`: 전체 JSON을 출력하지 않고 요약만 출력합니다. 전체 결과는 `--out` 파일에 저장합니다.
  - 입력 사업(`exclude_ids`)과 같은 사업의 중복 자료(같은 이름, 또는 같은 위치·같은 학교급)를 제외합니다. 같은 위치인데 학교급·이름이 다르면 제외하지 않고 이상 징후로 알립니다.
  - `required`(사용자가 정한 필수조건)에 **명시적으로** 어긋나는 사업만 걸러 냅니다. 미확인 값은 걸러 내지 않습니다.
  - 조건별 상태: `match`(부합) / `mismatch`(명시적 불일치) / `no_information`(정보 없음) / `numeric_difference`(수치 차이). 키워드가 없거나 글이 없는 것은 불일치가 아니라 정보 없음입니다.
  - 설계 태그는 근거로 쓰지 않고 부여 여부만 표시합니다. 심사평 분석 제외 사례의 심사평은 검색에 쓰지 않습니다.
  - 정렬은 일치 항목 수 기준이며 점수·순위가 아닙니다.
- `validate`: 결과 JSON의 필수 항목과 금지 사항을 검사합니다. 실패하면 종료 코드 1.
- `render`: 검증을 통과한 결과만 Markdown으로 만듭니다(홈페이지의 Markdown 저장과 같은 변환).

`query.json`: `exclude_ids`, `required`, `preferred`(`school_level`, `project_type`, `facility_kind`, `site_area`, `gross_floor_area`, `floors_above`), `keywords`(`id`, `label`, `patterns`), `limit`.

## result.json 형식 (version 0.1)

최상위 필수 키: `schema`(`school-design-research-result`), `version`(`0.1`), `title`, `purpose`, `status`, `run`, `input`, `exclusions`, `candidates`, `selected`, `comparison`, `similarities`, `differences`, `merits_burdens`, `proposals`, `evidence`, `unconfirmed`.

- `status`: `review`는 `ai_draft_human_review_pending`만 허용(사람 검수 완료로 표시하지 않음), `demonstration`(boolean), `notices`("검수 전" 문구 필수), `year_basis_notice`("수록" 기준 명시 필수).
- `run`: `kind`(`demonstration`|`user_run`), `input_kind`(`public_yearbook_excerpt`|`user_pdf`), `steps[]`(`id`: page_map/extraction/candidate_search/evidence/report, `status`, `basis`: **new_reading / reused_analysis / tool_run / not_applicable**, `note`).
- `input`: `label`, `excluded_project_id`(선택), `page_count`, `page_map[]`(행 수가 `page_count`와 같아야 함 — PDF 쪽 수와 도판 수를 구분), `conditions`, `strategies[]`(`dimension`, `summary`, `evidence_level`: fact/ai_interpretation/proposal, `sources[]`, `uncertain`). 사실에는 쪽 출처가 필요합니다.
- `exclusions[]`: 입력 사업을 포함한 제외 목록. 제외된 사업은 `candidates`에 있을 수 없습니다.
- `candidates[]`: `project_id`, `title`, `award_year`(수록연도), `reason`, `info_missing[]`(없어도 배열). `selected[]`는 `candidates`의 부분집합.
- `comparison.rows[]`: `item`, `input`, `values{<project_id>: {status, note, source}}`. 선정된 모든 후보의 값이 있어야 하며 `mismatch`에는 반대되는 내용의 `source`가 필요합니다.
- `merits_burdens[]`: 장점을 쓰면 `burden`(함께 확인할 운영상 부담)도 필수. `proposals[]`: 적용 전 `conditions` 필수.
- `evidence[]`: `target`(`input` 또는 project_id), `basis`(new_reading|reused_analysis), `summary`(직접 쓴 요약), `sources[]`.
- 금지: `score`·`rank` 같은 종합점수·순위 필드, 내부 경로(`data/private`, 드라이브 경로)가 들어간 문자열.

시연 예시: `public/design-research/demo-result.json`(공개 작품집 2025의 동탄12고 인쇄 066~073쪽 발췌를 새 설계안이라고 가정한 **시험 입력**).

## 새로 읽은 것과 재사용한 것 (시연 예시 기준)

| 항목 | 기록 |
|---|---|
| 입력 PDF 쪽 구성·학교 조건·공간 전략 | **새로 읽음**(입력 PDF 직접 판독, 같은 AI의 재판독이며 독립 검증 아님). 기존 분석 견본과 달라진 점을 기록 |
| 후보 검색 | **도구 실행**(`tools/design-research.mjs search`: 166건 중 구조 조건 통과 135건, 입력 사업 제외) |
| 후보 2건(세교2-2고·화양2고)의 근거 | **기존 분석 재사용**(시험 실행에서 읽은 배치도·평면도·범례 기록, 데이터의 요약·심사평). 이번 구현에서 후보 쪽을 다시 읽지 않음. 단면도·입면도는 열람하지 않음 |
| ① 연도별 동향 | 기존 166건 데이터로 계산(재분류 없음) |
| ② 설계 방향·분석 사례 5건 | 기존 분석(분석 견본, 시연 실행)의 정리. 새 PDF 판독 없음 |

## 남은 한계

- 분석 사례는 5건뿐입니다. 정성 분석으로 연도별·경기도 전체 트렌드를 말할 수 없습니다. 정량 집계는 수록된 당선작의 집계이며 실제 연간 발주량·준공 실적이 아닙니다.
- 2024년 설계 태그와 사무소 연결이 없어 태그 기반 연도 비교는 하지 않습니다. 사업유형 분류는 작품집 장 구성이 연도별로 달라 같은 이름이 아니면 합치지 않았습니다.
- 후보 검색의 키워드는 요약·심사평 요지의 단서이며 원문 검증이 아닙니다. 검색 결과 정렬은 순위가 아닙니다.
- 시연 예시의 후보 2건은 단면도·입면도를 확인하지 않았고, 입력의 표고·연결통로 층수는 불확실합니다. 사용자 PDF로 시험한 기록은 아직 없습니다.
- PDF 쪽 구성 확인·쪽 이미지 추출 전용 도구는 없습니다. 스킬은 Claude가 가진 도구로 PDF를 읽습니다.
- 모든 내용은 사람 검수 전입니다.
