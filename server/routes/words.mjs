import { Router } from 'express'
import crypto from 'node:crypto'
import { z } from 'zod'
import { db, getSetting } from '../db.mjs'
import { asInt, bad, conflict, likeTerm, normalizeTerm, notFound, publicWord } from '../lib/http.mjs'

const router = Router()

const WORD_SELECT = `
  SELECT w.*, COALESCE(p.state, 'new') AS state, p.due_at, p.reps, p.lapses,
         p.correct, p.wrong, p.interval_days, p.ease, p.last_reviewed_at, p.mastered_at,
         EXISTS(SELECT 1 FROM favorites f WHERE f.entity_type='word' AND f.entity_id=w.id) AS favorite
  FROM words w
  LEFT JOIN progress p ON p.word_id = w.id
`

function findBook(bookId) {
  return db.prepare('SELECT * FROM books WHERE id = ?').get(bookId)
}

function wordStats(bookId) {
  return db
    .prepare(
      `SELECT COUNT(*) AS total,
        COALESCE(SUM(CASE WHEN bw.word_id IS NULL THEN 0 WHEN p.state IS NULL OR p.state='new' THEN 1 ELSE 0 END),0) AS new_count,
        COALESCE(SUM(CASE WHEN p.state='learning' THEN 1 ELSE 0 END),0) AS learning_count,
        COALESCE(SUM(CASE WHEN p.state='review' THEN 1 ELSE 0 END),0) AS review_count,
        COALESCE(SUM(CASE WHEN p.state='mastered' THEN 1 ELSE 0 END),0) AS mastered_count
       FROM book_words bw LEFT JOIN progress p ON p.word_id = bw.word_id
       WHERE bw.book_id = ?`,
    )
    .get(bookId)
}

router.get('/books/:id/words', (req, res) => {
  const book = findBook(req.params.id)
  if (!book) throw notFound('词书不存在')
  const q = String(req.query.q || '').trim()
  const state = String(req.query.state || 'all')
  const sort = String(req.query.sort || 'rank')
  const page = asInt(req.query.page, 1, 1, 100000)
  const pageSize = asInt(req.query.pageSize, 50, 10, 200)

  const where = ['bw.book_id = ?']
  const params = [book.id]
  if (q) {
    where.push("(w.term LIKE ? ESCAPE '\\' OR w.meaning_cn LIKE ? ESCAPE '\\')")
    params.push(likeTerm(q), likeTerm(q))
  }
  if (state === 'new') {
    where.push("(p.state IS NULL OR p.state = 'new')")
  } else if (state === 'due') {
    where.push("p.due_at IS NOT NULL AND p.due_at <= ? AND p.state != 'mastered'")
    params.push(new Date().toISOString())
  } else if (['learning', 'review', 'mastered'].includes(state)) {
    where.push('p.state = ?')
    params.push(state)
  }

  const sortSql =
    sort === 'alpha'
      ? 'w.term COLLATE NOCASE ASC'
      : sort === 'due'
        ? 'COALESCE(p.due_at, \'9999\') ASC'
        : sort === 'newest'
          ? 'bw.added_at DESC'
          : 'w.oxford DESC, w.collins DESC, w.rank ASC, w.term ASC'

  const base = `FROM book_words bw JOIN words w ON w.id = bw.word_id LEFT JOIN progress p ON p.word_id = w.id WHERE ${where.join(' AND ')}`
  const total = db.prepare(`SELECT COUNT(*) c ${base}`).get(...params).c
  const rows = db
    .prepare(
      `SELECT w.*, COALESCE(p.state,'new') AS state, p.due_at, p.reps, p.lapses,
              p.correct, p.wrong, p.interval_days, p.ease, p.last_reviewed_at, p.mastered_at,
              EXISTS(SELECT 1 FROM favorites f WHERE f.entity_type='word' AND f.entity_id=w.id) AS favorite
       ${base} ORDER BY ${sortSql} LIMIT ? OFFSET ?`,
    )
    .all(...params, pageSize, (page - 1) * pageSize)

  res.json({
    book,
    items: rows.map(publicWord),
    total,
    page,
    pageSize,
    stats: wordStats(book.id),
  })
})

