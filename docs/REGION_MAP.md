# 경기도 시·군·구 탐색

갱신일: 2026-10-19. 전국 수집을 전제로 하던 지도를 현재 자료 범위인 경기도로 좁혔다.

## 화면에서 하는 일

- 처음에는 경기도 31개 시·군을 표시한다. 마우스나 키보드 초점을 올리면 현재 조건의 **수집 사례 수**를 보여 준다.
- 구역·이름을 클릭하거나 Enter·Space를 누르면 공통 필터가 바뀐다. 오른쪽 결과, 사례·표·내보내기가 같은 조건을 사용한다.
- 일반구가 있는 수원·성남·안양·부천·안산·고양·용인·화성은 구 지도로 확대한다. ‘○○시 전체’는 구 조건을 해제하고, ‘← 경기도 전체’는 시군·구 조건을 모두 해제한다.
- 구가 없는 시군에 가상의 구를 만들지 않는다. 자료의 주소에 구가 없으면 ‘구 미확인’에서 볼 수 있다. 시의 전체 건수에는 구 미확인도 포함된다.
- 좁은 화면이나 작은 구역은 ‘시·군 이름으로 선택’ 또는 ‘구 이름으로 선택’의 버튼으로 선택한다.
- 긴 출처·집계 설명은 ‘지도 기준·출처’에 접어 두었다. 선택 정보와 지도에 먼저 집중할 수 있다.

지도는 **2026-10-01 경계**를 사용한다. 31개 시군·24개 일반구의 원출처와 라이선스·변환·검증은 [MAP_SOURCE.md](MAP_SOURCE.md)에 기록했다. 새 경계로 표시한다고 2023~2025 주소를 새 행정구역에 자동 재분류하지 않는다.

## 함수 경계

```js
resolveGyeonggiLocation(project)
// {location, cityCode, cityName, districtCode, districtName,
//  hasDistricts, scope, status}

filterGyeonggiProjects(projects, {city: '', district: ''})
// Gyeonggi records only; preserve array.meta from the common provider.

summarizeGyeonggiProjects(projects, {city: ''})
// {cities, districts, total, unknownCityCount, unknownDistrictCount,
//  excludedOutsideCount, excludedUnknownScopeCount}

renderRegionMap(container, {
  regions, // all city rows, before city/district filtering
  districts, // chosen city's district rows, before district filtering
  selectedRegion: cityCode,
  selectedDistrict: districtCode,
  onSelect: cityCode => {},
  onSelectDistrict: districtCode => {},
})
```

시군과 구 코드는 행정안전부 체계의 5자리 문자열이다. 수원시 `41110`, 장안구 `41111`처럼 부모와 자식이 구분된다. 전체는 빈 문자열, 해당 단계의 미확인은 `unknown`이다. 구를 고를 때 부모 시가 없거나 다른 시의 구를 넘기면 필터는 오류를 낸다. 입력 오류를 전체 조회로 조용히 바꾸지 않는다.

집계행은 `{code,label,count}`이며 고유 사업 식별자로 센다. 지도는 전달받은 값을 표시할 뿐 재집계하지 않는다. 명시적 0은 0건, 누락·잘못된 형식·중복된 집계행은 미제공이다. 시군·구 숫자를 한데 더하지 않는다. 지도 비교에는 검색·학교급·연도·주제 조건을 유지하며 해당 단계 지역 조건만 풀어야 한다.

## 접근성·자료 해석

SVG 구역은 `role=button`, `tabindex=0`, `aria-pressed`와 지역 이름·건수를 갖는다. 툴팁은 `aria-describedby`로 연결하고 Esc로 닫는다. 마우스를 올리는 것만으로 필터가 바뀌지 않는다. 시군 선택으로 구 지도에 진입할 때는 새 시 전체 버튼으로 초점을 옮겨 제거된 요소에 초점이 남지 않게 한다. 선택 변경 안내는 `aria-live=polite`다.

작은 이름 버튼은 최소 44px 이상 누름 영역을 둔다. 초록색은 선택 표시이고 건수에 비례한 단계색이 아니다. 구/시 경계를 늘이거나 섬을 재배치하지 않는다. 법적 경계 판정·면적 측정·학교 위치 확인 기능은 제공하지 않는다.

자동 검증은 `tests/domain/gyeonggi.test.js`, `tests/ui/region-map.test.js`, `tests/ui/region-geometry.test.js`에 있다. 시군·구 부모 관계, 중복 사업, 주소 미확인, 다른 시도 제외, 실제 166건 보존, 구 미확인 보존, 소스 해시, 모든 좌표의 투영, 내부 라벨, 부모·자식 면적, 서울·인천 제외, 확대 비율·팝업 위치를 검사한다. 브라우저 상호작용은 통합 화면에서 별도로 확인한다.
