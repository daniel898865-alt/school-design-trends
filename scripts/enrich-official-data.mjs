import {readFile, writeFile, mkdir, rename} from 'node:fs/promises';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {fetchOfficialFirms, fetchOfficialBuildings, matchOfficialFirms, OFFICIAL_SOURCES} from '../src/integrations/official-data.js';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const value = name => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; };
const sample = args.includes('--sample');
const mode = args[0];
const output = resolve(root, value('--out') ?? `data/private/${mode === 'buildings' ? 'building-candidates' : sample ? 'official-firms.sample' : 'official-firms'}.json`);
const readJson = async path => JSON.parse(await readFile(resolve(root, path), 'utf8'));

try {
  if (!['firms', 'buildings'].includes(mode)) throw new Error('사용법: node --env-file-if-exists=.env scripts/enrich-official-data.mjs firms [--sample] [--snapshot 경로] [--out 경로] | buildings --parcels 경로 [--out 경로]');
  const retrievedAt = new Date().toISOString();
  const result = {schema_version: 'official-enrichment-1', checked_at: retrievedAt,
    services: {
      firms: {status: 'key_required', complete: false, source_url: OFFICIAL_SOURCES.firms.url,
        endpoint: OFFICIAL_SOURCES.firms.endpoint, required_env: 'GG_OPEN_API_KEY',
        message: '공식 사무소 자료를 연결할 인증키가 필요합니다.'},
      buildings: {status: 'key_and_parcel_required', complete: false, source_url: OFFICIAL_SOURCES.buildings.url,
        endpoint: OFFICIAL_SOURCES.buildings.endpoint, required_env: 'DATA_GO_KR_SERVICE_KEY',
        message: '건물별 사용승인일 조회에는 인증키와 확인된 학교 지번이 필요합니다.'},
    }, firm_matches: [], building_candidates: []};
  // 두 수집 작업이 같은 sidecar를 갱신해도 다른 종류의 검토 결과는 보존한다.
  let previous = null;
  try { previous = JSON.parse(await readFile(output, 'utf8')); }
  catch (error) { if (error.code !== 'ENOENT') throw new Error('기존 결과 파일을 읽지 못했습니다. 기존 파일을 확인한 뒤 다시 실행하세요.'); }
  const other = mode === 'firms' ? 'buildings' : 'firms';
  const otherRows = other === 'firms' ? 'firm_matches' : 'building_candidates';
  if (previous?.schema_version === result.schema_version && previous.services?.[other] && Array.isArray(previous[otherRows])) {
    result.services[other] = previous.services[other];
    result[otherRows] = previous[otherRows];
  }
  if (mode === 'firms') {
    const snapshot = await readJson(value('--snapshot') ?? 'data/goe-annual.snapshot.json');
    if (!Array.isArray(snapshot.firms)) throw new Error('Snapshot의 사무소 목록이 없습니다.');
    const data = await fetchOfficialFirms({key: process.env.GG_OPEN_API_KEY, sample});
    result.services.firms = {...result.services.firms, status: sample ? 'sample_only' : 'candidates_ready',
      complete: !sample, checked_at: retrievedAt, source_total: data.total, retrieved_count: data.rows.length,
      sample_count: sample ? data.rows.length : null, source_date: null, review_status: 'candidate_only',
      message: sample ? `공식 API 시험 ${data.rows.length}건 확인 · 전체 조회는 인증키 등록 후 가능합니다.` : '공식 자료의 이름 일치 후보입니다. 동일 사무소 여부를 확인하세요.',
      limitations: ['이름만 비교한 후보입니다. 동일 사무소 확정·당선 근거로 쓰지 않습니다.', '경기도 소재 사무소 자료이며 다른 시도 업체를 포함하지 않습니다.', '사업자번호·홈페이지·신고번호·영업상태는 이 API에서 제공하지 않습니다.']};
    result.firm_matches = matchOfficialFirms(snapshot.firms, data.rows).map(match => sample && match.match_status === 'not_found' ? {...match, match_status: 'not_searched'} : match);
  } else {
    const path = value('--parcels');
    if (!path) throw new Error('확인된 학교별 지번 목록을 --parcels로 지정하세요.');
    const parcels = await readJson(path);
    const records = await fetchOfficialBuildings({key: process.env.DATA_GO_KR_SERVICE_KEY, parcels, retrievedAt});
    result.services.buildings = {...result.services.buildings, status: 'candidates_ready', complete: true,
      checked_at: retrievedAt, review_status: 'candidate_only', queried_parcels: parcels.length, retrieved_count: records.length,
      message: '지번 일치 건물 후보입니다. 학교별 동·현존 여부를 확인하세요.',
      limitations: ['조회한 지번 범위만 수집했습니다. 경기도 전체 학교 건물 목록이 아닙니다.', '사용승인일은 개교일이 아닙니다. 준공일과의 관계를 검토한 뒤 연령 계산에 사용합니다.', '조회 실패·누락을 철거·폐교로 해석하지 않습니다.']};
    result.building_candidates = records;
  }
  // 성공한 결과만 교체한다. 실패 중간 산출물로 이전 공개 자료를 덮어쓰지 않는다.
  await mkdir(dirname(output), {recursive: true});
  const temporary = `${output}.tmp-${process.pid}`;
  await writeFile(temporary, `${JSON.stringify(result, null, 2)}\n`, 'utf8');
  await rename(temporary, output);
  console.log(JSON.stringify({file: output, kind: mode, status: result.services[mode].status, records: result.services[mode].retrieved_count, review_status: 'candidate_only'}));
} catch (error) {
  // URL·응답 원문·환경변수를 출력하지 않는다.
  console.error(error instanceof Error ? error.message : '공식 자료 수집에 실패했습니다.');
  process.exitCode = 1;
}
