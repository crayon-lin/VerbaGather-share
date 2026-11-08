import path from 'node:path'
import { fileURLToPath } from 'node:url'

export const ROOT = path.resolve(fileURLToPath(new URL('../..', import.meta.url)))
export const SEED_DIR = path.join(ROOT, 'server', 'seed')
export const CONTENT_DIR = path.join(SEED_DIR, 'content')

export function dayKey(date = new Date()) {
  const y = date.getFullYear()
  const m = String(date.getMonth() + 1).padStart(2, '0')
  const d = String(date.getDate()).padStart(2, '0')
  return `${y}-${m}-${d}`
}

export function nowIso() {
  return new Date().toISOString()
}

export function addDaysIso(base, days) {
  return new Date(new Date(base).getTime() + days * 86400000).toISOString()
}