router.get('/words/:id', (req, res) => {
  const row = db.prepare(`${WORD_SELECT} WHERE w.id = ?`).get(req.params.id)
  if (!row) throw notFound('单词不存在')
  const books = db
    .prepare('SELECT b.id, b.name, b.kind FROM book_words bw JOIN books b ON b.id = bw.book_id WHERE bw.word_id = ?')
    .all(row.id)
  res.json({ word: publicWord(row), books })
})

const wordInput = z.object({
  term: z.string().trim().min(1).max(60),
  phonetic: z.string().max(120).optional(),
  pos: z.string().max(60).optional(),
  meaning_cn: z.string().max(800).optional(),
  meaning_en: z.string().max(1200).optional(),
  example_en: z.string().max(600).optional(),
  example_cn: z.string().max(600).optional(),
  bookId: z.string().optional(),
})

router.post('/words', (req, res) => {
  const parsed = wordInput.safeParse(req.body)
  if (!parsed.success) throw bad('单词信息不完整', parsed.error.flatten())
  const input = parsed.data
  const term = normalizeTerm(input.term)
  if (!term) throw bad('请输入单词')
  let bookId = input.bookId || getSetting('defaultBookId', 'b_newwords')
  if (!findBook(bookId)) bookId = 'b_newwords'
  if (!findBook(bookId)) throw notFound('目标词书不存在')

  const existing = db.prepare('SELECT * FROM words WHERE term = ? COLLATE NOCASE').get(term)
  const dict = db.prepare('SELECT * FROM dict WHERE term = ? COLLATE NOCASE').get(term)
  const now = new Date().toISOString()

  if (existing) {
    const linked = db
      .prepare('SELECT 1 FROM book_words WHERE book_id = ? AND word_id = ?')
      .get(bookId, existing.id)
    if (!linked) {
      db.prepare('INSERT INTO book_words (book_id, word_id, added_at, source) VALUES (?, ?, ?, ?)').run(
        bookId,
        existing.id,
        now,
        'manual',
      )
    }
    db.prepare(
      `UPDATE words SET phonetic = COALESCE(NULLIF(phonetic,''), ?),
        meaning_cn = COALESCE(NULLIF(meaning_cn,''), ?) WHERE id = ?`,
    ).run(input.phonetic || dict?.phonetic || '', input.meaning_cn || dict?.translation || '', existing.id)
    const row = db.prepare(`${WORD_SELECT} WHERE w.id = ?`).get(existing.id)
    return res.json({ word: publicWord(row), created: false, linked: !linked })
  }

  const id = `w_${crypto.randomUUID().slice(0, 12)}`
  db.prepare(
    `INSERT INTO words (id, term, phonetic, pos, meaning_cn, meaning_en, example_en, example_cn, exchange, tags, levels, rank, collins, oxford, is_core, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', '', '', 200000, 0, 0, 0, 'custom', ?)`,
  ).run(
    id,
    term,
    input.phonetic || dict?.phonetic || '',
    input.pos || dict?.pos || '',
    input.meaning_cn || dict?.translation || '',
    input.meaning_en || '',
    input.example_en || '',
    input.example_cn || '',
    now,
  )
  db.prepare('INSERT INTO book_words (book_id, word_id, added_at, source) VALUES (?, ?, ?, ?)').run(
    bookId,
    id,
    now,
    'manual',
  )
  const row = db.prepare(`${WORD_SELECT} WHERE w.id = ?`).get(id)
  res.status(201).json({ word: publicWord(row), created: true })
})

const patchInput = wordInput.omit({ bookId: true }).partial()

