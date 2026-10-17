# 함께 개발하기

## 참여

GitHub 초대를 수락한 뒤 저장소를 clone한다. 아래 명령은 앞으로 개발할 때 사용할 예시다.

```bash
git clone https://github.com/yunzecho-eng/school-design-trends.git
cd school-design-trends
git switch main
git pull --ff-only
git switch -c your-name/YYYY-MM-DD-topic
```

브랜치 형식은 `<name>/YYYY-MM-DD-topic`이다. 위 명령의 `your-name`은 작업자 이름, 날짜는 한국시간의 작업 시작일, `topic`은 기능 이름으로 바꾼다. 한 기능을 같은 브랜치에서 이어서 작업하므로 매일 새 브랜치를 만들 필요는 없다. 윤제의 현재 브랜치는 `yunze/2026-10-17-ui`이며, 이미 있는 브랜치로 이동할 때는 `git switch yunze/2026-10-17-ui`를 사용한다. 협업자의 `daniel/2026-10-17-data`는 이름 예시이며 아직 생성하지 않았다.

윤제(`yunzecho-eng`, B)는 검색·필터·카드·그래프·상세·내보내기 UI를, 협업자(`daniel898865-alt`, A)는 입력·정제·중복 제거·집계·사무소 정보·건물 연령 계산을 맡는다. 데이터 형식 합의·계산 확인·상대방 리뷰는 공동 책임이다.

할 일은 작은 이슈로 정의하고 담당 파일과 완료 조건을 먼저 합의한다. 상세 분담은 `docs/PLAN.md`에 있다. 작성자는 변경을 직접 실행해 확인한 뒤 PR을 열고, 상대가 리뷰한다. 이슈의 완료 조건을 전부 충족하는 PR에는 `Fixes #번호`를 적고, 일부 작업만 다루면 `관련 이슈: #번호`로 연결해 이슈를 열어 둔다.

## Contributors 표시

저장소 협업 권한과 Contributors 그래프는 별개다. Contributors에 사람을 수동 지정할 수는 없다. 실제 작업자가 자신의 GitHub 계정에 연결된 작성자 이메일로 커밋하고, 그 변경이 기본 브랜치 `main`에 반영되면 GitHub가 자동 집계한다. 표시만을 위해 다른 사람 명의로 대신 커밋하지 않는다. 팀 소개는 README에서 별도로 확인할 수 있다. 자세한 집계 조건은 [GitHub 공식 안내](https://docs.github.com/en/repositories/viewing-activity-and-data-for-your-repository/viewing-a-projects-contributors)를 따른다.

## PR에서 남길 세 가지

1. 에이전트가 한 일: 수정한 파일과 구현 범위.
2. 사람이 판단한 지점: 자료 포함·제외, 분류·집계 기준, 충돌 해결 이유.
3. 확인한 방법: 입력, 기대 결과, 실제 결과와 아직 확인하지 못한 범위.

검토자는 예시 이외의 입력 하나와 손으로 확인한 집계를 사용한다. 의견은 위치 → 관찰 → 확인 근거 → 제안 순서로 남긴다. 팀원의 확인을 AI 검토로 대신했다고 기록하지 않는다.

## 병합·배포

- 팀원 승인 뒤 병합하고 각자 main을 pull한다. 처음 문서 등록 이외의 기능 작업은 PR로 제안한다.
- 소유자는 팀 저장소, 팀원은 자신의 fork에서 GitHub Pages 배포를 준비한다. 현재 Pages는 설정하지 않았다.
- 수업 실습 중 필요한 fork 동기화와 중간 과제의 개인 개선 기간을 구분한다. 개인 개선 기간에는 수업 마지막 병합을 기준으로 작업하고 Sync fork를 하지 않는다.
- 영상·충돌 해결·배포·외부 팀 PR은 실제 수행 후에만 완료로 기록한다.

## 공개 파일

직접 만든 코드·문서·가상 예시와 사용 조건을 확인한 자료만 올린다. `.env`, API 키, 실제 입력 원본, 잡지 PDF와 이미지 전체, 연락처 등 개인 자료는 제외한다. CSV의 사업자번호는 공개 근거가 있는 업체 정보에 한해 검토 후 사용한다. 비공개 원본을 `.gitignore`에 넣었다고 이미 올라간 이력까지 삭제되는 것은 아니다.
