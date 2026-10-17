# 화면 구현과 자료 모듈 연결

2026-10-17 · 담당: Yunze(화면) / Daniel(자료). A1/A2와 UI 연결을 구현했다. [연결 검증](UI_CONNECTION_VERIFICATION.md)과 [온라인 화면](https://yunzecho-eng.github.io/school-design-trends/)을 참고한다. 초기 병합 당시 남아 있던 문제는 [당시 기록](INTEGRATION_REVIEW.md)에 보존했다.

## 참고 화면

- [서울교육청 설계공모 아카이브](https://edu-design.sen.go.kr/archives): 브라우저에서 연도·지역·건축유형 등의 필터와 검색·정렬 구조를 확인했다. 지역·학교급·기간 필터에 반영했다.
- [경기 EDU PLAN](https://plan.goe.go.kr/index.do): 요청된 `/cmn/index.do`는 로그인 창으로 연결되었으나 창 닫기 후 공개 메인에서 공모 현황과 수상작 이미지·사무소 병기 구성을 확인했다. 사례 카드와 사무소 연결의 참고로 사용했다.
- 두 사이트의 로고, 사진, 기사 또는 실제 사업 데이터를 복제하지 않았다. `public/illustrations/`는 직접 작성한 가상 개념 SVG다.

## 지금 확인할 수 있는 범위

`npm start`로 `http://127.0.0.1:4173/`를 열고 `npm test`로 순수 함수 테스트를 실행한다. 런타임 외부 의존성·API 키·AI 호출은 없다. 개발 서버는 127.0.0.1에만 열리며 프로젝트의 화면 파일만 제공한다.

- 기본 자료: `public/demo.snapshot.json`. 원래의 `data/examples/snapshot.demo.json`도 가져오기 가능하다.
- 조회 기준은 스냅샷의 날짜를 기본값으로 사용하며, 자료 기준일과 사용자가 선택한 조회 기준일을 구분한다.
- 기간은 `(조회 기준일 − N개월, 조회 기준일]`. 양끝의 달은 부분 기간이라 36개월 조회에서 월별 막대는 37개일 수 있다.
- 검색·필터의 동일 결과를 카드, 표, 요약 수치, 그래프에 사용한다. 데이터 없는 달은 0건이며 날짜 미상 제외 건수를 따로 표시한다.
- UI 검증용 파일 가져오기는 1 MB 이하의 규격 v0.1, `is_demo: true`만 지원한다. 실제 자료는 거부하며 외부로 업로드하지 않는다.
- 사무소·건물·설계 주제 화면과 사례 상세를 제공한다. 건물의 연령 확인 상태 선택은 건물 표에만 적용되며 설계사업 내보내기의 분모를 바꾸지 않는다.
- CSV/Markdown은 현재 필터의 설계사업을 내보낸다. 공모일·당선일·선택 기준 날짜, 자료 기준일·조회 기준일·생성 시각, 출처·가상 자료 표시를 보존한다. 아직 건물 목록 자체의 내보내기는 제공하지 않는다.
- CSV는 수식으로 해석될 수 있는 문자열을 보호하고 Markdown은 입력 HTML·링크를 텍스트로 처리한다.

## 공통 모듈과 화면 연결

`src/ui/app.js`는 `createDataProvider`를 사용한다. `src/ui/data-provider.js`가 이슈 #4의 A1/A2 함수를 호출하고 화면에 필요한 필드명을 대응한다. 초기 `demo-provider.js`는 비교 회귀 테스트용이며 앱에서 사용하지 않는다. 새 공급자도 가상 자료 전용이다.

```text
provider.snapshot
provider.options = { regions, schoolLevels, topics }  // 각 [{value, label}]
provider.select(filters) -> 화면 모델
provider.exportRows(filters) -> {columns:[{key,label}], rows:[], metadata:{...}}
```

필터는 `query, region, schoolLevel, months, dateBasis, asOf, topic`이다. 지역·학교급·주제를 A1의 배열형 필터로 대응하고 검색으로 좁힌 동일 Snapshot을 조회와 A2 내보내기에 전달한다. 화면 모델은 `src/ui/data-provider.js`와 `tests/ui/data-provider.test.js`에서 확인한다. 실제 계산은 공통 함수가 담당한다.

A1의 `parseSnapshot`, `filterProjects`, `summarizeProjects`, A2의 `summarizeFirms`, `summarizeBuildings`, `summarizeTopics`, `exportRows`를 연결했다. 건물 판정은 A2 결과를 UI 상태 이름으로 대응한다. 파서 오류는 교체 전에 차단하고 경고는 화면에 표시한다. 날짜 기준은 당선일·공모일·기사 게시일이다. CSV 입력 해석은 A1에 있지만 브라우저 가져오기는 JSON만 지원한다. 실제 업체 식별, 원자료 수집과 월별 갱신은 미완료다.

## 전체 기능 완료 전 남은 통합 확인

- [x] Daniel의 공통 함수와 화면 모델을 연결했다.
- [x] 공유하는 데모 2종에서 A1과 UI의 집계를 96개 조건으로 대조했다.
- [x] A1의 결측·다지역 및 A2 예시를 화면·내보내기에 연결하고 대조했다.
- [ ] 실제 공개 자료의 출처·이미지 권리와 스키마를 검증한다.
- [ ] 상대방이 직접 실행하고 리뷰한다. 사용자 요청에 따른 병합과 별도다.

UI 자동 테스트나 AI 검토는 Daniel의 실제 리뷰를 대체하지 않는다. 이슈 #3·#12의 가상 자료 화면 연결 범위를 검증했고, 실제 데이터 수집과 자동 갱신 완료를 뜻하지 않는다.
