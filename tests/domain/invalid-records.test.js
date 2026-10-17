import test from 'node:test';
import assert from 'node:assert/strict';
import { parseSnapshot } from '../../src/data/parseSnapshot.js';
import { normalizeRegion } from '../../src/data/normalize.js';
import { filterProjects, summarizeProjects } from '../../src/domain/projects.js';

function snapshot(overrides = {}) {
  return {
    schema_version: '0.1', is_demo: true, as_of: '2026-10-17', generated_at: null,
    schools: [], buildings: [], projects: [], sources: [], firms: [],
    coverage: { scope: '가상 회귀 자료', source_status: 'demo', limitations: [] },
    ...overrides,
  };
}

function project(overrides = {}) {
  return {
    project_id: 'p1', title: '가상 사업', school_ids: [], region_code: '11',
    school_level: 'elementary', project_type: null, competition_date: '2026-02-10',
    award_date: '2026-03-10', completion_date: null, firm_ids: [], source_ids: [],
    summary: null, topic_evidence: [], images: [], ...overrides,
  };
}

test('없는 학교·출처 참조는 경고와 원본에 남기되 실제 건수에 포함하지 않는다', () => {
  const input = snapshot({ projects: [project({ school_ids: ['missing-school'], source_ids: ['missing-source'] })] });
  const { snapshot: parsed, errors, warnings } = parseSnapshot(input);
  assert.deepEqual(errors, []);
  assert.equal(warnings.filter((warning) => warning.code === 'unknown_reference').length, 2);
  assert.deepEqual(parsed.projects[0].school_ids, ['missing-school']);
  assert.deepEqual(parsed.projects[0].source_ids, ['missing-source']);
  const selected = filterProjects(parsed);
  assert.deepEqual(selected[0].window_source_ids, []);
  const summary = summarizeProjects(selected);
  assert.equal(summary.uniqueProjects, 1);
  assert.equal(summary.uniqueSchools, 0);
  assert.equal(summary.uniqueArticles, 0);
  assert.ok(summary.byRegion.every((row) => row.articles === 0));
  assert.ok(summary.bySchoolLevel.every((row) => row.articles === 0));
  assert.ok(summary.byMonth.every((row) => row.articles === 0));
});

test('정상·끊어진 참조가 섞여도 총계·지역·학교급·월별 출처 수의 기준이 같다', () => {
  const input = snapshot({
    schools: [{ school_id: 'school-1', name: '가상 초등학교', official_code: null,
      school_level: 'elementary', region_code: '11', region_name: '서울특별시', address: null, source_ids: [] }],
    sources: [{ source_id: 'source-1', source_type: 'news', title: '가상 기사', publisher: '가상 발행처',
      url: null, published_at: '2026-05-01', retrieved_at: null, rights_note: null, verification_status: 'demo' }],
    projects: [
      project({ school_ids: ['school-1', 'missing-school'], source_ids: ['source-1', 'missing-source'] }),
      project({ project_id: 'p2', school_ids: ['missing-school'], source_ids: ['missing-source'],
        region_code: '41', school_level: 'middle', award_date: '2026-04-10', competition_date: '2026-03-10' }),
    ],
  });
  const { snapshot: parsed, errors } = parseSnapshot(input);
  assert.deepEqual(errors, []);
  for (const dateBasis of ['award_date', 'competition_date']) {
    const summary = summarizeProjects(filterProjects(parsed, { dateBasis }));
    assert.equal(summary.uniqueProjects, 2);
    assert.equal(summary.uniqueSchools, 1);
    assert.equal(summary.uniqueArticles, 1);
    assert.equal(summary.byRegion.find((row) => row.region_code === '11').articles, 1);
    assert.equal(summary.byRegion.find((row) => row.region_code === '41').articles, 0);
    assert.equal(summary.bySchoolLevel.find((row) => row.school_level === 'elementary').articles, 1);
    assert.equal(summary.bySchoolLevel.find((row) => row.school_level === 'middle').articles, 0);
    assert.equal(summary.byMonth.reduce((total, row) => total + row.articles, 0), 1);
  }
  const articles = summarizeProjects(filterProjects(parsed, { dateBasis: 'published_at' }));
  assert.equal(articles.uniqueProjects, 1);
  assert.equal(articles.uniqueSchools, 1);
  assert.equal(articles.uniqueArticles, 1);
  assert.equal(articles.excludedUnknownDates, 1);
  assert.equal(articles.byMonth.find((row) => row.month === '2026-05').articles, 1);
  assert.equal(articles.byMonth.reduce((total, row) => total + row.articles, 0), 1);
});

test('객체·배열·불리언 등 지역코드 타입 오류는 형변환 없이 미확인과 경고로 반환한다', () => {
  for (const regionCode of [{ toString: null }, {}, ['11'], true, 11.5]) {
    const normalized = normalizeRegion(regionCode, '서울특별시');
    assert.equal(normalized.code, null);
    assert.equal(normalized.name, null);
    assert.match(normalized.note, /형식/);
    const input = snapshot({ projects: [project({ region_code: regionCode })] });
    const result = parseSnapshot(JSON.stringify(input));
    assert.deepEqual(result.errors, []);
    assert.equal(result.snapshot.projects[0].region_code, null);
    assert.deepEqual(result.snapshot.projects[0]._raw.region_code, regionCode);
    assert.ok(result.warnings.some((warning) => warning.path === 'projects[0].region_code' && /형식/.test(warning.message)));
  }
});
