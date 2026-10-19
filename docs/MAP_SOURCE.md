# 경기도 시·군·구 지도의 출처와 변환

확인일: 2026-10-19 · **경계 기준일: 2026-10-01**

화면의 범위를 경기도로 좁혀 **31개 시·군과 24개 일반구**를 표시한다. 일반구가 있는 수원·성남·안양·부천·안산·고양·용인·화성을 선택하면 해당 시의 구 경계로 확대한다. 시군의 외곽과 일반구 경계는 같은 원자료로 만들었다. 서울·인천을 경기도에 포함하지 않으며 섬을 임의로 이동하지 않는다.

## 출처·기준일·이용 조건

- 원출처: [통계청 통계지리정보서비스(SGIS)](https://sgis.kostat.go.kr)
- 행정구역 변경 반영·가공: [vuski/admdongkor](https://github.com/vuski/admdongkor)
- 고정 커밋: [`3bc00489b76696db864bdbea4b19985cdfa8b403`](https://github.com/vuski/admdongkor/commit/3bc00489b76696db864bdbea4b19985cdfa8b403)
- 입력: [`ver20261001/HangJeongDong_ver20261001.geojson`](https://raw.githubusercontent.com/vuski/admdongkor/3bc00489b76696db864bdbea4b19985cdfa8b403/ver20261001/HangJeongDong_ver20261001.geojson)
- [고정 커밋의 데이터 라이선스](https://github.com/vuski/admdongkor/blob/3bc00489b76696db864bdbea4b19985cdfa8b403/LICENSE-DATA): **CC BY 4.0**, 원출처 SGIS **공공누리 제1유형**의 출처 표시 유지

변환한 자료와 화면에 다음 출처 표시를 유지한다.

> 통계청 SGIS(공공누리 제1유형), 가공 vuski/admdongkor(CC BY 4.0). School Design Trends: 경기도 추출, 시군·일반구 합치기, 공유 경계 정리·단순화·SVG 변환. 경계 기준 2026-10-01.

기관·원저자가 앱을 보증한다는 뜻은 아니다. 경계 자료의 이용 조건은 앱 코드와 학교 사진의 이용 조건을 대신하지 않는다. 이 자료는 원출처를 재가공한 공개 지리 데이터이며 법적 경계·측량 자료로 사용하지 않는다.

2026-02-01 신설된 화성의 만세·효행·병점·동탄 4개 구를 포함한다. [화성시의 개편 안내](https://atc.hscity.go.kr/notice/promote_view.jsp?private_code=cbd43a331bc36361e2314e4f9a26b236eaf568d7855096c0535d37e7140e2fe9), [현재 구청 안내](https://www.hscity.go.kr/dongtan/index.do), [원자료 변경 이력](https://github.com/vuski/admdongkor/blob/3bc00489b76696db864bdbea4b19985cdfa8b403/README.md)을 대조했다. 원자료는 2026-07-01 안양동 이름 변경도 반영한다. 경계 기준일을 작품집 수록연도나 주소의 작성 시점으로 해석하지 않는다.

## 가공과 재현

1. `sido == "41"`인 행정동 **602개**를 추출한다. `sidonm == "경기도"`, `adm_cd2` 앞 5자리와 `sgg` 일치를 검사한다. 통계청 `adm_cd`를 행정안전부 코드로 잘못 사용하지 않는다.
2. Shapely **2.1.2**, GEOS **3.13.1**로 `sgg`별 47개 최하위 구역을 합친다. 일반구가 없는 23개 시군과 일반구 24개다.
3. 공유 경계 전체를 node·polygonize한 뒤 원래 구역에 배정한다. 이번 입력은 **겹침 면 0개**, 정리 전후 대칭차 **0**이다. 구역에 속하지 않는 구멍은 그대로 둔다.
4. `coverage_simplify(tolerance=0.0004)`로 이웃 경계를 함께 단순화한다. 이 값은 알고리즘 허용값이며 최대 위치 오차나 미터 단위가 아니다. 단순화 전후 coverage와 모든 지형의 유효성을 확인했다.
5. 일반구를 부모 시로 합쳐 31개 시군 경계를 만든다. 일반구 24개도 별도 보존하여 총 **55개 feature**를 저장한다. 시군·일반구를 동시에 합산하면 같은 땅을 중복해서 세므로 지도 모드별로 하나의 수준만 표시한다.
6. 시군·구 이름과 코드 목록을 `rules/gyeonggi.json`, 지형을 `public/maps/gyeonggi-regions.geojson`에 기록한다. 라벨 위치는 각 지형 내부의 대표점이며 학교 좌표가 아니다.
7. Node 생성기가 WGS84 경도·위도에 `u = longitude × cos(37.5°)`, `v = −latitude`를 적용하고 단일 배율로 560×650 영역에 맞춘다. SVG에 옮길 때 좌표를 더 삭제하지 않으며 소수 셋째 자리로 반올림한다.

원본 내려받기와 가공은 명시적으로 실행한다. 35MB 내외의 원본과 가공 패키지는 공개 앱에 넣지 않는다. upstream 실행 코드는 실행하지 않는다.

```sh
python tools/build-gyeonggi-source.py /path/to/HangJeongDong_ver20261001.geojson
node tools/build-region-geometry.mjs
node tools/build-region-geometry.mjs --check
```

첫 명령에는 Shapely 2.1.2가 필요하며 원본 SHA-256이 다르면 거부한다. 출력은 Windows에서도 LF 줄바꿈으로 고정하여 Git 저장본과 입력 해시가 일치하도록 한다. 뒤의 두 명령은 저장소 내 GeoJSON만 사용하고 네트워크·외부 패키지 없이 실행된다. 기존 전국 지도의 GeoJSON은 과거 자료로 남아 있으나 현재 화면에서는 불러오지 않는다.

| 검증 대상 | 값 |
|---|---|
| 원본 SHA-256 | `843ece3a0b3429742cd4a1b699cc13987a88b5e5401f382e7fdaaa194ea5e605` |
| 경기 GeoJSON SHA-256 | `81ec70b92c79cc9623ded758d6b9fcd96626709b6aa7e475170dfdbe3597d00e` |
| 생성 모듈 SHA-256 | `c95b2a0b90e12df2862a57a6a07d4daaca24063e7dbd093691df28502edbb48b` |
| 경기 GeoJSON / 생성 모듈 | 684,667 / 293,681 bytes |
| 시군 / 일반구 | 31 / 24 |
| 전체 feature의 polygon / ring / 좌표 수 | 97 / 99 / 17,161 |
| 라벨 위치 | 55개 모두 해당 경계 안 |
| 부모 시의 면적과 일반구 면적 합 | 허용 부동소수 오차 안에서 일치 |
| 원본 → SVG 좌표 삭제 | 0 |
| SVG 반올림 오차 | 각 좌표축 0.000501 viewBox 단위 이하 |

비율은 `preserveAspectRatio="xMidYMid meet"`로 유지한다. 일반구로 확대해도 같은 투영을 사용하고 선택한 시의 경계 전체가 남도록 여백을 둔다. 이 투영은 면적 보존 투영이 아니므로 화면 크기로 면적·거리를 계산하지 않는다.

## 학교 사업의 지역 연결

경계와 사례 수집은 독립된 자료다. `src/domain/gyeonggi.js`는 **`metrics.location` 맨 앞의 정식 시군명과 이어지는 정식 구명**을 연결한다. 공백·경기도 접두부만 정규화하고 학교 제목·동네 이름·지번에서 구를 추정하지 않는다. 경기 코드와 다른 시도 주소가 충돌하면 경기 자료의 ‘시·군 확인 필요’에 남기고 충돌 상태를 기록한다. 다른 시도 코드가 명시된 사업은 경기 집계에서 제외한다.

166건은 모두 시군까지 연결된다. 수원 17건, 성남 8건, 용인 9건 등이며 지역 전체 공모 통계가 아니다. 일반구가 있는 시의 **구 미확인 15건**은 안양 1·부천 2·안산 2·화성 10건이다. 특히 2023~2025 화성 주소를 2026 신설구에 자동으로 역산하지 않는다. 구별 0건을 실제 해당 구의 사업 부재라고 해석하지 않는다. 향후 주소/좌표를 검증해 연결할 때 원주소·근거·매핑 시점을 함께 보존해야 한다.
