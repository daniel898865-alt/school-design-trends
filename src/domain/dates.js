// 날짜 계산. 날짜는 YYYY-MM-DD 문자열로 다루고 시간대 변환을 하지 않는다.

const DATE_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
// 현지 시각, Z 또는 ±HH:MM 오프셋을 지원한다. 초·소수 초는 선택 항목이다.
// 전체 시각을 검증한 뒤 기재된 현지 날짜를 그대로 사용한다.
const DATETIME_RE = /^(\d{4}-\d{2}-\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.\d+)?)?(?:Z|[+-](\d{2}):(\d{2}))?$/;

export function daysInMonth(year, month) {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

export function parseDate(value) {
  if (typeof value !== 'string') return null;
  const m = DATE_RE.exec(value);
  // JS의 $는 마지막 줄바꿈 앞에서도 일치하므로 전체 길이도 확인한다.
  if (!m || m[0].length !== value.length) return null;
  const y = Number(m[1]);
  const mo = Number(m[2]);
  const d = Number(m[3]);
  if (mo < 1 || mo > 12 || d < 1 || d > daysInMonth(y, mo)) return null;
  return { y, m: mo, d };
}

export function isValidDate(value) {
  return parseDate(value) !== null;
}

// 날짜 또는 날짜·시각 문자열에서 YYYY-MM-DD를 꺼낸다. 형식이 틀리면 null.
export function toDateOnly(value) {
  if (typeof value !== 'string') return null;
  if (isValidDate(value)) return value;
  const m = DATETIME_RE.exec(value);
  if (!m || m[0].length !== value.length || !isValidDate(m[1])) return null;
  const hour = Number(m[2]);
  const minute = Number(m[3]);
  const second = Number(m[4] ?? 0);
  const offsetHour = Number(m[5] ?? 0);
  const offsetMinute = Number(m[6] ?? 0);
  if (hour > 23 || minute > 59 || second > 59 || offsetHour > 23 || offsetMinute > 59) return null;
  return m[1];
}

export function formatDate({ y, m, d }) {
  return `${String(y).padStart(4, '0')}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
}

// 달 단위 이동. 이동한 달에 같은 날이 없으면 그 달의 마지막 날로 맞춘다.
export function addMonths(date, n) {
  const p = parseDate(date);
  if (!p) throw new Error(`잘못된 날짜: ${date}`);
  const total = p.y * 12 + (p.m - 1) + n;
  const y = Math.floor(total / 12);
  const m = (total % 12) + 1;
  return formatDate({ y, m, d: Math.min(p.d, daysInMonth(y, m)) });
}

export function addDays(date, n) {
  const p = parseDate(date);
  if (!p) throw new Error(`잘못된 날짜: ${date}`);
  const t = new Date(Date.UTC(p.y, p.m - 1, p.d + n));
  return formatDate({ y: t.getUTCFullYear(), m: t.getUTCMonth() + 1, d: t.getUTCDate() });
}

export function monthKey(date) {
  return date.slice(0, 7);
}

// 최근 N개월 = (asOf - N개월, asOf]. start는 포함하지 않는다.
export function recentWindow(asOf, months) {
  if (!isValidDate(asOf)) throw new Error(`잘못된 기준일: ${asOf}`);
  if (!Number.isInteger(months) || months <= 0) throw new Error(`잘못된 개월 수: ${months}`);
  return { start: addMonths(asOf, -months), end: asOf, startExclusive: true, endInclusive: true };
}

export function inWindow(date, window) {
  return date > window.start && date <= window.end;
}

// 기간에 걸친 달 목록. 기간이 달의 일부만 덮으면 partial: true.
export function windowMonths(window) {
  const first = addDays(window.start, 1);
  const last = window.end;
  const months = [];
  let cursor = `${monthKey(first)}-01`;
  while (monthKey(cursor) <= monthKey(last)) {
    const key = monthKey(cursor);
    const p = parseDate(cursor);
    const monthEnd = formatDate({ y: p.y, m: p.m, d: daysInMonth(p.y, p.m) });
    const from = key === monthKey(first) ? first : cursor;
    const to = key === monthKey(last) ? last : monthEnd;
    months.push({ month: key, from, to, partial: from !== cursor || to !== monthEnd });
    cursor = addMonths(cursor, 1);
  }
  return months;
}
