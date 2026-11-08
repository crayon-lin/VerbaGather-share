import { Router } from 'express'
import { z } from 'zod'
import { db, getSetting } from '../db.mjs'
import { scheduleWord } from '../lib/srs.mjs'
import { asInt, bad, notFound, publicWord } from '../lib/http.mjs'
import { dayKey } from '../lib/time.mjs'

const router = Router()

const WORD_COLS = `w.*, COALESCE(p.state,'new') AS state, p.due_at, p.reps, p.lapses,
  p.correct, p.wrong, p.interval_days, p.ease, p.last_reviewed_at, p.mastered_at`

function levelScope() {
  const level = getSetting('level', 'cet4')
  if (level === 'all') return { sql: '1 = 1', params: [] }
  return { sql: "(b.level = ? OR b.level = 'all')", params: [level] }
}

function scopeFor(bookId) {
  if (bookId) return { sql: 'bw.book_id = ?', params: [bookId], joinBook: false }
  const s = levelScope()
  return { sql: s.sql, params: s.params, joinBook: true }
}

function baseFrom(scope) {
  return `FROM words w
    JOIN book_words bw ON bw.word_id = w.id
    ${scope.joinBook ? 'JOIN books b ON b.id = bw.book_id' : ''}
    LEFT JOIN progress p ON p.word_id = w.id`
}

function todayStats() {
  const day = dayKey()
  const row = db.prepare('SELECT * FROM study_days WHERE day = ?').get(day)
  return {
    day,
    reviews: row?.reviews || 0,
    newWords: row?.new_words || 0,
    correct: row?.correct || 0,
    durationMs: row?.duration_ms || 0,
  }
}

function dueCount(scope) {
  const row = db
    .prepare(
      `SELECT COUNT(DISTINCT w.id) c ${baseFrom(scope)}
       WHERE ${scope.sql} AND p.due_at IS NOT NULL AND p.due_at <= ? AND p.state != 'mastered'`,
    )
    .get(...scope.params, new Date().toISOString())
  return row?.c || 0
}

function newRemaining(scope, extra) {
  if (extra) return 9999
  const limit = asInt(getSetting('dailyNew', 20), 20, 0, 200)
  const used = todayStats().newWords
  return Math.max(0, limit - used)
}

function attachDistractors(items) {
  if (!items.length) return []
  const ids = items.map((i) => i.id)
  const placeholders = ids.map(() => '?').join(',')
  const pool = db
    .prepare(
      `SELECT w.id, w.term, w.meaning_cn FROM words w
       WHERE w.id NOT IN (${placeholders}) AND w.meaning_cn != ''
       ORDER BY RANDOM() LIMIT 240`,
    )
    .all(...ids)
  const terms = []
  const meanings = []
  for (const p of pool) {
    const m = String(p.meaning_cn).split('\n')[0].slice(0, 80)
    if (p.term && !terms.includes(p.term) && terms.length < 90) terms.push(p.term)
    if (m && !meanings.includes(m) && meanings.length < 90) meanings.push(m)
  }
  return items.map((item, idx) => {
    const pick = (arr, n) => {
      const out = []
      let cursor = (idx * 7 + 3) % Math.max(1, arr.length)
      while (out.length < n && arr.length) {
        const v = arr[cursor % arr.length]
        if (!out.includes(v)) out.push(v)
        cursor += 1
        if (cursor > arr.length * 4) break
      }
      return out
    }
    return {
      ...item,
      distractors: {
        terms: pick(terms.filter((t) => t.toLowerCase() !== item.term.toLowerCase()), 3),
        meanings: pick(meanings.filter((m) => m !== String(item.meaning_cn).split('\n')[0].slice(0, 80)), 3),
      },
    }
  })
}

router.get('/study/queue', (req, res) => {
  const mode = String(req.query.mode || 'review')
  const bookId = req.query.bookId ? String(req.query.bookId) : ''
  const extra = String(req.query.extra || '') === '1'
  const scope = scopeFor(bookId)
  const limit = asInt(req.query.limit, mode === 'new' ? 20 : 40, 1, 200)
  const from = baseFrom(scope)

  if (mode === 'new') {
    const remaining = newRemaining(scope, extra)
    const take = Math.min(limit, remaining)
    if (take <= 0) {
      return res.json({ items: [], counts: { due: dueCount(scope), newRemaining: 0 }, daily: todayStats() })
    }
    const rows = db
      .prepare(
        `SELECT ${WORD_COLS} ${from}
         WHERE ${scope.sql} AND (p.state IS NULL OR p.state = 'new')
           AND w.id NOT IN (SELECT word_id FROM progress WHERE reps > 0)
         GROUP BY w.id
         ORDER BY w.oxford DESC, w.collins DESC, w.rank ASC, w.term ASC
         LIMIT ?`,
      )
      .all(...scope.params, take)
    return res.json({
      items: attachDistractors(rows.map(publicWord)),
      counts: { due: dueCount(scope), newRemaining: Math.max(0, remaining - rows.length) },
      daily: todayStats(),
    })
  }

  const rows = db
    .prepare(
      `SELECT ${WORD_COLS} ${from}
       WHERE ${scope.sql} AND p.due_at IS NOT NULL AND p.due_at <= ? AND p.state != 'mastered'
       GROUP BY w.id
       ORDER BY p.due_at ASC
       LIMIT ?`,
    )
    .all(...scope.params, new Date().toISOString(), limit)
  res.json({
    items: attachDistractors(rows.map(publicWord)),
    counts: { due: dueCount(scope), newRemaining: newRemaining(scope, false) },
    daily: todayStats(),
  })
})

