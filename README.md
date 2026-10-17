# School Design Trends · 학교 설계 동향

잡지·설계공모·뉴스의 학교 설계 사례를 모아, 최근 3년의 변화와 지역별 분포를 근거와 함께 살펴보는 웹 도구입니다.

**[웹 화면 바로 열기 →](https://yunzecho-eng.github.io/school-design-trends/)**

현재는 **가상 자료로 작동하는 공개 데모**입니다. 검색·그래프·사무소·건물 연령·주제·내보내기를 A1/A2 공통 데이터 모듈에 연결했습니다. 실제 전국 자료 수집·미래 예측·월별 자동 갱신은 아직 제공하지 않습니다.

위 주소는 다른 PC에서도 열립니다. `127.0.0.1` 주소는 해당 PC에서 미리보기 서버가 실행 중일 때만 사용할 수 있습니다. 저장소의 `index.html`은 웹페이지 소스이므로 파일을 더블클릭하기보다 온라인 주소 또는 아래 로컬 서버를 이용하세요.

## 현재 개발 상태 · 2026-10-17

아래는 `main`에 병합하여 공개 웹페이지에서 사용할 수 있는 범위입니다. 지금 보이는 숫자와 이미지는 화면 검증을 위해 만든 가상 자료입니다.

| 완료한 내용 | 연결된 PR |
|---|---|
| Yunze는 화면, Daniel은 자료 처리 담당으로 분리하고 이름·날짜 브랜치 규칙 정리 | [#2](https://github.com/yunzecho-eng/school-design-trends/pull/2) |
| 검색·시도·학교급·기간 필터, 사례 카드/표, 지역·월별 그래프 | [#5](https://github.com/yunzecho-eng/school-design-trends/pull/5) |
| 사무소·건물·설계 주제·사례 상세와 CSV/Markdown 다운로드 화면 | [#7](https://github.com/yunzecho-eng/school-design-trends/pull/7) |
| JSON/CSV 검증·정규화·중복 처리, 날짜별 조회와 고유 사업 집계 | [#6](https://github.com/yunzecho-eng/school-design-trends/pull/6) |
| 공동 당선 사무소, 건물 연령, 주제 근거·분모, 공통 내보내기 모듈 | [#14](https://github.com/yunzecho-eng/school-design-trends/pull/14) |
| 입력·날짜·끊어진 연결의 집계 오류 수정, 잘못된 입력 후 이전 화면 보존 | [#13](https://github.com/yunzecho-eng/school-design-trends/pull/13), [#19](https://github.com/yunzecho-eng/school-design-trends/pull/19) |
| A1/A2 데이터 모듈과 UI 연결, 다지역·미확인 처리, 기사 게시일 필터, GitHub Pages 배포 | [#19](https://github.com/yunzecho-eng/school-design-trends/pull/19) |

기존 개발 이슈 #3·#4·#12와 데이터 수정 #8–#11·#15–#18은 위 병합으로 완료했습니다. `main`의 해당 통합 상태는 **자동 테스트 111개**와 실제 브라우저의 필터·다운로드·상세·키보드·모바일 화면으로 검증했습니다. 구체적인 입력·결과·한계는 [공통 데이터 연결 검증](docs/UI_CONNECTION_VERIFICATION.md)에 남겼습니다.

## 지금 진행 중인 개선

| 작업 | 상태와 확인 위치 |
|---|---|
| 썸네일 클릭으로 내부 상세·이미지 갤러리 열기, 원문 사이트는 별도 새 탭 링크 | [Yunze #20](https://github.com/yunzecho-eng/school-design-trends/issues/20) · [PR #24](https://github.com/yunzecho-eng/school-design-trends/pull/24)에서 구현·검증 완료, 병합 대기 |
| 결과 가까이의 고정 탭에서 그래프·카드·표 전환, 상단 메뉴는 결과 위치로 이동 | [Yunze #21](https://github.com/yunzecho-eng/school-design-trends/issues/21) · 같은 PR에서 구현·검증 완료, 병합 대기 |

작업 브랜치: [`yunze/2026-10-17-case-navigation`](https://github.com/yunzecho-eng/school-design-trends/tree/yunze/2026-10-17-case-navigation). 이 브랜치는 **118개 테스트**와 다중 이미지·초점 복귀·고정 탭·400px 화면 검증을 통과했습니다. 이 두 개선은 아직 위 공개 웹페이지에 반영되지 않았습니다. [브랜치 검증 기록](https://github.com/yunzecho-eng/school-design-trends/blob/yunze/2026-10-17-case-navigation/docs/UI_NAVIGATION_VERIFICATION.md)을 확인할 수 있습니다.

## 앞으로 개발할 내용

아래 항목은 계획이며 아직 제공하지 않습니다.

| 예정 기능 | 구현 전에 확인할 내용 | 추적 |
|---|---|---|
| 한국 지도에서 시도를 선택해 사례·그래프·표 탐색 | 17개 시도 경계·이용 조건, 기존 필터와 동기화, 미확인 지역·다지역 사업, 모바일·키보드 접근 | [Yunze #22](https://github.com/yunzecho-eng/school-design-trends/issues/22) |
| 준공연도별 주요 키워드·대표 건축 이미지·변화 해설 | 사업/건물 단위와 연도 기준, 태그 정의·분모·미분류, 이미지 사용 조건·출처, 표본 편중 | [Yunze #23](https://github.com/yunzecho-eng/school-design-trends/issues/23) |
| 근거와 가정을 갖춘 향후 설계 전망 | 관측·해석·전망 구분, 검토일·대안 시나리오·불확실성. 정량 예측은 자료와 평가 방법 확보 후 검토 | 같은 [#23](https://github.com/yunzecho-eng/school-design-trends/issues/23) |
| 잡지·설계공모·뉴스의 실제 사례 수집과 공개 자료 연결 | 원문·이미지 이용 조건, 공개 가능한 필드, 출처 검토, 지역·학교급별 수집 범위 | [출처 후보](docs/SOURCES.md), [개발 계획](docs/PLAN.md) |
| 40년 이상 학교 건물의 월별 갱신·변화 비교 | 건물별 준공일 근거, 이전 스냅샷과 비교, 갱신 실패·철거·신규 진입 구분 | [갱신 설계](docs/PLAN.md#매월-노후-건물-갱신-설계) |
| 건물 전용 다운로드 화면, 주제 정의 확정, 코드 라이선스·설명영상 | 공통 데이터 규격과 팀 합의. 건물 export 함수는 있으나 현재 화면 다운로드는 설계사업 목록용 | [데이터 규격](docs/DATA_CONTRACT.md), [개발 계획](docs/PLAN.md) |

자동 수집·갱신 예약은 설정하지 않았습니다. 현재 가상 자료로 실제 전국 추세나 미래 설계를 예측하지 않습니다. 키워드 정의와 전망 근거 데이터는 Daniel과 협의하고, Yunze는 탐색·시각화·해설 화면을 맡습니다.

## 로컬에서 실행하기

Node.js 22.12 이상에서 별도 패키지 설치 없이 실행합니다. 검증 환경은 Node.js 24.14.0입니다. A1의 JSON 모듈 import attributes를 고려한 버전 기준입니다([Node.js 문서](https://nodejs.org/api/esm.html#import-attributes)).

```bash
npm start
# http://127.0.0.1:4173/
npm test
```

서버 실행 후 [로컬 미리보기](http://127.0.0.1:4173/)를 엽니다. 검색·시도·학교급·기간·당선일/공모일/기사 게시일 조건, 카드/표, 지역·월별 그래프, 사무소·건물·주제 화면, 사례 상세 및 CSV/Markdown 내보내기를 확인할 수 있습니다. 가상 사업 12건 중 기본 기간과 날짜 기준에 해당하는 11건이 표시되며, 날짜 미상 1건은 제외 안내에 표시합니다. 검증용 JSON을 브라우저 안에서 가져올 수 있습니다. 실제 자료로 바꾸는 기능은 아직 제공하지 않습니다.

화면은 `src/ui/data-provider.js`에서 Daniel의 A1/A2를 호출합니다. 조회와 내보내기는 같은 검색·필터를 사용하고, 여러 시도에 걸친 사업·결측·경고를 표시합니다. 잘못된 입력은 이전 자료와 조회 결과를 유지한 채 안내합니다. 이전 `demo-provider.js`는 초기 UI의 비교 테스트용으로 남겨 두었습니다. [연결 안내](docs/UI_HANDOFF.md), [이번 연결 검증](docs/UI_CONNECTION_VERIFICATION.md), [첫 병합 검토](docs/INTEGRATION_REVIEW.md)를 참고하세요.

```bash
node scripts/check-snapshot.js public/demo.snapshot.json
# 기본 가상 자료: 사업 11건 · 출처 13건 · 학교 11곳
```

`npm test`는 UI·자료 처리·두 모듈 간 대조 테스트를 모두 실행합니다.

## 기능별로 읽는 방법

| 기능 | 표시할 내용 | 기준 |
|---|---|---|
| 최근 3년 조회 | 월별 사례 수와 현재 조회 조건의 설계 주제 분포 | 기준일 직전 36개월, 사용한 날짜 종류 표시; 연도별 해설 화면은 후속 계획 |
| 텍스트·이미지 사례 | 직접 작성한 요약, 원문 링크, 이미지와 설명 | 출처·제작자·이용 조건을 기록; 이미지 사용권 미확인은 원문 링크로 대체 |
| 시도·초중고 집계 | 지역·학교급별 설계사업 수와 자료 수 | 기사 중복을 제거한 사업 수와 기사 수를 구분 |
| 당선 사무소 | 사무소명, 공동 당선, 공개된 사업자등록번호, 확인 근거 | 당선 발표와 계약 낙찰을 구분; 확인하지 못한 번호는 비워 둠 |
| 설계 주제 | 태그별 사업 수·분모·미분류·근거 | 현재는 초안 태그의 가상 분류 예시; 실제 경향 해설과 전망은 후속 계획 |
| 40년 이상 건물 | 학교·건물명, 준공일, 연령 판정, 근거 | 개교일이 아닌 건물별 준공일; 월별 자동 갱신·변화 비교는 후속 계획 |

## 함께하는 사람과 개발 분담

| 담당 | 책임 | 주요 파일 |
|---|---|---|
| B · 윤제 [@yunzecho-eng](https://github.com/yunzecho-eng) | 검색·필터, 텍스트·이미지 사례 카드, 시도 그래프, 사무소·건물 상세, 내보내기 UI | `src/ui/`, `src/styles/`, `public/`, `tests/ui/` |
| A · 협업자 [@daniel898865-alt](https://github.com/daniel898865-alt) | 자료 형식, CSV/JSON 입력, 정제·중복 제거, 시도·학교급 집계, 사무소 정보, 건물 연령 계산 | `src/data/`, `src/domain/`, `rules/`, `scripts/`, `tests/domain/` |
| 공동 | 한 건의 데이터 형식, 지표 정의, 예시·기대 결과, 상대 PR 검토 | `docs/`, `data/examples/`, `index.html` 등 통합 진입점 |

2026-10-17 역할 변경을 반영했습니다. 문서의 A는 자료 처리, B는 화면 개발을 뜻합니다. 공통 파일은 수정 담당을 먼저 정합니다.

초기 개발은 [Yunze 화면 개발 #3](https://github.com/yunzecho-eng/school-design-trends/issues/3), [Daniel 자료 처리 #4](https://github.com/yunzecho-eng/school-design-trends/issues/4)에서 완료했습니다. 현재 개선·후속 계획은 위 #20–#23에서 관리합니다. 기존 공동 이슈 #1은 분리 이력을 남기고 종료했습니다.

공통 모듈 연결 브랜치 `yunze/2026-10-17-ui-data-connection`은 main에 반영됐습니다. 브랜치는 `이름/YYYY-MM-DD-작업내용`으로 쓰고 날짜는 작업 시작일로 유지합니다. 같은 작업을 이어갈 때 매일 새 브랜치를 만들 필요는 없습니다.

위 표는 함께하는 팀원 명단입니다. GitHub의 [Contributors](https://github.com/yunzecho-eng/school-design-trends/graphs/contributors)는 계정과 연결된 실제 작성자 커밋이 기본 브랜치 `main`에 반영되면 자동으로 집계됩니다. 협업자 권한과 기여 통계는 별도이며 수동으로 이름을 지정하는 목록이 아닙니다. [GitHub 안내](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-a-projects-contributors)

## 협업 순서

1. [기획·업무 분담](docs/PLAN.md)과 [데이터 규격](docs/DATA_CONTRACT.md)을 합의합니다.
2. 담당자에게 이슈를 할당하고 이름·날짜가 들어간 작업 브랜치를 만듭니다.
3. 같은 자료와 필터로 화면·집계·내보내기를 검증하고 입력·기대 결과·한계를 기록합니다.
4. PR에서 변경을 검토한 뒤 main에 병합합니다. 에이전트 검증과 팀원의 직접 승인 리뷰는 구분합니다.
5. main 병합 뒤 GitHub Pages 반영을 확인하고 관련 이슈와 README 상태를 갱신합니다.

수업용 첫 판은 **서버와 도구 내부 AI 호출 없이 작동**하도록 설계합니다. AI는 개발을 돕는 도구로 사용합니다. 월별 자동 수집은 출처·필드·접근 조건이 확인된 뒤 별도 단계로 구현합니다. 현재 예약 작업은 설정하지 않았습니다.

## 자료와 협업

- [출처 후보 및 확인 상태](docs/SOURCES.md)
- [개발·리뷰 규칙](CONTRIBUTING.md)
- [공개용 가상 데이터 예시](data/examples/snapshot.demo.json)

뉴스·잡지 원문 전체와 출처 이미지, 개인정보, 인증키는 저장소에 넣지 않습니다. 실제 자료의 이용 조건은 각 출처를 따릅니다. 코드 라이선스는 팀 합의 후 별도로 정합니다.
