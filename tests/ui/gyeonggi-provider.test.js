import test from 'node:test';
import assert from 'node:assert/strict';
import {readFileSync} from 'node:fs';
import {createDataProvider} from '../../src/ui/data-provider.js';
import {GYEONGGI_CITIES} from '../../src/domain/gyeonggi.js';

const data = JSON.parse(readFileSync(new URL('../../data/goe-annual.snapshot.json', import.meta.url), 'utf8'));
test('연결 학교로 확인된 경기 사업과 주소 충돌 사업도 미확인 선택에서 사라지지 않는다', () => {
  const fixture = structuredClone(data);
  fixture.projects = fixture.projects.slice(0,1);
  fixture.schools = [{school_id:'s',name:'학교',region_code:'41',school_level:'middle',source_ids:[]}];
  fixture.projects[0].school_ids = ['s'];
  fixture.projects[0].region_code = null;
  fixture.projects[0].metrics.location = null;
  let provider = createDataProvider(fixture);
  assert.equal(provider.select({region:'41'}).byCity.find(c=>c.code==='unknown').count,1);
  assert.equal(provider.select({region:'41',city:'unknown'}).summary.projects,1);
  fixture.projects[0].metrics.location = '서울특별시 종로구';
  provider = createDataProvider(fixture);
  assert.equal(provider.select({region:'41'}).byCity.find(c=>c.code==='unknown').count,1);
  assert.equal(provider.exportRows({region:'41',city:'unknown'}).rows.length,1);
});
test('경기 시군·구 조회가 카드·집계·내보내기에 동일한 사업을 사용한다', () => {
  const provider = createDataProvider(data);
  const all = provider.select({region:'41'});
  assert.equal(all.summary.projects, 166);
  assert.equal(all.byCity.reduce((sum, r) => sum + r.count, 0), 166);
  assert.equal(all.localitySummary.unknownCityCount, 0);
  for (const city of GYEONGGI_CITIES) {
    for (const district of ['', ...city.districts.map(d => d.code), ...(city.districts.length ? ['unknown'] : [])]) {
      const filters = {region:'41', city:city.code, district};
      const view = provider.select(filters);
      const exported = provider.exportRows(filters);
      assert.deepEqual(view.projects.map(p => p.project_id), exported.rows.map(p => p.project_id));
      assert.equal(view.summary.projects, exported.rows.length);
      assert.equal(exported.metadata.filters.city, city.code);
      assert.equal(exported.metadata.filters.district, district);
      assert.ok(view.projects.every(p => p.locality.cityCode === city.code));
      if (district && district !== 'unknown') assert.ok(view.projects.every(p => p.locality.districtCode === district));
      if (district === 'unknown') assert.ok(view.projects.every(p => p.locality.districtCode === null));
    }
  }
});
test('새 화성 구를 과거 주소에서 추정하지 않고 잘못된 부모-구 조합은 거부한다', () => {
  const provider = createDataProvider(data);
  const hwasung = provider.select({region:'41', city:'41590'});
  assert.equal(hwasung.summary.projects, 10);
  assert.equal(provider.select({region:'41',city:'41590',district:'unknown'}).summary.projects, 10);
  assert.throws(() => provider.select({city:'41110',district:'41131'}));
  assert.throws(() => provider.select({district:'41111'}));
});
test('시군 필터가 수록연도·주제와 함께 적용되고 없는 사례는 0건으로 남는다', () => {
  const provider = createDataProvider(data);
  const filters = {region:'41',city:'41110',year:'2024',topic:'unclassified'};
  const view = provider.select(filters);
  assert.ok(view.projects.length > 0);
  assert.ok(view.projects.every(p => p.award_year === 2024 && p.locality.cityCode === '41110'));
  assert.equal(view.summary.unclassifiedProjects, view.summary.projects);
  assert.deepEqual(provider.select({region:'41',city:'unknown'}).projects, []);
});
