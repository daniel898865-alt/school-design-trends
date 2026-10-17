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
  for (const id of new Set(sourceIds)) {
    const source = snapshot.sources.find(s => s.source_id === id);
    if (!source) continue;
    const url = safeUrl(source.url);
    list.append(url ? el('a', { href: url, target: '_blank', rel: 'noopener noreferrer', referrerpolicy: 'no-referrer' }, `${source.title} ↗`) : el('span', { class: 'muted' }, `${source.title} · 원문 링크 없음`));
  }
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
