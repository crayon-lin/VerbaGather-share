import { Router } from 'express'
import crypto from 'node:crypto'
import { z } from 'zod'
import { db, getSetting } from '../db.mjs'
import { asInt, bad, likeTerm, notFound } from '../lib/http.mjs'
import { dayKey } from '../lib/time.mjs'

const router = Router()

function mapSentence(row) {
  return {
    ...row,
    tags: row.tags ? String(row.tags).split(',').filter(Boolean) : [],
    difficulty: Number(row.difficulty) || 2,
    is_custom: Boolean(row.is_custom),
    favorite: Boolean(row.favorite),
  }
}

const sentenceSchema = z.object({
  text_en: z.string().trim().min(3).max(1000),
  text_cn: z.string().max(1000).optional().default(''),
  category: z.enum(['writing', 'motivational', 'literature', 'exam', 'custom']).optional().default('custom'),
  subcategory: z.string().max(40).optional().default('user'),
  level: z.enum(['cet4', 'cet6', 'all']).optional().default('all'),
  source: z.string().max(120).optional().default('我的句子'),
  author: z.string().max(80).optional().default(''),
  note: z.string().max(600).optional().default(''),
  tags: z.union([z.array(z.string().max(20)), z.string().max(200)]).optional().default([]),
  difficulty: z.number().int().min(1).max(3).optional().default(2),
})

