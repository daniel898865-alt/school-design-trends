export function el(tag, attrs = {}, children = []) {
  const node = document.createElement(tag);
  for (const [key, value] of Object.entries(attrs)) {
    if (value === null || value === undefined || value === false) continue;
    if (/^on/i.test(key) || key === 'innerHTML') throw new Error('Unsafe DOM attribute');
    node.setAttribute(key === 'className' ? 'class' : key, value === true ? '' : String(value));
  }
  for (const child of Array.isArray(children) ? children : [children]) {
    if (child !== null && child !== undefined) node.append(child instanceof Node ? child : document.createTextNode(String(child)));
  }
  return node;
}

export function safeUrl(value) {
  if (typeof value !== 'string') return null;
  try { const url = new URL(value); return ['https:', 'http:'].includes(url.protocol) && !url.username && !url.password ? url.href : null; } catch { return null; }
}

export function sourceLinks(sourceIds = [], snapshot) {
  const list = el('div', { class: 'source-links' });
  const verificationLabels = new Map([['demo', '가상'], ['checked', '확인'], ['verified', '확인됨으로 기재'], ['reviewed', '검토 완료'], ['draft', '초안'], ['unknown', '미확인']]);
  for (const id of new Set(sourceIds)) {
    const source = snapshot.sources.find(s => s.source_id === id);
    if (!source) { list.append(el('span', { class: 'muted' }, `출처 ${id} · 연결 정보 미확인`)); continue; }
    const url = safeUrl(source.url);
    const title = source.title || `출처 ${id}`;
    list.append(url ? el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', referrerpolicy: 'no-referrer' }, `${title} ↗`) : el('span', { class: 'muted' }, `${title} · 원문 링크 없음`));
    const verification = verificationLabels.get(source.verification_status) ?? source.verification_status ?? '미확인';
    list.append(el('span', { class: 'muted' }, `${source.publisher || '발행처 미확인'} · 게시일 ${source.published_at || '미확인'} · 확인 상태 ${verification}`));
  }
  if (!list.childElementCount) list.append(el('span', { class: 'muted' }, '연결된 출처가 없습니다.'));
  return list;
}

export function emptyState(title, message) {
  return el('div', { class: 'empty-state' }, [el('span', { 'aria-hidden': 'true' }, '⌕'), el('h3', {}, title), el('p', {}, message)]);
}

export function projectImage(project) {
  const figure = el('figure', { class: 'project-image' });
  const known = ['public/illustrations/courtyard.svg', 'public/illustrations/pavilion.svg', 'public/illustrations/terrace.svg'];
  const candidate = (project.images || []).find(i => ['owned', 'licensed', 'public_domain'].includes(i.permission_status) && (known.includes(i.url) || safeUrl(i.url)?.startsWith('https:')));
  if (candidate) {
    const img = el('img', { src: candidate.url, alt: candidate.alt_text || '설계 이미지', loading: 'lazy', referrerpolicy: 'no-referrer' });
    img.addEventListener('error', () => figure.replaceChildren(el('span', { class: 'image-placeholder' }, '이미지를 불러올 수 없습니다. 원문을 확인하세요.')), { once: true });
    figure.append(img, el('figcaption', {}, known.includes(candidate.url) ? '가상 건축 개념도 · 실제 학교 사진 아님' : `이미지: ${candidate.creator || '제작자 미상'}`));
  } else figure.append(el('span', { class: 'image-placeholder' }, '공개 사용을 확인한 이미지가 없습니다'));
  return figure;
}