function ensureNewWordLink(wordId) {
  let bookId = getSetting('defaultBookId', 'b_newwords')
  if (!db.prepare('SELECT 1 FROM books WHERE id = ?').get(bookId)) {
    bookId = 'b_newwords'
  }
  db.prepare(
    'INSERT OR IGNORE INTO book_words (book_id, word_id, added_at, source) VALUES (?, ?, ?, ?)',
  ).run(bookId, wordId, new Date().toISOString(), 'auto')
}

const gradeInput = z.object({
  wordId: z.string(),
  rating: z.number().int().min(0).max(3),
  mode: z.enum(['learn', 'review', 'quiz']).optional().default('learn'),
  durationMs: z.number().int().min(0).max(600000).optional().default(0),
})

router.post('/study/grade', (req, res) => {
  const parsed = gradeInput.safeParse(req.body)
  if (!parsed.success) throw bad('评分参数有误', parsed.error.flatten())
  const { wordId, rating, mode, durationMs } = parsed.data
  const word = db.prepare('SELECT * FROM words WHERE id = ?').get(wordId)
  if (!word) throw notFound('单词不存在')
  const prev = db.prepare('SELECT * FROM progress WHERE word_id = ?').get(wordId)
  const wasNew = !prev || prev.reps === 0 || prev.state === 'new'
  const now = new Date()
  const next = scheduleWord(prev, rating, now)
  const nowIso = now.toISOString()

  db.exec('BEGIN')
  try {
    db.prepare(
      `INSERT INTO progress (word_id, state, ease, interval_days, due_at, reps, lapses, correct, wrong,
         last_rating, last_reviewed_at, mastered_at, first_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON CONFLICT(word_id) DO UPDATE SET
         state = excluded.state, ease = excluded.ease, interval_days = excluded.interval_days,
         due_at = excluded.due_at, reps = excluded.reps, lapses = excluded.lapses,
         correct = excluded.correct, wrong = excluded.wrong, last_rating = excluded.last_rating,
         last_reviewed_at = excluded.last_reviewed_at,
         mastered_at = COALESCE(excluded.mastered_at, progress.mastered_at)`,
    ).run(
      wordId,
      next.state,
      next.ease,
      next.interval_days,
      next.due_at,
      next.reps,
      next.lapses,
      next.correct,
      next.wrong,
      next.last_rating,
      next.last_reviewed_at,
      next.state === 'mastered' ? nowIso : null,
      prev?.first_seen_at || nowIso,
    )
    db.prepare(
      'INSERT INTO review_logs (word_id, rating, mode, duration_ms, reviewed_at) VALUES (?, ?, ?, ?, ?)',
    ).run(wordId, rating, mode, durationMs, nowIso)
    db.prepare(
      `INSERT INTO study_days (day, reviews, new_words, correct, duration_ms)
       VALUES (?, 1, ?, ?, ?)
       ON CONFLICT(day) DO UPDATE SET
         reviews = reviews + 1,
         new_words = new_words + excluded.new_words,
         correct = correct + excluded.correct,
         duration_ms = duration_ms + excluded.duration_ms`,
    ).run(dayKey(now), wasNew ? 1 : 0, rating >= 1 ? 1 : 0, durationMs)
    if (rating <= 1) ensureNewWordLink(wordId)
    if (next.state === 'mastered') {
      db.prepare('DELETE FROM book_words WHERE book_id = ? AND word_id = ?').run('b_newwords', wordId)
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }

  const row = db
    .prepare(
      `SELECT w.*, COALESCE(p.state,'new') AS state, p.due_at, p.reps, p.lapses,
              p.correct, p.wrong, p.interval_days, p.ease, p.last_reviewed_at, p.mastered_at
       FROM words w LEFT JOIN progress p ON p.word_id = w.id WHERE w.id = ?`,
    )
    .get(wordId)
  res.json({ word: publicWord(row), daily: todayStats() })
})

router.post('/study/master', (req, res) => {
  const wordId = String(req.body?.wordId || '')
  const word = db.prepare('SELECT * FROM words WHERE id = ?').get(wordId)
  if (!word) throw notFound('单词不存在')
  const now = new Date().toISOString()
  const prev = db.prepare('SELECT * FROM progress WHERE word_id = ?').get(wordId)
  db.prepare(
    `INSERT INTO progress (word_id, state, ease, interval_days, due_at, reps, lapses, correct, wrong, last_rating, last_reviewed_at, mastered_at, first_seen_at)
     VALUES (?, 'mastered', ?, 60, NULL, ?, ?, ?, ?, 2, ?, ?, ?)
     ON CONFLICT(word_id) DO UPDATE SET state='mastered', interval_days=60, due_at=NULL,
       mastered_at=excluded.mastered_at, reps=MAX(progress.reps, excluded.reps), last_reviewed_at=excluded.last_reviewed_at`,
  ).run(
    wordId,
    prev?.ease || 2.5,
    Math.max(prev?.reps || 0, 3),
    prev?.lapses || 0,
    prev?.correct || 0,
    prev?.wrong || 0,
    now,
    now,
    prev?.first_seen_at || now,
  )
  db.prepare('DELETE FROM book_words WHERE book_id = ? AND word_id = ?').run('b_newwords', wordId)
  res.json({ ok: true })
})

router.post('/study/mistake', (req, res) => {
  const wordId = String(req.body?.wordId || '')
  const word = db.prepare('SELECT * FROM words WHERE id = ?').get(wordId)
  if (!word) throw notFound('单词不存在')
  db.prepare(
    'INSERT OR IGNORE INTO book_words (book_id, word_id, added_at, source) VALUES (?, ?, ?, ?)',
  ).run('b_mistakes', wordId, new Date().toISOString(), 'quiz')
  res.json({ ok: true })
})

router.post('/study/reset', (req, res) => {
  const bookId = req.body?.bookId ? String(req.body.bookId) : ''
  if (!bookId) {
    db.exec('DELETE FROM progress; DELETE FROM review_logs; DELETE FROM study_days;')
    return res.json({ ok: true, scope: 'all' })
  }
  const ids = db.prepare('SELECT word_id FROM book_words WHERE book_id = ?').all(bookId)
  const placeholders = ids.map(() => '?').join(',')
  if (!placeholders) return res.json({ ok: true, scope: 'book' })
  db.prepare(`DELETE FROM progress WHERE word_id IN (${placeholders})`).run(...ids.map((r) => r.word_id))
  db.prepare(`DELETE FROM review_logs WHERE word_id IN (${placeholders})`).run(...ids.map((r) => r.word_id))
  res.json({ ok: true, scope: 'book' })
})

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

router.get('/quiz', (req, res) => {
  const bookId = req.query.bookId ? String(req.query.bookId) : ''
  const count = asInt(req.query.count, 20, 5, 50)
  const types = String(req.query.types || 'en2cn,cn2en,listen,spell')
    .split(',')
    .filter((t) => ['en2cn', 'cn2en', 'listen', 'spell'].includes(t))
  if (!types.length) throw bad('请至少选择一种题型')
  const scope = scopeFor(bookId)
  const from = baseFrom(scope)
  const rows = db
    .prepare(
      `SELECT ${WORD_COLS} ${from}
       WHERE ${scope.sql} AND w.meaning_cn != ''
       GROUP BY w.id
       ORDER BY RANDOM() LIMIT ?`,
    )
    .all(...scope.params, count)
  if (rows.length < 4) throw bad('这个范围内可用的单词太少，无法出题')

  const terms = rows.map((r) => r.term)
  const meanings = rows.map((r) => String(r.meaning_cn).split('\n')[0].slice(0, 80))
  const questions = rows.map((row, i) => {
    const type = types[i % types.length]
    const otherTerms = shuffle(terms.filter((t) => t !== row.term)).slice(0, 3)
    const otherMeanings = shuffle(meanings.filter((m) => m !== meanings[i])).slice(0, 3)
    let prompt = ''
    let answer = ''
    let options = []
    if (type === 'en2cn') {
      prompt = row.term
      answer = meanings[i]
      options = shuffle([answer, ...otherMeanings])
    } else if (type === 'cn2en') {
      prompt = meanings[i]
      answer = row.term
      options = shuffle([answer, ...otherTerms])
    } else if (type === 'listen') {
      prompt = ''
      answer = row.term
      options = shuffle([answer, ...otherTerms])
    } else {
      prompt = meanings[i]
      answer = row.term
    }
    return {
      id: `q_${i}`,
      wordId: row.id,
      type,
      prompt,
      answer,
      options,
      answerIndex: options.indexOf(answer),
      word: {
        id: row.id,
        term: row.term,
        phonetic: row.phonetic,
        meaning_cn: row.meaning_cn,
        example_en: row.example_en,
        example_cn: row.example_cn,
        state: row.state,
      },
    }
  })
  res.json({ questions, bookId: bookId || null })
})

export default router
