import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedProjectImages, primaryProjectSource, officialProjectPreview } from '../../src/ui/project-media.js';

test('official viewer requires matching project, title and linked source; no inferred image license', () => {
  const project = {project_id:'goe-2023-014',title:'고산중학교',source_ids:['goe-yearbook-2023']};
  assert.equal(officialProjectPreview(project)?.viewer_url, 'https://www.goe.go.kr/resource/ebook/h/ebook_76/index.html#page=14');
  assert.deepEqual(allowedProjectImages(project), []);
  assert.equal(officialProjectPreview({...project,title:'다른 고산중학교'}),null);
  assert.equal(officialProjectPreview({...project,source_ids:[]}),null);
  assert.equal(officialProjectPreview({project_id:'unverified'}),null);
});

const media = (url, permission_status = 'licensed', extra = {}) => ({
  url, permission_status, creator: '가상 제작자', alt_text: '설계 설명', source_id: 'source-1', ...extra,
});

test('only the three approved concept paths and permitted HTTPS images are eligible', () => {
  const project = { images: [
    media('public/illustrations/courtyard.svg', 'owned'),
    media('public/illustrations/pavilion.svg', 'licensed'),
    media('public/illustrations/terrace.svg', 'public_domain'),
    media('https://example.org/image.jpg', 'licensed'),
  ] };
  const result = allowedProjectImages(project);
  assert.equal(result.length, 4);
  assert.deepEqual(result.map(item => item.is_concept), [true, true, true, false]);
  assert.equal(result[3].url, 'https://example.org/image.jpg');
  assert.equal(result[3].source_id, 'source-1');
});

test('unknown rights and unsafe or unapproved image addresses are excluded', () => {
  const invalidUrls = [
    'http://example.org/image.jpg', 'javascript:alert(1)', 'data:image/svg+xml,<svg/>',
    'file:///C:/secret.jpg', '//example.org/image.jpg', '/image.jpg',
    'public/illustrations/unapproved.svg', 'public/illustrations/../secret.svg',
    'public/illustrations/courtyard.svg?alternate=1', 'https://user:pass@example.org/image.jpg',
    'https://user@example.org/image.jpg', null, {}, '',
  ];
  const project = { images: [
    ...invalidUrls.map(url => media(url)),
    media('https://example.org/unknown.jpg', 'unknown'),
    media('https://example.org/restricted.jpg', 'restricted'),
    media('public/illustrations/courtyard.svg', 'unknown'),
  ] };
  assert.deepEqual(allowedProjectImages(project), []);
});

test('gallery selection ignores malformed items and deduplicates normalized image URLs', () => {
  const project = { images: [
    null, [], 'image', {},
    media('https://EXAMPLE.org:443/image.jpg', 'owned', { creator: '첫 제작자' }),
    media('https://example.org/image.jpg', 'licensed', { creator: '중복 자료' }),
    media('https://example.org/second.jpg', 'public_domain', { alt_text: null, creator: null }),
  ] };
  const selected = allowedProjectImages(project);
  assert.equal(selected.length, 2);
  assert.equal(selected[0].url, 'https://example.org/image.jpg');
  assert.equal(selected[0].creator, '첫 제작자');
  assert.equal(selected[1].alt_text, '설계 이미지');
  assert.equal(selected[1].creator, null);
  for (const input of [null, undefined, {}, { images: {} }]) assert.deepEqual(allowedProjectImages(input), []);
});

test('primary source respects linked project order and preserves the actual title', () => {
  const project = { source_ids: ['missing', 'unsafe', 'project-source'], images: [media('https://example.org/img.jpg', 'owned', { source_id: 'image-source' })] };
  const snapshot = { sources: [
    { source_id: 'unrelated', title: '무관한 출처', url: 'https://unrelated.example/' },
    { source_id: 'unsafe', title: '차단된 출처', url: 'javascript:alert(1)' },
    { source_id: 'image-source', title: '이미지 출처', url: 'https://example.org/image-source' },
    { source_id: 'project-source', title: '사업의 원래 출처', url: 'https://EXAMPLE.org:443/project' },
  ] };
  assert.deepEqual(primaryProjectSource(project, snapshot), {
    source_id: 'project-source', title: '사업의 원래 출처', url: 'https://example.org/project',
  });
});

test('an actual image-linked source is available even when the image may not be displayed', () => {
  const project = { source_ids: ['without-url'], images: [media('http://example.org/private.jpg', 'restricted', { source_id: 'image-source' })] };
  const snapshot = { sources: [
    { source_id: 'without-url', title: '링크 없는 출처', url: null },
    { source_id: 'image-source', title: null, url: 'http://example.org/original' },
  ] };
  assert.equal(allowedProjectImages(project).length, 0);
  assert.deepEqual(primaryProjectSource(project, snapshot), {
    source_id: 'image-source', title: null, url: 'http://example.org/original',
  });
});

test('never invent an original site from an image URL or unrelated sources', () => {
  const project = { source_ids: ['no-record'], images: [media('https://example.org/image.jpg', 'licensed', { source_id: null })] };
  const snapshot = { sources: [{ source_id: 'unrelated', title: '다른 자료', url: 'https://example.org/unrelated' }] };
  assert.equal(primaryProjectSource(project, snapshot), null);
  for (const sourceUrl of [null, '', '//example.org', 'file:///tmp/a', 'data:text/html,test', 'https://user:pass@example.org/']) {
    assert.equal(primaryProjectSource({ source_ids: ['s'] }, { sources: [{ source_id: 's', title: '원문', url: sourceUrl }] }), null);
  }
  assert.equal(primaryProjectSource(null, null), null);
  assert.equal(primaryProjectSource({ source_ids: 's', images: {} }, { sources: {} }), null);
});

test('selection leaves frozen input and imported labels intact for safe DOM rendering', () => {
  const hostileLabel = '<img src=x onerror=alert(1)>';
  const image = Object.freeze(media('https://example.org/image.jpg', 'owned', { alt_text: hostileLabel }));
  const project = Object.freeze({ source_ids: Object.freeze(['s']), images: Object.freeze([image]) });
  const source = Object.freeze({ source_id: 's', title: hostileLabel, url: 'https://example.org/original' });
  const snapshot = Object.freeze({ sources: Object.freeze([source]) });
  assert.equal(allowedProjectImages(project)[0].alt_text, hostileLabel);
  assert.equal(primaryProjectSource(project, snapshot).title, hostileLabel);
  assert.notEqual(primaryProjectSource(project, snapshot), source);
  assert.notEqual(allowedProjectImages(project)[0], image);
  assert.equal(project.images[0], image);
});
