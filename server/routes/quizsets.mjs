import { Router } from 'express'
import crypto from 'node:crypto'
import { z } from 'zod'
import { db, getSetting } from '../db.mjs'
import { bad, conflict, notFound } from '../lib/http.mjs'
import { buildLocalQuestions, normalizeTypes, shuffleQuestionOptions } from '../lib/quiz.mjs'
import { aiConfig, generateAiQuestions } from '../lib/ai.mjs'

const router = Router()

const WORD_REF = 'words'
const TOTAL_ID = 'qs_total'

function parseQuestions(row) {
  try {
    const parsed = JSON.parse(row?.questions || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function parseSet(row, withQuestions = true) {
  if (!row) return null
  const out = {
    ...row,
    types: row.types ? String(row.types).split(',').filter(Boolean) : [],
  }
  if (withQuestions) {
    out.questions = parseQuestions(row).map((question) => shuffleQuestionOptions(question))
  } else {
    delete out.questions
  }
  return out
}

function questionKey(question) {
  const term = question?.word?.term || question?.answer || ''
  return [question?.type || '', String(term).toLowerCase(), question?.prompt || ''].join('|')
}

function mergeQuestions(lists) {
  const out = []
  const seen = new Set()
  for (const list of lists) {
    for (const question of list || []) {
      if (!question) continue
      const key = questionKey(question)
      if (seen.has(key)) continue
      seen.add(key)
      out.push(question)
    }
  }
  return out
}

function typesOf(questions, extra = '') {
  const set = new Set(String(extra || '').split(',').filter(Boolean))
  for (const question of questions) {
    if (question?.type) set.add(question.type)
  }
  return [...set]
}

function combineGenerator(...generators) {
  const list = generators.filter(Boolean)
  if (!list.length) return 'local'
  if (list.includes('mixed')) return 'mixed'
  return new Set(list).size > 1 ? 'mixed' : list[0]
}

function generatorOfRows(rows) {
  return combineGenerator(...rows.map((row) => row.generator).filter(Boolean))
}

function updateTotal() {
  const sources = db
    .prepare("SELECT * FROM quiz_sets WHERE source_type != 'all' ORDER BY created_at")
    .all()
  const questions = mergeQuestions(sources.map((row) => parseQuestions(row)))
  const types = typesOf(questions, sources.map((row) => row.types).join(','))
  const generator = generatorOfRows(sources)
  const now = new Date().toISOString()
  let total = db
    .prepare("SELECT * FROM quiz_sets WHERE source_type = 'all' ORDER BY created_at LIMIT 1")
    .get()
  if (!total) {
    db.prepare(
      `INSERT INTO quiz_sets
       (id, title, source_type, source_ref, source_label, level, count, types, generator, signature,
        questions, created_at, updated_at)
       VALUES (?, ?, 'all', 'all', '总题库', 'all', ?, ?, ?, 'total', ?, ?, ?)`,
    ).run(
      TOTAL_ID,
      '总题库',
      questions.length,
      types.join(','),
      generator,
      JSON.stringify(questions),
      now,
      now,
    )
    total = db.prepare('SELECT * FROM quiz_sets WHERE id = ?').get(TOTAL_ID)
  } else {
    db.prepare(
      `UPDATE quiz_sets SET title = '总题库', source_label = '总题库', count = ?, types = ?,
         generator = ?, questions = ?, updated_at = ? WHERE id = ?`,
    ).run(
      questions.length,
      types.join(','),
      generator,
      JSON.stringify(questions),
      now,
      total.id,
    )
    db.prepare("DELETE FROM quiz_sets WHERE source_type = 'all' AND id != ?").run(total.id)
  }
  return db.prepare('SELECT * FROM quiz_sets WHERE id = ?').get(total.id)
}

/**
 * 旧数据中同一本书/同一个词可能有多本做题本。启动时把它们合并，
 * 并重新生成一本汇总全部题目的「总题库」。
 */
export function consolidateQuizNotebooks() {
  const rows = db
    .prepare("SELECT * FROM quiz_sets WHERE source_type != 'all' ORDER BY created_at")
    .all()
  const groups = new Map()
  for (const row of rows) {
    const key =
      row.source_type === 'word' ? 'word' : `${row.source_type}|${row.source_ref || ''}`
    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(row)
  }

  for (const group of groups.values()) {
    const canonical = group[0]
    const questions = mergeQuestions(group.map((row) => parseQuestions(row)))
    const types = typesOf(questions, group.map((row) => row.types).join(','))
    const generator = generatorOfRows(group)
    const latest = [...group].sort((a, b) =>
      String(b.updated_at || '').localeCompare(String(a.updated_at || '')),
    )[0]
    const attempts = group.reduce((sum, row) => sum + (Number(row.attempts) || 0), 0)
    const best = group.reduce(
      (value, row) =>
        row.best_score === null || row.best_score === undefined
          ? value
          : Math.max(value, Number(row.best_score)),
      0,
    )
    const last = latest?.last_score ?? canonical.last_score ?? null
    const created = group.reduce(
      (value, row) => (String(row.created_at || '') < String(value) ? row.created_at : value),
      canonical.created_at,
    )
    const updated = group.reduce(
      (value, row) => (String(row.updated_at || '') > String(value) ? row.updated_at : value),
      canonical.updated_at,
    )
    const isWord = canonical.source_type === 'word'
    const sourceRef = isWord ? WORD_REF : canonical.source_ref
    const sourceLabel = isWord
      ? '单词专项'
      : canonical.source_label || canonical.source_ref || '单词本'
    const title = isWord ? '单词专项 · 做题本' : `${sourceLabel} · 做题本`
    db.prepare(
      `UPDATE quiz_sets SET title = ?, source_ref = ?, source_label = ?, count = ?, types = ?,
         generator = ?, signature = ?, questions = ?, created_at = ?, updated_at = ?,
         attempts = ?, last_score = ?, best_score = ? WHERE id = ?`,
    ).run(
      title,
      sourceRef,
      sourceLabel,
      questions.length,
      types.join(','),
      generator,
      `${canonical.source_type}|${sourceRef}`,
      JSON.stringify(questions),
      created,
      updated,
      attempts,
      last,
      best || null,
      canonical.id,
    )
    for (const row of group.slice(1)) {
      db.prepare('DELETE FROM quiz_sets WHERE id = ?').run(row.id)
    }
  }

  updateTotal()
}

function randomPool(limit = 80) {
  return db
    .prepare("SELECT * FROM words WHERE meaning_cn != '' ORDER BY RANDOM() LIMIT ?")
    .all(limit)
}

function lookupWord(term) {
  const normalized = term.trim()
  if (!normalized) return null
  const word = db.prepare('SELECT * FROM words WHERE term = ? COLLATE NOCASE').get(normalized)
  if (word) return word
  const dict = db.prepare('SELECT * FROM dict WHERE term = ? COLLATE NOCASE').get(normalized)
  if (!dict) return null
  return {
    id: null,
    term: dict.term,
    phonetic: dict.phonetic || '',
    pos: dict.pos || '',
    meaning_cn: dict.translation || '',
    meaning_en: '',
    example_en: '',
    example_cn: '',
    exchange: '',
  }
}

function bookWords(bookId, limit) {
  return db
    .prepare(
      `SELECT w.* FROM words w
       JOIN book_words bw ON bw.word_id = w.id
       WHERE bw.book_id = ? AND w.meaning_cn != ''
       ORDER BY (w.example_en = '') ASC, RANDOM() LIMIT ?`,
    )
    .all(bookId, limit)
}

function levelWords(level, limit) {
  const params = []
  let filter = '1 = 1'
  if (level !== 'all') {
    filter = "(b.level = ? OR b.level = 'all')"
    params.push(level)
  }
  return db
    .prepare(
      `SELECT w.* FROM words w
       JOIN book_words bw ON bw.word_id = w.id
       JOIN books b ON b.id = bw.book_id
       WHERE ${filter} AND w.meaning_cn != ''
       GROUP BY w.id
       ORDER BY (w.example_en = '') ASC, RANDOM() LIMIT ?`,
    )
    .all(...params, limit)
}

function findNotebook(sourceType, sourceRef) {
  return db
    .prepare(
      `SELECT * FROM quiz_sets WHERE source_type = ? AND source_ref = ?
       ORDER BY created_at LIMIT 1`,
    )
    .get(sourceType, sourceRef)
}

function createNotebook(sourceType, sourceRef, sourceLabel, level) {
  const now = new Date().toISOString()
  const id = `qs_${crypto.randomUUID().slice(0, 10)}`
  const title =
    sourceType === 'word' ? '单词专项 · 做题本' : `${sourceLabel} · 做题本`
  db.prepare(
    `INSERT INTO quiz_sets
     (id, title, source_type, source_ref, source_label, level, count, types, generator, signature,
      questions, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, 0, '', 'local', ?, '[]', ?, ?)`,
  ).run(id, title, sourceType, sourceRef, sourceLabel, level, `${sourceType}|${sourceRef}`, now, now)
  return db.prepare('SELECT * FROM quiz_sets WHERE id = ?').get(id)
}

function appendQuestions(row, incoming, batchGenerator) {
  const existing = parseQuestions(row)
  const existingKeys = new Set(existing.map((question) => questionKey(question)))
  const added = []
  const batchKeys = new Set()
  for (const incomingQuestion of incoming) {
    const question = shuffleQuestionOptions(incomingQuestion)
    const key = questionKey(question)
    if (!key || existingKeys.has(key) || batchKeys.has(key)) continue
    batchKeys.add(key)
    added.push(question)
  }
  const questions = [...existing, ...added]
  const types = typesOf(questions, row.types)
  const generator = combineGenerator(row.generator, batchGenerator)
  const now = new Date().toISOString()
  db.prepare(
    `UPDATE quiz_sets SET count = ?, types = ?, generator = ?, questions = ?, updated_at = ?
     WHERE id = ?`,
  ).run(questions.length, types.join(','), generator, JSON.stringify(questions), now, row.id)
  return {
    row: db.prepare('SELECT * FROM quiz_sets WHERE id = ?').get(row.id),
    added,
  }
}

router.get('/quiz-sets', (req, res) => {
  const rows = db
    .prepare(
      `SELECT id, title, source_type, source_ref, source_label, level, count, types, generator,
              created_at, updated_at, attempts, last_score, best_score
       FROM quiz_sets
       ORDER BY CASE WHEN source_type = 'all' THEN 0 ELSE 1 END, updated_at DESC
       LIMIT 100`,
    )
    .all()
  res.json({ items: rows.map((row) => parseSet(row, false)) })
})

router.get('/quiz-sets/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM quiz_sets WHERE id = ?').get(req.params.id)
  if (!row) throw notFound('做题本不存在')
  res.json({ set: parseSet(row) })
})

const generateInput = z.object({
  bookId: z.string().max(80).optional(),
  word: z.string().max(60).optional(),
  count: z.number().int().min(1).max(50).optional().default(5),
  types: z.array(z.string()).optional().default([]),
  difficulty: z.number().int().min(1).max(5).optional().default(3),
  tendencies: z.array(z.enum(['balanced', 'meaning', 'grammar', 'collocation', 'confusion'])).optional().default([]),
})

router.post('/quiz-sets/generate', async (req, res) => {
  const parsed = generateInput.safeParse(req.body)
  if (!parsed.success) throw bad('出题参数有误', parsed.error.flatten())
  const body = parsed.data
  const level = getSetting('level', 'cet4')
  const types = normalizeTypes(body.types)
  const count = body.count
  const difficulty = body.difficulty
  const tendencies = body.tendencies

  let sourceType = 'book'
  let sourceRef = body.bookId || ''
  let sourceLabel = ''

  if (body.word?.trim()) {
    sourceType = 'word'
    sourceRef = WORD_REF
    sourceLabel = '单词专项'
  } else if (!sourceRef) {
    sourceRef = level === 'cet6' ? 'b_cet6' : 'b_cet4'
  }

  let words = []
  if (sourceType === 'word') {
    const word = lookupWord(body.word)
    if (!word) throw notFound(`词典里没有找到「${body.word}」`)
    words = [word]
  } else {
    const book = db.prepare('SELECT * FROM books WHERE id = ?').get(sourceRef)
    if (!book) throw notFound('词书不存在')
    sourceLabel = book.name
    words = bookWords(book.id, Math.max(count, 6))
    if (!words.length) {
      words = levelWords(level, Math.max(count, 6))
    }
  }
  if (!words.length) throw bad('这个范围里没有可出题的单词')

  const pool = randomPool(100)
  const config = aiConfig()
  let questions = []
  let generator = 'local'
  let notice = ''

  if (config.ready) {
    try {
      const aiQuestions = await generateAiQuestions(words, types, count, difficulty, tendencies)
      if (aiQuestions?.length) {
        questions = aiQuestions
        generator = 'ai'
        if (questions.length < count) {
          const fill = buildLocalQuestions(words, types, count - questions.length, pool)
          const keys = new Set(questions.map((q) => `${q.type}|${q.prompt}`))
          questions = [...questions, ...fill.filter((q) => !keys.has(`${q.type}|${q.prompt}`))]
        }
      } else {
        notice = '模型没有返回可用题目，已使用本地题库'
      }
    } catch (err) {
      notice = `AI 调用失败（${String(err.message).slice(0, 80)}），已使用本地题库`
    }
  } else if (config.enabled) {
    notice = 'AI 已开启但缺少 Base URL，已使用本地题库'
  } else {
    notice = '未开启 AI，本次由本地题库生成'
  }

  if (!questions.length) {
    questions = buildLocalQuestions(words, types, count, pool)
    generator = 'local'
  }
  if (!questions.length) throw bad('无法生成题目，请换一本词书或单词')

  let notebook = findNotebook(sourceType, sourceRef)
  if (!notebook) {
    notebook = createNotebook(sourceType, sourceRef, sourceLabel, level)
  }
  const appended = appendQuestions(notebook, questions, generator)
  updateTotal()

  res.status(201).json({
    set: parseSet(appended.row),
    added: appended.added,
    reused: false,
    generator,
    notice,
  })
})

const attemptInput = z.object({
  score: z.number().int().min(0).max(100),
  total: z.number().int().min(1).max(2000).optional(),
})

router.post('/quiz-sets/:id/attempt', (req, res) => {
  const parsed = attemptInput.safeParse(req.body)
  if (!parsed.success) throw bad('成绩参数有误')
  const row = db.prepare('SELECT * FROM quiz_sets WHERE id = ?').get(req.params.id)
  if (!row) throw notFound('做题本不存在')
  const best = Math.max(Number(row.best_score) || 0, parsed.data.score)
  db.prepare(
    `UPDATE quiz_sets SET attempts = attempts + 1, last_score = ?, best_score = ?,
       updated_at = ? WHERE id = ?`,
  ).run(parsed.data.score, best, new Date().toISOString(), row.id)
  res.json({ ok: true, best, attempts: (row.attempts || 0) + 1 })
})

router.delete('/quiz-sets/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM quiz_sets WHERE id = ?').get(req.params.id)
  if (!row) throw notFound('做题本不存在')
  if (row.source_type === 'all') throw conflict('总题库不能删除')
  db.prepare('DELETE FROM quiz_sets WHERE id = ?').run(row.id)
  updateTotal()
  res.json({ ok: true })
})

export default router