router.patch('/words/:id', (req, res) => {
  const word = db.prepare('SELECT * FROM words WHERE id = ?').get(req.params.id)
  if (!word) throw notFound('单词不存在')
  const parsed = patchInput.safeParse(req.body)
  if (!parsed.success) throw bad('单词信息不完整', parsed.error.flatten())
  const d = parsed.data
  if (d.term) {
    const term = normalizeTerm(d.term)
    if (!term) throw bad('单词不能为空')
    const clash = db.prepare('SELECT id FROM words WHERE term = ? COLLATE NOCASE AND id != ?').get(term, word.id)
    if (clash) throw conflict('已存在同名单词')
    d.term = term
  }
  const fields = ['term', 'phonetic', 'pos', 'meaning_cn', 'meaning_en', 'example_en', 'example_cn']
  const sets = []
  const params = []
  for (const f of fields) {
    if (d[f] !== undefined) {
      sets.push(`${f} = ?`)
      params.push(d[f])
    }
  }
  if (sets.length) {
    params.push(word.id)
    db.prepare(`UPDATE words SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  }
  const row = db.prepare(`${WORD_SELECT} WHERE w.id = ?`).get(word.id)
  res.json({ word: publicWord(row) })
})

router.delete('/words/:id', (req, res) => {
  const word = db.prepare('SELECT * FROM words WHERE id = ?').get(req.params.id)
  if (!word) throw notFound('单词不存在')
  const bookId = String(req.query.bookId || '')
  if (bookId) {
    db.prepare('DELETE FROM book_words WHERE book_id = ? AND word_id = ?').run(bookId, word.id)
    const left = db.prepare('SELECT COUNT(*) c FROM book_words WHERE word_id = ?').get(word.id).c
    if (left === 0) db.prepare('DELETE FROM words WHERE id = ?').run(word.id)
  } else {
    db.prepare('DELETE FROM words WHERE id = ?').run(word.id)
  }
  res.json({ ok: true })
})

const bulkInput = z.object({
  bookId: z.string(),
  words: z
    .array(
      z.object({
        term: z.string(),
        phonetic: z.string().optional().default(''),
        pos: z.string().optional().default(''),
        meaning_cn: z.string().optional().default(''),
        meaning_en: z.string().optional().default(''),
        example_en: z.string().optional().default(''),
        example_cn: z.string().optional().default(''),
      }),
    )
    .max(2000),
})

router.post('/books/:id/words/bulk', (req, res) => {
  const book = findBook(req.params.id)
  if (!book) throw notFound('词书不存在')
  const parsed = bulkInput.safeParse({ ...req.body, bookId: book.id })
  if (!parsed.success) throw bad('导入数据格式有误', parsed.error.flatten())
  const now = new Date().toISOString()
  const find = db.prepare('SELECT id FROM words WHERE term = ? COLLATE NOCASE')
  const insert = db.prepare(
    `INSERT INTO words (id, term, phonetic, pos, meaning_cn, meaning_en, example_en, example_cn, exchange, tags, levels, rank, collins, oxford, is_core, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, '', '', '', 200000, 0, 0, 0, 'import', ?)`,
  )
  const link = db.prepare('INSERT OR IGNORE INTO book_words (book_id, word_id, added_at, source) VALUES (?, ?, ?, ?)')
  let created = 0
  let linked = 0
  let skipped = 0
  const seen = new Set()
  db.exec('BEGIN')
  try {
    for (const raw of parsed.data.words) {
      const term = normalizeTerm(raw.term)
      if (!term || term.length > 60 || seen.has(term.toLowerCase())) {
        skipped += 1
        continue
      }
      seen.add(term.toLowerCase())
      const existing = find.get(term)
      if (existing) {
        const before = db.prepare('SELECT COUNT(*) c FROM book_words WHERE word_id = ?').get(existing.id).c
        link.run(book.id, existing.id, now, 'import')
        const after = db.prepare('SELECT COUNT(*) c FROM book_words WHERE word_id = ?').get(existing.id).c
        if (after > before) linked += 1
        else skipped += 1
        continue
      }
      const id = `w_${crypto.randomUUID().slice(0, 12)}`
      insert.run(
        id,
        term,
        raw.phonetic || '',
        raw.pos || '',
        raw.meaning_cn || '',
        raw.meaning_en || '',
        raw.example_en || '',
        raw.example_cn || '',
        now,
      )
      link.run(book.id, id, now, 'import')
      created += 1
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  res.json({ created, linked, skipped, total: parsed.data.words.length, stats: wordStats(book.id) })
})

const dictBatchInput = z.object({
  terms: z.array(z.string()).max(2000),
  bookId: z.string().optional(),
})

router.post('/dict/batch', (req, res) => {
  const parsed = dictBatchInput.safeParse(req.body)
  if (!parsed.success) throw bad('查词参数有误')
  const { terms, bookId } = parsed.data
  const dictStmt = db.prepare('SELECT * FROM dict WHERE term = ? COLLATE NOCASE')
  const wordStmt = db.prepare('SELECT * FROM words WHERE term = ? COLLATE NOCASE')
  const linkStmt = db.prepare('SELECT 1 FROM book_words WHERE book_id = ? AND word_id = ?')
  const items = terms.map((raw) => {
    const term = normalizeTerm(raw)
    const dict = dictStmt.get(term)
    const word = dict ? null : wordStmt.get(term)
    const meaning = dict?.translation || word?.meaning_cn || ''
    return {
      term,
      found: Boolean(dict || word),
      phonetic: dict?.phonetic || word?.phonetic || '',
      pos: dict?.pos || word?.pos || '',
      meaning_cn: meaning,
      wordId: word?.id || null,
      existsInBook: wordIdExists(),
    }
    function wordIdExists() {
      if (!bookId) return false
      const id = dict ? wordStmt.get(term)?.id : word?.id
      return id ? Boolean(linkStmt.get(bookId, id)) : false
    }
  })
  res.json({ items })
})

function lemmaCandidates(term) {
  const t = term.toLowerCase()
  const out = []
  const add = (x) => {
    if (x && x.length > 2 && x !== t && !out.includes(x)) out.push(x)
  }
  if (t.endsWith('ies')) add(`${t.slice(0, -3)}y`)
  if (t.endsWith('ied')) add(`${t.slice(0, -3)}y`)
  if (t.endsWith('es')) add(t.slice(0, -2))
  if (t.endsWith('s')) add(t.slice(0, -1))
  if (t.endsWith('ed')) {
    add(t.slice(0, -2))
    add(t.slice(0, -1))
    if (/(.)\1ed$/.test(t)) add(t.replace(/(.)\1ed$/, '$1'))
  }
  if (t.endsWith('ing')) {
    add(t.slice(0, -3))
    add(`${t.slice(0, -3)}e`)
    if (/(.)\1ing$/.test(t)) add(t.replace(/(.)\1ing$/, '$1'))
  }
  if (t.endsWith('ly')) add(t.slice(0, -2))
  return out
}

router.get('/dict/:term', (req, res) => {
  const raw = normalizeTerm(decodeURIComponent(req.params.term)).replace(
    /^[^A-Za-z]+|[^A-Za-z'-]+$/g,
    '',
  )
  if (!raw) throw bad('请输入英文单词')
  const dictStmt = db.prepare('SELECT * FROM dict WHERE term = ? COLLATE NOCASE')
  const wordStmt = db.prepare('SELECT * FROM words WHERE term = ? COLLATE NOCASE')
  let dict = null
  let word = null
  let matched = raw
  for (const candidate of [raw, ...lemmaCandidates(raw)]) {
    dict = dictStmt.get(candidate)
    word = wordStmt.get(candidate)
    if (dict || word) {
      matched = dict?.term || word?.term || candidate
      break
    }
  }
  const linked = word
    ? db.prepare("SELECT 1 FROM book_words WHERE book_id = 'b_newwords' AND word_id = ?").get(word.id)
    : null
  if (!dict && !word) {
    const suggestions = db
      .prepare("SELECT term FROM dict WHERE term LIKE ? ESCAPE '\\' ORDER BY rank ASC LIMIT 6")
      .all(`${raw.toLowerCase()}%`)
    return res.json({ found: false, term: raw, suggestions: suggestions.map((s) => s.term) })
  }
  res.json({
    found: true,
    term: matched,
    query: raw,
    lemma: matched.toLowerCase() !== raw.toLowerCase(),
    phonetic: dict?.phonetic || word?.phonetic || '',
    translation: dict?.translation || word?.meaning_cn || '',
    pos: dict?.pos || word?.pos || '',
    wordId: word?.id || null,
    inWordBook: Boolean(linked),
  })
})

export default router
