# 데이터 규격 v0.2 · 작품집 자료 연결

서로의 작업을 기다리지 않도록 같은 입력·출력 형식을 먼저 합의한다. 아래 필드와 이름은 합의 후 버전으로 관리한다. 결측은 빈 문자열이나 0 대신 `null`, 연결 없음은 빈 배열을 쓴다. 시간은 ISO 8601, 날짜는 YYYY-MM-DD다. 원본 값과 정규화 값을 분리 보관한다.

2026-10-19에 작품집 연결을 위한 선택 필드를 추가했다. `schema_version: "0.1"`과 `"0.2"`를 모두 읽는다. 기존 0.1 자료에 이미 있던 아래 확장 필드도 검증하여 보존하며, 원본은 레코드의 `_raw`에 남긴다. 확장 필드가 없는 과거 자료에는 누락 경고를 만들지 않는다. 실제 자료(`is_demo: false`)와 가상 자료(`true`)를 같은 파서와 화면 공급자가 읽고, 화면·내보내기에 실제 값을 유지한다. 과거 `validateDemoSnapshot`은 가상 자료 검증용으로만 남긴다.

## 기본 단위

| 객체 | 식별자 | 핵심 필드 |
|---|---|---|
| 학교 | `school_id` | `name`, `official_code`, `school_level`, `region_code`, `region_name`, `address`, `source_ids` |
| 건물 | `building_id` | `school_id`, `name`, `completion_date`, `completion_year`, `date_precision`, `status`, `source_ids`, `verified_at` |
| 설계사업 | `project_id` | `title`, `school_ids`, `region_code`, `school_level`, `project_type`, `competition_date`, `award_date`, `completion_date`, `firm_ids`, `source_ids`, `summary`, `topic_evidence`, `images` |
| 출처 | `source_id` | `source_type`, `title`, `publisher`, `url`, `published_at`, `retrieved_at`, `rights_note`, `verification_status` |
| 사무소 | `firm_id` | `name`, `aliases`, `business_registration_number`, `registration_status`, `official_url`, `source_ids`, `verified_at` |

`school_level`: `elementary`, `middle`, `high`, `combined`, `other`, `unknown`.
`source_type`: `magazine`, `competition`, `news`, `official_school`, `official_building`, `official_company`.
건물 `status`: `in_use`, `demolished`, `closed`, `unknown`.
`date_precision`: `day`, `year`, `unknown`.

학교의 설립·개교일은 건물 준공일로 넣지 않는다. 건물 식별자는 학교 코드만으로 만들지 않는다. 공모번호·발주기관·학교·사업 범위로 사업을 구분하고 이름만 비슷한 사업은 자동 병합하지 않는다. 원자료의 학교 및 행정 코드 체계를 별도 매핑한다.

## Snapshot

```text
schema_version, is_demo, as_of, generated_at,
schools[], buildings[], projects[], sources[], firms[],
coverage { scope, source_status, limitations[] }
```

예시는 `data/examples/snapshot.demo.json`이다. 가상 예시는 실제 사례나 통계로 집계하지 않고 예시 모드임을 화면·내보내기에 표시한다. 전국 자료가 없으면 `coverage.scope`에 확인한 지역과 출처를 적는다.

## v0.2 작품집 사업 확장 필드

다음은 `projects[]`의 선택 필드다. `award_year`라는 기존 이름을 호환성 때문에 유지하지만 의미는 **작품집 수록연도**다. 실제 당선연도·준공연도가 아니며 `YYYY-01-01` 같은 임의 날짜로 바꾸지 않는다.

| 필드 | 형식·단위 | 처리 원칙 |
|---|---|---|
| `award_year` | 1000~9999 정수 또는 null | 네 자리 숫자 문자열은 정수로 정규화. 날짜·개월 필터와 분리 |
| `yearbook_page` | 양의 정수 또는 null | 원자료에 기록된 쪽수. PDF 쪽·인쇄 쪽·목차 번호가 같다고 가정하지 않음. 2025년 목차 번호는 검토 필요 |
| `facility_kind`, `concept_title` | 문자열 또는 null | 시설 유형과 직접 정리한 개념 제목. `school_level`을 대신하지 않음 |
| `metrics` | 아래 필드의 객체 또는 null | 원문 수치와 불확실성을 보존. 숫자가 서로 맞는다는 검증을 의미하지 않음 |
| `designers[]` | `{person, firm}` | 각 값은 문자열 또는 null. 설계자 표기는 `firms`·`firm_ids`의 검증된 연결을 자동 생성하지 않음 |
| `jury_notes[]` | `{affiliation_type, note}` | 문자열 또는 null. 직접 쓴 심사평 요지이며 심사위원 이름·원문 전체를 싣지 않음 |
| `design_tags[]`, `special_flags[]` | 문자열 배열 | 세부 초안 태그·메모. 공통 주제 집계는 `topic_evidence`로만 수행 |
| `data_issues[]` | 문자열 배열 | 수치 불일치, 판독 불확실, 출처 쪽수, 검수 상태 등 확인·검수 메모. 동일 문장은 중복 제거하며 원문은 `_raw`에 보존 |

