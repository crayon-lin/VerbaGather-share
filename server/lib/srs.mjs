/**
 * 间隔重复调度：SM-2 的简化变体。
 * rating: 0 = 不认识 / 1 = 模糊 / 2 = 认识 / 3 = 太简单
 * interval_days 支持小数（10 分钟 = 10/1440）。
 */

export const DEFAULT_EASE = 2.5
export const MIN_EASE = 1.3
export const MAX_EASE = 3.0
export const MAX_INTERVAL = 365

export function scheduleWord(prev, rating, now = new Date()) {
  const p = {
    ease: prev?.ease ?? DEFAULT_EASE,
    interval_days: prev?.interval_days ?? 0,
    reps: prev?.reps ?? 0,
    lapses: prev?.lapses ?? 0,
    state: prev?.state ?? 'new',
    correct: prev?.correct ?? 0,
    wrong: prev?.wrong ?? 0,
  }

  let ease = Number(p.ease)
  let interval = Number(p.interval_days) || 0
  let state = p.state || 'new'
  let lapses = Number(p.lapses) || 0
  let correct = Number(p.correct) || 0
  let wrong = Number(p.wrong) || 0
  const reps = (Number(p.reps) || 0) + 1

  if (rating <= 0) {
    interval = 10 / 1440
    ease = Math.max(MIN_EASE, ease - 0.2)
    lapses += 1
    wrong += 1
    state = 'learning'
  } else if (rating === 1) {
    interval = interval < 1 ? 0.5 : Math.min(MAX_INTERVAL, interval * 1.2)
    ease = Math.max(MIN_EASE, ease - 0.05)
    correct += 1
    state = interval >= 1 ? 'review' : 'learning'
  } else if (rating === 2) {
    interval = interval < 1 ? 1 : Math.min(MAX_INTERVAL, interval * ease)
    correct += 1
    state = 'review'
  } else {
    interval = interval < 1 ? 2 : Math.min(MAX_INTERVAL, interval * ease * 1.3)
    ease = Math.min(MAX_EASE, ease + 0.15)
    correct += 1
    state = 'review'
  }

  if (interval >= 60 && reps >= 3) {
    state = 'mastered'
  }

  const dueAt = new Date(now.getTime() + interval * 86400000).toISOString()
  return {
    state,
    ease: Math.round(ease * 100) / 100,
    interval_days: Math.round(interval * 10000) / 10000,
    due_at: dueAt,
    reps,
    lapses,
    correct,
    wrong,
    last_rating: rating,
    last_reviewed_at: now.toISOString(),
  }
}

export function formatInterval(days) {
  if (!days) return '现在'
  if (days < 1 / 24) return `${Math.round(days * 1440)} 分钟`
  if (days < 1) return `${Math.round(days * 24)} 小时`
  if (days < 30) return `${Math.round(days)} 天`
  if (days < 365) return `${Math.round(days / 30)} 个月`
  return `${Math.round(days / 365)} 年`
}
