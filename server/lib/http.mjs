export class HttpError extends Error {
  constructor(status, message, details) {
    super(message)
    this.status = status
    this.details = details
  }
}

export function bad(message = '请求参数有误', details) {
  return new HttpError(400, message, details)
}

export function notFound(message = '未找到') {
  return new HttpError(404, message)
}

export function conflict(message = '数据冲突') {
  return new HttpError(409, message)
}

export function normalizeTerm(term) {
  return String(term || '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
}

export function likeTerm(q) {
  return `%${String(q).replace(/[\\%_]/g, '\\$&')}%`
}

export function asInt(value, fallback, min, max) {
  const n = Number.parseInt(String(value ?? ''), 10)
  if (!Number.isFinite(n)) return fallback
  return Math.min(max ?? Number.MAX_SAFE_INTEGER, Math.max(min ?? Number.MIN_SAFE_INTEGER, n))
}

export function publicWord(row) {
  if (!row) return null
  return {
    ...row,
    tags: row.tags ? String(row.tags).split(',').filter(Boolean) : [],
    levels: row.levels ? String(row.levels).split(',').filter(Boolean) : [],
    is_core: Boolean(row.is_core),
    favorite: Boolean(row.favorite),
    state: row.state || 'new',
    reps: row.reps ?? 0,
    lapses: row.lapses ?? 0,
    correct: row.correct ?? 0,
    wrong: row.wrong ?? 0,
    ease: row.ease ?? 2.5,
    interval_days: row.interval_days ?? 0,
  }
}

export function jsonArray(value) {
  if (!value) return []
  if (Array.isArray(value)) return value
  try {
    const parsed = JSON.parse(value)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}