function insertSentence(data) {
  const id = `s_custom_${crypto.randomUUID().slice(0, 10)}`
  db.prepare(
    `INSERT INTO sentences
     (id, text_en, text_cn, category, subcategory, level, source, author, note, tags, difficulty, is_custom)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
  ).run(
    id,
    data.text_en.trim(),
    data.text_cn || '',
    data.category || 'custom',
    data.subcategory || 'user',
    data.level || 'all',
    data.source || '我的句子',
    data.author || '',
    data.note || '',
    Array.isArray(data.tags) ? data.tags.join(',') : data.tags || '',
    data.difficulty || 2,
  )
  return id
}

router.post('/sentences', (req, res) => {
  const parsed = sentenceSchema.safeParse(req.body)
  if (!parsed.success) throw bad('句子信息不完整', parsed.error.flatten())
  const dup = db
    .prepare('SELECT id FROM sentences WHERE lower(text_en) = lower(?)')
    .get(parsed.data.text_en.trim())
  if (dup) return res.json({ id: dup.id, created: false })
  const id = insertSentence(parsed.data)
  res.status(201).json({ id, created: true })
})

router.post('/sentences/import', (req, res) => {
  const body = z.object({ items: z.array(sentenceSchema).min(1).max(300) }).safeParse(req.body)
  if (!body.success) throw bad('导入句子格式有误', body.error.flatten())
  const exists = db.prepare('SELECT id FROM sentences WHERE lower(text_en) = lower(?)')
  let created = 0
  let skipped = 0
  db.exec('BEGIN')
  try {
    for (const item of body.data.items) {
      const text = item.text_en.trim()
      if (!text) {
        skipped += 1
        continue
      }
      if (exists.get(text)) {
        skipped += 1
        continue
      }
      insertSentence(item)
      created += 1
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  res.json({ created, skipped, total: body.data.items.length })
})

router.patch('/sentences/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM sentences WHERE id = ?').get(req.params.id)
  if (!row) throw notFound('句子不存在')
  if (!row.is_custom) throw bad('内置句子不能编辑')
  const parsed = sentenceSchema.partial().safeParse(req.body)
  if (!parsed.success) throw bad('句子信息不完整', parsed.error.flatten())
  const d = parsed.data
  const fields = ['text_en', 'text_cn', 'category', 'subcategory', 'level', 'source', 'author', 'note', 'difficulty']
  const sets = []
  const params = []
  for (const f of fields) {
    if (d[f] !== undefined) {
      sets.push(`${f} = ?`)
      params.push(d[f])
    }
  }
  if (d.tags !== undefined) {
    sets.push('tags = ?')
    params.push(Array.isArray(d.tags) ? d.tags.join(',') : d.tags)
  }
  if (sets.length) {
    params.push(row.id)
    db.prepare(`UPDATE sentences SET ${sets.join(', ')} WHERE id = ?`).run(...params)
  }
  res.json({ ok: true })
})

router.delete('/sentences/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM sentences WHERE id = ?').get(req.params.id)
  if (!row) throw notFound('句子不存在')
  if (!row.is_custom) throw bad('内置句子不能删除')
  db.exec('BEGIN')
  try {
    db.prepare("DELETE FROM favorites WHERE entity_type='sentence' AND entity_id=?").run(row.id)
    db.prepare('DELETE FROM sentences WHERE id = ?').run(row.id)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  res.json({ ok: true })
})

function levelSql(level, column = 'level') {
  if (!level || level === 'all') return { sql: '1 = 1', params: [] }
  return { sql: `(${column} = ? OR ${column} = 'all')`, params: [level] }
}

router.get('/sentences', (req, res) => {
  const category = String(req.query.category || 'all')
  const level = String(req.query.level || getSetting('level', 'cet4'))
  const q = String(req.query.q || '').trim()
  const onlyFav = String(req.query.favorite || '') === '1'
  const lv = levelSql(level)

  const where = [lv.sql]
  const params = [...lv.params]
  if (category !== 'all') {
    where.push('s.category = ?')
    params.push(category)
  }
  if (q) {
    where.push("(s.text_en LIKE ? ESCAPE '\\' OR s.text_cn LIKE ? ESCAPE '\\' OR s.note LIKE ? ESCAPE '\\')")
    params.push(likeTerm(q), likeTerm(q), likeTerm(q))
  }
  if (onlyFav) {
    where.push("EXISTS (SELECT 1 FROM favorites f WHERE f.entity_type='sentence' AND f.entity_id=s.id)")
  }
  const rows = db
    .prepare(
      `SELECT s.*, EXISTS(SELECT 1 FROM favorites f WHERE f.entity_type='sentence' AND f.entity_id=s.id) AS favorite
       FROM sentences s WHERE ${where.join(' AND ')}
       ORDER BY s.category, s.id`,
    )
    .all(...params)

  const counts = db
    .prepare(
      `SELECT category, COUNT(*) c FROM sentences s WHERE ${lv.sql} GROUP BY category`,
    )
    .all(...lv.params)

  res.json({ items: rows.map(mapSentence), counts: Object.fromEntries(counts.map((c) => [c.category, c.c])) })
})

router.get('/sentences/daily', (req, res) => {
  const level = String(req.query.level || getSetting('level', 'cet4'))
  const lv = levelSql(level)
  let rows = db
    .prepare(
      `SELECT * FROM sentences s WHERE ${lv.sql}
       AND s.category IN ('literature', 'motivational') ORDER BY s.id`,
    )
    .all(...lv.params)
  if (!rows.length) {
    rows = db.prepare(`SELECT * FROM sentences s WHERE ${lv.sql} ORDER BY s.id`).all(...lv.params)
  }
  if (!rows.length) return res.json({ sentence: null })
  const key = Number(dayKey().replace(/-/g, ''))
  const row = rows[key % rows.length]
  const favorite = db
    .prepare("SELECT 1 FROM favorites WHERE entity_type='sentence' AND entity_id=?")
    .get(row.id)
  res.json({ sentence: mapSentence({ ...row, favorite: Boolean(favorite) }) })
})

router.get('/essays', (req, res) => {
  const type = String(req.query.type || 'all')
  const level = String(req.query.level || getSetting('level', 'cet4'))
  const lv = levelSql(level)
  const where = [lv.sql]
  const params = [...lv.params]
  if (type !== 'all') {
    where.push('type = ?')
    params.push(type)
  }
  const rows = db
    .prepare(
      `SELECT id, title_en, title_cn, prompt_cn, prompt_en, type, level, word_count, paragraphs, tips, is_custom
       FROM essays WHERE ${where.join(' AND ')} ORDER BY level, id`,
    )
    .all(...params)
  const items = rows.map((r) => {
    let excerpt = ''
    let firstParagraph = ''
    try {
      const ps = JSON.parse(r.paragraphs || '[]')
      firstParagraph = ps[0]?.en || ''
      excerpt = firstParagraph.length > 150 ? `${firstParagraph.slice(0, 150)}…` : firstParagraph
    } catch {
      /* ignore */
    }
    return {
      id: r.id,
      title_en: r.title_en,
      title_cn: r.title_cn,
      prompt_cn: r.prompt_cn,
      prompt_en: r.prompt_en,
      type: r.type,
      level: r.level,
      word_count: r.word_count,
      excerpt,
      firstParagraph,
      tips: JSON.parse(r.tips || '[]'),
      is_custom: Boolean(r.is_custom),
      favorite: Boolean(
        db.prepare("SELECT 1 FROM favorites WHERE entity_type='essay' AND entity_id=?").get(r.id),
      ),
    }
  })
  res.json({ items })
})

const essayParagraphSchema = z.union([
  z.string().min(1).max(4000),
  z.object({
    en: z.string().min(1).max(4000),
    cn: z.string().max(4000).optional().default(''),
    role: z.string().max(40).optional().default(''),
  }),
])

const essayImportSchema = z.object({
  title_en: z.string().trim().min(1).max(200),
  title_cn: z.string().trim().min(1).max(200),
  prompt_cn: z.string().max(2000).optional().default(''),
  prompt_en: z.string().max(2000).optional().default(''),
  type: z.string().max(30).optional().default('argument'),
  level: z.enum(['cet4', 'cet6']).optional().default('cet4'),
  paragraphs: z.array(essayParagraphSchema).min(1).max(30),
  outline: z.array(z.any()).optional().default([]),
  highlights: z.array(z.any()).optional().default([]),
  tips: z.array(z.string().max(500)).optional().default([]),
})

function essayWordCount(paragraphs) {
  return paragraphs.reduce(
    (sum, paragraph) => sum + String(paragraph.en || '').trim().split(/\s+/).filter(Boolean).length,
    0,
  )
}

router.post('/essays/import', (req, res) => {
  const parsed = z.object({ essays: z.array(essayImportSchema).min(1).max(30) }).safeParse(req.body)
  if (!parsed.success) throw bad('作文格式不正确', parsed.error.flatten())
  const insert = db.prepare(
    `INSERT INTO essays
     (id, title_en, title_cn, prompt_cn, prompt_en, type, level, word_count, paragraphs, outline, highlights, tips, is_custom)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
  )
  const created = []
  for (const item of parsed.data.essays) {
    const paragraphs = item.paragraphs
      .map((paragraph) =>
        typeof paragraph === 'string'
          ? { en: paragraph.trim(), cn: '', role: '' }
          : { en: paragraph.en.trim(), cn: paragraph.cn || '', role: paragraph.role || '' },
      )
      .filter((paragraph) => paragraph.en)
    if (!paragraphs.length) continue
    const id = `e_custom_${crypto.randomUUID().slice(0, 10)}`
    insert.run(
      id,
      item.title_en,
      item.title_cn,
      item.prompt_cn,
      item.prompt_en,
      item.type,
      item.level,
      essayWordCount(paragraphs),
      JSON.stringify(paragraphs),
      JSON.stringify(item.outline || []),
      JSON.stringify(item.highlights || []),
      JSON.stringify(item.tips || []),
    )
    created.push(id)
  }
  res.json({ created: created.length, ids: created })
})