`metrics`의 텍스트 필드는 `client`, `location`, `program`, `structure`, `exterior`, `scope_note`다. 숫자는 0 이상의 유한한 수 또는 null을 허용한다: `site_area`, `building_area`, `gross_floor_area`는 ㎡, `building_coverage`, `floor_area_ratio`는 %, `floors_above`, `floors_below`는 정수 층수다. 용적률 100% 초과는 오류로 보지 않는다. 원문 면적 사이 불일치를 계산으로 고쳐 쓰지 않고 `data_issues`로 안내한다. 알 수 없는 metrics 하위 필드는 경고와 `_raw`로 보존한다.

실제 166건에는 학교·건물 기본정보가 연결되어 있지 않다(`schools`, `buildings`, `school_ids`는 빈 배열). 지역은 사업의 `region_code: "41"`로 집계할 수 있지만 학교 수·건물 연령은 추정하지 않는다. 2024년 설계자 표기가 보완되어도 사무소 연결이 아직 없는 사례를 사무소 참여 집계에 자동으로 더하지 않는다.

`data_issues`는 오류만 담는 목록이 아니다. 화면·내보내기는 **확인·검수 메모가 있는 사업 수**와 **중복 제거한 메모 수**를 현재 자료에서 계산한다. 최초 제보의 ‘수치 확인 필요 22건’을 최신 전체 메모 건수로 고정 표시하지 않는다.

## 텍스트·이미지·주제

`summary`는 원문 전체가 아닌 직접 작성한 요약이다. `images[]`의 항목은 `url`, `source_id`, `creator`, `permission_status`, `alt_text`를 포함한다. 사용 조건을 확인하지 못하면 이미지를 표시·재배포하지 않고 원문 링크를 제공한다. 이미지가 없다고 사례를 제외하지 않는다.

`topic_evidence[]`는 `topic_id`, `source_id`, `evidence_note`, `review_status`를 가진다. `rules/topics.json`의 주제 사전에 연결한다. 최초 후보는 지역공유, 가변학습공간, 탄소·에너지, 외부학습공간, 안전·접근성이며 정의와 포함/제외 예시를 팀이 합의한다. 이는 이미 확인된 최근 유행을 선언하는 목록이 아니다. 미분류와 복수 태그를 허용한다.

공통 ID는 `community_sharing`, `flexible_learning`, `carbon_energy`, `outdoor_learning`, `safety_accessibility`다. 과거 UI의 `shared`, `flexible`, `carbon`, `outdoor`, `access`는 화면 공급자에서 대응하는 ID로 바꾸되 `_raw`를 보존한다. `draft_ai`는 사람이 검수하지 않은 초안 상태이며 승인으로 바꾸지 않는다. 2024년 69건에는 아직 주제 근거가 없으므로 연도별 주제 구성비는 **정보 없음(null)** 으로 표시한다. 한 연도라도 미분류가 남아 있으면 그 연도 간 주제 증감은 계산하지 않는다. 등록된 근거 수 0건은 실제 설계에 그 주제가 없다는 뜻이 아니다.

## 숫자 해석 규칙

