# 병합 검토와 데이터 연결 과제

2026-10-17 · Node.js 24.14.0 · 첫 PR 통합 당시의 검토 기록이다. 아래의 미완료 연결 항목은 이후 A2와 UI를 연결하면서 처리했으며, 현재 상태는 [후속 검증](UI_CONNECTION_VERIFICATION.md)을 따른다.

## 검토한 PR

| PR | 담당 | 확인한 범위 |
|---|---|---|
| [#2](https://github.com/yunzecho-eng/school-design-trends/pull/2) | Yunze | 역할 변경·브랜치·이슈 분리 문서 |
| [#5](https://github.com/yunzecho-eng/school-design-trends/pull/5) | Yunze | B1 검색·사례·지역/월별 그래프, 가상 자료 화면 |
| [#6](https://github.com/yunzecho-eng/school-design-trends/pull/6) | Daniel | A1 입력·정규화·중복 제거·지역/학교급/월별 집계 |
| [#7](https://github.com/yunzecho-eng/school-design-trends/pull/7) | Yunze | B2 사무소·건물·주제·상세·CSV/Markdown 화면 |

네 브랜치의 로컬 통합에서 Git 파일 충돌은 없었다. UI와 A1이 동일한 처리 흐름에 연결된 것은 아니며, 아래 미완료 항목을 별도로 유지한다. 검토 시 GitHub CI 결과와 팀원의 직접 승인 리뷰는 없었다. 에이전트의 실행 검증을 기록하고 사용자의 명시적 병합 요청에 따라 반영하며, 팀원의 승인을 대신했다고 기록하지 않는다. 실제 병합 상태는 각 PR의 GitHub 기록을 따른다.

## 수정한 데이터 결함

재현 기준은 Daniel A1의 `380fa48`이다. 각 이슈를 Daniel에게 할당하고, 통합 수정 PR을 main에 반영할 때 종료한다.

| 이슈 | 재현 및 영향 | 수정 파일·처리 |
|---|---|---|
| [#8](https://github.com/yunzecho-eng/school-design-trends/issues/8) | CSV에 `award_date` 열이 두 번 있으면 마지막 날짜가 앞의 날짜를 덮어씀 | `src/data/csv.js`: 공백 정리 후 중복 헤더를 오류로 반환하고 records를 비움 |
| [#9](https://github.com/yunzecho-eng/school-design-trends/issues/9) | `2026-05-02T99:99`, `T09:00garbage`가 게시일로 통과 | `src/domain/dates.js`: 전체 문자열·시분초·오프셋 검사, 기재된 현지 날짜 보존 |
| [#10](https://github.com/yunzecho-eng/school-design-trends/issues/10) | 실제 학교·출처가 없는데 끊어진 참조를 1건으로 집계 | `src/domain/projects.js`: 전체·지역·학교급·월별 집계에 실제 엔티티 존재 확인; 원본 참조와 경고 보존 |
| [#11](https://github.com/yunzecho-eng/school-design-trends/issues/11) | `region_code: {"toString": null}`에서 TypeError로 입력 중단 | `src/data/normalize.js`: 타입을 먼저 검사하고 미확인·진단 반환, 이전 코드 매핑의 자체 키만 조회 |

운영 데이터가 유실된 사건은 관찰하지 않았다. 위 문제는 가상 입력으로 재현한 파서 중단 또는 집계 오류다.

## 아직 연결할 부분 — Yunze #12

[화면 연결 이슈 #12](https://github.com/yunzecho-eng/school-design-trends/issues/12)는 Yunze에게 할당한다. 데이터 A2의 책임은 기존 [Daniel #4](https://github.com/yunzecho-eng/school-design-trends/issues/4)에 유지한다.

| 경계 | 지금 확인한 차이 | 필요한 수정 |
|---|---|---|
| 필터 | UI의 `region/schoolLevel/topic`을 A1에 그대로 넘기면 필터가 무시됨. 서울+초등+outdoor 조건에서 1건 대신 11건 | `src/ui/app.js`의 어댑터에서 `regions/schoolLevels/topics` 배열로 변환. 검색어 처리와 반환 지표 매핑도 명시 |
| 결측·날짜 | A1 예시의 `project_type: null`, `region_code: null`, ISO 시각 `published_at`을 UI 데모 검증이 거부 | 결측 표시·ISO 날짜 표시를 합의. 데모 전용 안전 제한을 단순 삭제하지 않음 |
| 여러 지역 | A1 `v-project-009`는 경기·인천 참여 각 1건, 데모 UI는 사업 대표 지역만 사용 | A1 `region_codes`와 지역 참여 집계를 사용하고 전체 고유 사업 수와 구분 |
| 파서 진단 | 잘못된 당선일은 오류와 함께 null로 정규화됨. snapshot만 넘기면 11→10건 감소를 숨길 수 있음 | errors를 먼저 표시·차단하고 이전 결과 보존. warnings도 전달 |
| 브라우저 로딩 | 현재 미리보기 서버는 A1 모듈 경로를 제공하지 않음 | 연결 시 `tools/preview.mjs`에 필요한 data/domain/rules 경로만 허용. 비공개 파일 차단 유지 |
| A2 | 공통 건물 연령·사무소·주제·내보내기 함수가 아직 없음 | Daniel #4 구현 후 Yunze 어댑터 연결. #3·#4 전체를 조기에 닫지 않음 |

현재 UI는 계속 가상 자료 전용이다. 실제 전국 데이터, 자동 수집, 월별 갱신, GitHub Pages 배포는 이번 병합의 완료 범위가 아니다.

## 실행 근거

- `npm test`: UI 28개 + domain 33개 + integration 2개 = **63개 통과**.
- 통합 테스트 2개 안에서 공개 데모 2종의 날짜 기준·기간·조회일·지역 **96개 조합**을 비교했다. 사업 ID, 사업·출처·학교 수, 날짜 결측, 지역·월별 건수가 일치한다. A1의 결측·다지역 입력까지 통합 완료했다는 뜻은 아니다.
- `node scripts/check-snapshot.js public/demo.snapshot.json`: 오류·경고 0, 사업 11건·출처 13건·학교 11곳, 날짜 미상 1건 제외.
- `npm test`가 UI만 실행하던 설정을 전체 테스트 탐색으로 변경했다.
- JSON import attributes를 사용하는 A1을 반영해 Node.js 지원 기준을 22.12 이상으로 명시했다([Node.js 문서](https://nodejs.org/api/esm.html#import-attributes)). 실행 검증 버전은 24.14.0이다.
- UI 브라우저 검증은 [기존 기록](UI_VERIFICATION.md)을 따른다. 이번 통합 수정은 화면 코드와 기존 예시 자료를 변경하지 않는다.
