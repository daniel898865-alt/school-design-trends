# 데이터 규격 v0.1 · 개발 합의 초안

서로의 작업을 기다리지 않도록 같은 입력·출력 형식을 먼저 합의한다. 아래 필드와 이름은 합의 후 버전으로 관리한다. 결측은 빈 문자열이나 0 대신 `null`, 연결 없음은 빈 배열을 쓴다. 시간은 ISO 8601, 날짜는 YYYY-MM-DD다. 원본 값과 정규화 값을 분리 보관한다.

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

## 텍스트·이미지·주제

`summary`는 원문 전체가 아닌 직접 작성한 요약이다. `images[]`의 항목은 `url`, `source_id`, `creator`, `permission_status`, `alt_text`를 포함한다. 사용 조건을 확인하지 못하면 이미지를 표시·재배포하지 않고 원문 링크를 제공한다. 이미지가 없다고 사례를 제외하지 않는다.

`topic_evidence[]`는 `topic_id`, `source_id`, `evidence_note`, `review_status`를 가진다. `rules/topics.json`의 주제 사전에 연결한다. 최초 후보는 지역공유, 가변학습공간, 탄소·에너지, 외부학습공간, 안전·접근성이며 정의와 포함/제외 예시를 팀이 합의한다. 이는 이미 확인된 최근 유행을 선언하는 목록이 아니다. 미분류와 복수 태그를 허용한다.

## 숫자 해석 규칙

1. 최근 3년은 `(기준일 - 36개월, 기준일]`로 정의한다. 집계마다 `date_basis`를 선택한다. 당선 추세는 `award_date`, 기사 추세는 출처의 `published_at`을 사용하며 결측일을 서로 대신 채우지 않는다. 불완전한 연도·월은 표시하고 전년 비교는 같은 경과 기간으로 한다.
2. 지역별 기본 사업 건수는 고유 `project_id` 수다. 기사 건수는 고유 `source_id`, 학교 수는 `school_id`, 건물 수는 `building_id`로 따로 센다. 하나의 사업이 여러 학교·지역에 걸치면 지역별 참여 건수와 전체 고유 사업 수가 다를 수 있음을 표시한다.
3. 초중 통합학교를 초등과 중등에 동시에 더하지 않고 기본 집계에서는 `combined`로 둔다. 확장 집계가 필요하면 다중 분류와 분모를 명시한다.
4. 공동 당선은 참여한 사무소마다 1건을 표시하되 이름을 '참여 당선 건수'로 한다. 사무소별 합이 전체 사업 수와 같다고 가정하지 않는다. 시장점유율·수주액으로 대체하지 않는다.
5. 사업자등록번호는 문자열로 보존하고 공개된 확인 근거가 있을 때만 저장한다. 10자리 형식 통과는 실재·영업 상태 확인과 다르다. 미확인은 `null`과 `registration_status: unknown`으로 둔다.
6. 건물의 40년 판정은 기준일과 준공일로 한다. 연도만 있으면 해당 연도의 가능한 날짜 범위로 연령 구간을 계산한다. 모두 40년 이상이면 확정, 모두 미만이면 제외, 범위가 걸치면 `uncertain`으로 별도 표시한다. 2026년 기준 1986년 준공이라고만 적힌 경우에는 월일 확인 전 정확한 40년 여부를 단정하지 않는다.
7. 철거·폐교 상태와 준공일 미확인을 분리한다. 연령은 안전등급이나 재건축 필요성의 판정이 아니다. 실제 점검·사업 선정 상태가 없으면 이를 추론하지 않는다.

## A → B 함수 경계 제안

```text
parseSnapshot(text) -> {snapshot, errors[], warnings[]}
filterProjects(snapshot, {asOf, months, dateBasis, regions, schoolLevels, topics}) -> projects[]
summarizeProjects(projects) -> {uniqueProjects, byRegion[], byMonth[], excludedUnknownDates}
classifyBuildingAge(building, asOf, threshold=40) -> {status, minAge, maxAge, reason}
exportRows(snapshot, filters) -> {rows[], columns[], metadata}
```

A1의 `parseSnapshot`, `filterProjects`, `summarizeProjects`는 구현되었다. `filterProjects`의 반환 배열은 조회 조건·엔티티 맵을 `meta`에 보존하므로 `summarizeProjects`에 배열을 그대로 전달한다. 가공·직렬화로 meta를 잃으면 기준일과 참조 존재 검증 정보를 잃는다. 파서의 errors를 확인한 뒤 사용하고 warnings도 표시한다.

`classifyBuildingAge`와 공통 `exportRows` 등 A2 및 UI 어댑터는 미완료다. [통합 기록](INTEGRATION_REVIEW.md)과 이슈 #12에서 필터 이름·결측·다지역의 대응을 추적한다. 완성된 화면은 공통 집계 결과를 사용해야 하며, 현재의 가상 자료 전용 공급자를 실제 자료 처리에 사용하지 않는다. CSV 내보내기는 수식으로 해석될 수 있는 문자열을 안전하게 처리하고, 입력 텍스트를 화면에 넣을 때 HTML로 실행하지 않는다. 외부 링크는 http/https만 허용한다.