1. 최근 3년은 `(기준일 - 36개월, 기준일]`로 정의한다. 집계마다 `date_basis`를 선택한다. 사업 준공은 `completion_date`, 공모는 `competition_date`, 당선은 `award_date`, 기사는 출처의 `published_at`을 사용하며 결측일을 서로 대신 채우지 않는다. 사업 준공일을 건물별 준공일이나 개교일로 대체·합성하지 않는다. 불완전한 연도·월은 표시하고 비교 기간을 맞춘다. 현재 연도별 화면의 전년 비교는 두 해 모두 전체 연도가 포함될 때만 제공하며, 부분 연도의 같은 경과 기간 비교는 아직 제공하지 않는다. 기사 기준 연도별 고유 사업은 조회 기간 안의 최초 연결 기사 날짜에 한 번 배정한다. 월별 기사 노출 집계는 여러 달에 같은 사업이 참여할 수 있으므로 두 집계의 합산 방식은 다르다.
2. 지역별 기본 사업 건수는 고유 `project_id` 수다. 기사 건수는 고유 `source_id`, 학교 수는 `school_id`, 건물 수는 `building_id`로 따로 센다. 하나의 사업이 여러 학교·지역에 걸치면 지역별 참여 건수와 전체 고유 사업 수가 다를 수 있음을 표시한다.
3. 초중 통합학교를 초등과 중등에 동시에 더하지 않고 기본 집계에서는 `combined`로 둔다. 확장 집계가 필요하면 다중 분류와 분모를 명시한다.
4. 공동 당선은 참여한 사무소마다 1건을 표시하되 이름을 '참여 당선 건수'로 한다. 사무소별 합이 전체 사업 수와 같다고 가정하지 않는다. 시장점유율·수주액으로 대체하지 않는다. `firms`에 레코드가 없는 참조는 사무소 수와 참여 건수에서 제외하고 `unresolvedFirmRefs`로 별도 안내한다. 원래 사업의 식별자는 보존한다.
5. 사업자등록번호는 문자열로 보존하고 공개된 확인 근거가 있을 때만 저장한다. 10자리 형식 통과는 실재·영업 상태 확인과 다르다. 미확인은 `null`과 `registration_status: unknown`으로 둔다.
6. 건물의 40년 판정은 기준일과 준공일로 한다. 연도만 있으면 해당 연도의 가능한 날짜 범위로 연령 구간을 계산한다. 모두 40년 이상이면 확정, 모두 미만이면 제외, 범위가 걸치면 `uncertain`으로 별도 표시한다. 2026년 기준 1986년 준공이라고만 적힌 경우에는 월일 확인 전 정확한 40년 여부를 단정하지 않는다.
7. 철거·폐교 상태와 준공일 미확인을 분리한다. 연령은 안전등급이나 재건축 필요성의 판정이 아니다. 실제 점검·사업 선정 상태가 없으면 이를 추론하지 않는다.
8. 작품집 조회는 `dateBasis: "award_year"`와 `year: "" | "2023" | ...`를 사용한다. 내부 `filterProjectsByYearbookYear`의 `date_basis: "yearbook_year"`와 같은 의미다. 수록연도 없는 사업은 `excludedUnknownYears`로 분리한다. 이 모드의 `window`, `months`, 연도 행의 `from`·`to`는 null이고 월별 집계는 빈 배열이다. 날짜 기준으로 바꾸면 종전 날짜 결측 규칙을 그대로 적용한다. 수록연도만으로 1년 전체를 빠짐없이 수집했다고 간주하지 않는다.

## A → B 함수 경계 제안

```text
parseSnapshot(text) -> {snapshot, errors[], warnings[]}
filterProjects(snapshot, {asOf, months, dateBasis, regions, schoolLevels, topics}) -> projects[]
filterProjectsByYearbookYear(snapshot, {years, regions, schoolLevels, topics}) -> projects[]
summarizeProjects(projects) -> {uniqueProjects, byRegion[], byMonth[], excludedUnknownDates}
classifyBuildingAge(building, asOf, threshold=40) -> {status, minAge, maxAge, reason}
exportRows(snapshot, filters) -> {rows[], columns[], metadata}
```

A1의 `parseSnapshot`, `filterProjects`, `summarizeProjects`는 구현되었다. `filterProjects`의 반환 배열은 조회 조건·엔티티 맵을 `meta`에 보존하므로 `summarizeProjects`에 배열을 그대로 전달한다. 가공·직렬화로 meta를 잃으면 기준일과 참조 존재 검증 정보를 잃는다. 파서의 errors를 확인한 뒤 사용하고 warnings도 표시한다.

`classifyBuildingAge`, `summarizeFirms`, `summarizeTopics`, 공통 `exportRows` 등 A2와 UI 어댑터를 구현했다. [연결 검증](UI_CONNECTION_VERIFICATION.md)은 당시 가상 자료 연결 기록이며 현재 실제 자료 경로는 이 문서의 v0.2 규칙을 따른다. 화면은 `src/ui/data-provider.js`에서 0.1/0.2 실제·가상 자료를 검증해 사용한다. 5MB 문자열 입력, 객체 종류별 1,000건, 중첩 텍스트 6,000자, 레코드 내부 배열 100항목의 화면 제한을 적용한다. 파싱·형식 검증 통과는 사람의 원문 검수 완료가 아니다.

화면은 검색·주제 미분류·지역·학교급·연도 선택을 마친 배열을 `exportSelectedProjectRows`에 넘긴다. 같은 배열을 날짜 경로로 다시 필터링하지 않는다. 내보내기에는 `is_demo`, 수집 범위·한계, 기준 종류·연도, 출처, 초안 주제 상태와 확인·검수 메모 수를 담는다. CSV 내보내기는 수식으로 해석될 수 있는 문자열을 안전하게 처리하고, 입력 텍스트를 화면에 넣을 때 HTML로 실행하지 않는다. 외부 링크는 http/https만 허용한다.