router.get('/essays/:id', (req, res) => {
  const r = db.prepare('SELECT * FROM essays WHERE id = ?').get(req.params.id)
  if (!r) throw notFound('作文不存在')
  const parse = (v) => {
    try {
      return JSON.parse(v || '[]')
    } catch {
      return []
    }
  }
  res.json({
    essay: {
      ...r,
      paragraphs: parse(r.paragraphs),
      outline: parse(r.outline),
      highlights: parse(r.highlights),
      tips: parse(r.tips),
      favorite: Boolean(
        db.prepare("SELECT 1 FROM favorites WHERE entity_type='essay' AND entity_id=?").get(r.id),
      ),
    },
  })
})

router.delete('/essays/:id', (req, res) => {
  const row = db.prepare('SELECT is_custom FROM essays WHERE id = ?').get(req.params.id)
  if (!row) throw notFound('作文不存在')
  if (!row.is_custom) throw bad('内置作文不能删除')
  db.prepare("DELETE FROM favorites WHERE entity_type = 'essay' AND entity_id = ?").run(req.params.id)
  db.prepare('DELETE FROM essays WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

router.get('/templates', (req, res) => {
  const type = String(req.query.type || 'all')
  const usage = String(req.query.usage || 'all')
  const where = []
  const params = []
  if (type !== 'all') {
    where.push('type = ?')
    params.push(type)
  }
  if (usage !== 'all') {
    where.push('usage = ?')
    params.push(usage)
  }
  const rows = db
    .prepare(`SELECT * FROM templates ${where.length ? `WHERE ${where.join(' AND ')}` : ''} ORDER BY type, usage, id`)
    .all(...params)
  res.json({
    items: rows.map((r) => ({
      ...r,
      tags: r.tags ? String(r.tags).split(',').filter(Boolean) : [],
    })),
  })
})

router.get('/search', (req, res) => {
  const q = String(req.query.q || '').trim()
  if (q.length < 1) return res.json({ words: [], sentences: [], essays: [], templates: [] })
  const like = likeTerm(q)
  const words = db
    .prepare(
      `SELECT w.id, w.term, w.phonetic, w.meaning_cn, COALESCE(p.state,'new') AS state
       FROM words w LEFT JOIN progress p ON p.word_id = w.id
       WHERE w.term LIKE ? ESCAPE '\\' OR w.meaning_cn LIKE ? ESCAPE '\\'
       ORDER BY CASE WHEN w.term = ? THEN 0 WHEN w.term LIKE ? ESCAPE '\\' THEN 1 ELSE 2 END, w.rank ASC
       LIMIT 6`,
    )
    .all(like, like, q, `${q}%`)
  const sentences = db
    .prepare(
      `SELECT id, text_en, text_cn, category, source FROM sentences
       WHERE text_en LIKE ? ESCAPE '\\' OR text_cn LIKE ? ESCAPE '\\' LIMIT 5`,
    )
    .all(like, like)
  const essays = db
    .prepare(
      `SELECT id, title_en, title_cn, type, level FROM essays
       WHERE title_en LIKE ? ESCAPE '\\' OR title_cn LIKE ? ESCAPE '\\' OR prompt_cn LIKE ? ESCAPE '\\' LIMIT 5`,
    )
    .all(like, like, like)
  const templates = db
    .prepare(
      `SELECT id, text_en, text_cn, type, usage FROM templates
       WHERE text_en LIKE ? ESCAPE '\\' OR text_cn LIKE ? ESCAPE '\\' LIMIT 4`,
    )
    .all(like, like)
  res.json({ words, sentences, essays, templates })
})

const favInput = z.object({
  entityType: z.enum(['word', 'sentence', 'essay']),
  entityId: z.string(),
})

router.post('/favorites/toggle', (req, res) => {
  const parsed = favInput.safeParse(req.body)
  if (!parsed.success) throw bad('收藏参数有误')
  const { entityType, entityId } = parsed.data
  const exists = db
    .prepare('SELECT 1 FROM favorites WHERE entity_type = ? AND entity_id = ?')
    .get(entityType, entityId)
  if (exists) {
    db.prepare('DELETE FROM favorites WHERE entity_type = ? AND entity_id = ?').run(entityType, entityId)
    return res.json({ favorited: false })
  }
  db.prepare('INSERT INTO favorites (entity_type, entity_id, created_at) VALUES (?, ?, ?)').run(
    entityType,
    entityId,
    new Date().toISOString(),
  )
  res.json({ favorited: true })
})

router.get('/favorites', (req, res) => {
  const words = db
    .prepare(
      `SELECT w.*, COALESCE(p.state,'new') AS state, p.due_at, p.reps, p.lapses, p.correct, p.wrong,
              p.interval_days, p.ease, p.last_reviewed_at, p.mastered_at
       FROM favorites f JOIN words w ON w.id = f.entity_id
       LEFT JOIN progress p ON p.word_id = w.id
       WHERE f.entity_type = 'word' ORDER BY f.created_at DESC`,
    )
    .all()
  const sentences = db
    .prepare(
      `SELECT s.*, 1 AS favorite FROM favorites f JOIN sentences s ON s.id = f.entity_id
       WHERE f.entity_type = 'sentence' ORDER BY f.created_at DESC`,
    )
    .all()
  const essays = db
    .prepare(
      `SELECT e.id, e.title_en, e.title_cn, e.type, e.level, e.word_count, 1 AS favorite
       FROM favorites f JOIN essays e ON e.id = f.entity_id
       WHERE f.entity_type = 'essay' ORDER BY f.created_at DESC`,
    )
    .all()
  res.json({
    words: words.map((w) => ({
      ...w,
      tags: w.tags ? String(w.tags).split(',').filter(Boolean) : [],
      levels: w.levels ? String(w.levels).split(',').filter(Boolean) : [],
      is_core: Boolean(w.is_core),
      state: w.state || 'new',
    })),
    sentences: sentences.map(mapSentence),
    essays,
  })
})

export default router
