import { Router } from 'express'
import { db, getSetting } from '../db.mjs'
import { dayKey } from '../lib/time.mjs'

const router = Router()

function count(sql, ...params) {
  return db.prepare(sql).get(...params)?.c || 0
}

function streak() {
  const rows = db.prepare('SELECT day FROM study_days WHERE reviews > 0 ORDER BY day DESC LIMIT 400').all()
  if (!rows.length) return 0
  const set = new Set(rows.map((r) => r.day))
  const cursor = new Date()
  if (!set.has(dayKey(cursor))) cursor.setDate(cursor.getDate() - 1)
  let n = 0
  while (set.has(dayKey(cursor))) {
    n += 1
    cursor.setDate(cursor.getDate() - 1)
  }
  return n
}

router.get('/stats/overview', (req, res) => {
  const today = dayKey()
  const day = db.prepare('SELECT * FROM study_days WHERE day = ?').get(today)
  const learned = count('SELECT COUNT(*) c FROM progress WHERE reps > 0')
  const mastered = count("SELECT COUNT(*) c FROM progress WHERE state = 'mastered'")
  const due = count(
    "SELECT COUNT(*) c FROM progress WHERE due_at IS NOT NULL AND due_at <= ? AND state != 'mastered'",
    new Date().toISOString(),
  )
  const correct = count('SELECT COALESCE(SUM(correct),0) c FROM progress')
  const wrong = count('SELECT COALESCE(SUM(wrong),0) c FROM progress')
  const totalDuration = count('SELECT COALESCE(SUM(duration_ms),0) c FROM study_days')
  const totalWords = count('SELECT COUNT(*) c FROM words')
  const dailyNew = getSetting('dailyNew', 20)
  const dailyReview = getSetting('dailyReview', 200)
  res.json({
    totalWords,
    learned,
    mastered,
    due,
    accuracy: correct + wrong ? Math.round((correct / (correct + wrong)) * 100) : 0,
    durationMs: totalDuration,
    streak: streak(),
    today: {
      day: today,
      reviews: day?.reviews || 0,
      newWords: day?.new_words || 0,
      correct: day?.correct || 0,
      durationMs: day?.duration_ms || 0,
    },
    goals: { dailyNew, dailyReview },
  })
})

router.get('/stats/heatmap', (req, res) => {
  const days = Math.min(365, Math.max(30, Number(req.query.days) || 140))
  const rows = db.prepare('SELECT * FROM study_days').all()
  const map = new Map(rows.map((r) => [r.day, r]))
  const out = []
  const cursor = new Date()
  cursor.setDate(cursor.getDate() - (days - 1))
  for (let i = 0; i < days; i += 1) {
    const key = dayKey(cursor)
    const row = map.get(key)
    out.push({
      day: key,
      reviews: row?.reviews || 0,
      newWords: row?.new_words || 0,
      minutes: Math.round((row?.duration_ms || 0) / 60000),
      count: (row?.reviews || 0) + (row?.new_words || 0),
    })
    cursor.setDate(cursor.getDate() + 1)
  }
  res.json({ items: out })
})

router.get('/stats/forecast', (req, res) => {
  const days = Math.min(30, Math.max(3, Number(req.query.days) || 7))
  const rows = db
    .prepare(
      `SELECT CASE WHEN date(due_at, 'localtime') < date('now','localtime')
                   THEN date('now','localtime') ELSE date(due_at, 'localtime') END AS day,
              COUNT(*) c
       FROM progress
       WHERE due_at IS NOT NULL AND state != 'mastered'
         AND date(due_at, 'localtime') <= date('now','localtime', '+' || ? || ' days')
       GROUP BY day`,
    )
    .all(days - 1)
  const map = new Map(rows.map((r) => [r.day, r.c]))
  const out = []
  const cursor = new Date()
  for (let i = 0; i < days; i += 1) {
    const key = dayKey(cursor)
    out.push({ day: key, count: map.get(key) || 0 })
    cursor.setDate(cursor.getDate() + 1)
  }
  res.json({ items: out })
})

router.get('/stats/trend', (req, res) => {
  const days = Math.min(90, Math.max(7, Number(req.query.days) || 30))
  const rows = db.prepare('SELECT * FROM study_days').all()
  const map = new Map(rows.map((r) => [r.day, r]))
  const out = []
  const cursor = new Date()
  cursor.setDate(cursor.getDate() - (days - 1))
  for (let i = 0; i < days; i += 1) {
    const key = dayKey(cursor)
    const row = map.get(key)
    out.push({
      day: key,
      reviews: row?.reviews || 0,
      newWords: row?.new_words || 0,
      minutes: Math.round((row?.duration_ms || 0) / 60000),
    })
    cursor.setDate(cursor.getDate() + 1)
  }
  res.json({ items: out })
})

router.get('/stats/books', (req, res) => {
  const rows = db
    .prepare(
      `SELECT b.id, b.name, b.level, b.kind, b.color,
        COUNT(bw.word_id) AS total,
        COALESCE(SUM(CASE WHEN p.state = 'mastered' THEN 1 ELSE 0 END),0) AS mastered,
        COALESCE(SUM(CASE WHEN p.reps > 0 THEN 1 ELSE 0 END),0) AS learned,
        COALESCE(SUM(CASE WHEN p.due_at IS NOT NULL AND p.due_at <= ? AND p.state != 'mastered' THEN 1 ELSE 0 END),0) AS due
       FROM books b
       LEFT JOIN book_words bw ON bw.book_id = b.id
       LEFT JOIN progress p ON p.word_id = bw.word_id
       GROUP BY b.id ORDER BY b.sort_order`,
    )
    .all(new Date().toISOString())
  res.json({ items: rows })
})

export default router
