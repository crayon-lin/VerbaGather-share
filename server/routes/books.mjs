import { Router } from 'express'
import crypto from 'node:crypto'
import { z } from 'zod'
import { db, getSetting, setSetting } from '../db.mjs'
import { bad, conflict, notFound } from '../lib/http.mjs'

const router = Router()

const bookSchema = z.object({
  name: z.string().trim().min(1).max(30),
  description: z.string().max(160).optional().default(''),
  level: z.enum(['cet4', 'cet6', 'all']).optional().default('all'),
  color: z.enum(['forest', 'amber', 'ink', 'danger', 'plum', 'sky']).optional().default('forest'),
})

function bookRows() {
  return db
    .prepare(
      `SELECT b.*,
        COUNT(bw.word_id) AS total,
        COALESCE(SUM(CASE WHEN bw.word_id IS NULL THEN 0 WHEN p.state IS NULL OR p.state = 'new' THEN 1 ELSE 0 END), 0) AS new_count,
        COALESCE(SUM(CASE WHEN p.state = 'learning' THEN 1 ELSE 0 END), 0) AS learning_count,
        COALESCE(SUM(CASE WHEN p.state = 'review' THEN 1 ELSE 0 END), 0) AS review_count,
        COALESCE(SUM(CASE WHEN p.state = 'mastered' THEN 1 ELSE 0 END), 0) AS mastered_count,
        COALESCE(SUM(CASE WHEN p.due_at IS NOT NULL AND p.due_at <= ? AND p.state != 'mastered' THEN 1 ELSE 0 END), 0) AS due_count
       FROM books b
       LEFT JOIN book_words bw ON bw.book_id = b.id
       LEFT JOIN progress p ON p.word_id = bw.word_id
       GROUP BY b.id
       ORDER BY b.sort_order ASC, b.created_at ASC`,
    )
    .all(new Date().toISOString())
}

router.get('/books', (req, res) => {
  res.json({ items: bookRows() })
})

router.post('/books', (req, res) => {
  const parsed = bookSchema.safeParse(req.body)
  if (!parsed.success) throw bad('词书信息不完整', parsed.error.flatten())
  const data = parsed.data
  const id = `b_${crypto.randomUUID().slice(0, 8)}`
  const order = db.prepare('SELECT COALESCE(MAX(sort_order), 100) m FROM books').get().m + 10
  db.prepare(
    `INSERT INTO books (id, name, description, level, kind, color, sort_order, created_at)
     VALUES (?, ?, ?, ?, 'custom', ?, ?, ?)`,
  ).run(id, data.name, data.description, data.level, data.color, order, new Date().toISOString())
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(id)
  res.status(201).json({ book })
})

router.patch('/books/:id', (req, res) => {
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id)
  if (!book) throw notFound('词书不存在')
  if (book.kind !== 'custom') throw conflict('系统词书不能修改')
  const parsed = bookSchema.partial().safeParse(req.body)
  if (!parsed.success) throw bad('词书信息不完整', parsed.error.flatten())
  const data = parsed.data
  db.prepare(
    `UPDATE books SET name = ?, description = ?, level = ?, color = ? WHERE id = ?`,
  ).run(
    data.name ?? book.name,
    data.description ?? book.description,
    data.level ?? book.level,
    data.color ?? book.color,
    book.id,
  )
  res.json({ book: db.prepare('SELECT * FROM books WHERE id = ?').get(book.id) })
})

router.delete('/books/:id', (req, res) => {
  const book = db.prepare('SELECT * FROM books WHERE id = ?').get(req.params.id)
  if (!book) throw notFound('词书不存在')
  if (book.kind !== 'custom') throw conflict('系统词书不能删除')
  db.exec('BEGIN')
  try {
    const wordIds = db.prepare('SELECT word_id FROM book_words WHERE book_id = ?').all(book.id)
    db.prepare('DELETE FROM books WHERE id = ?').run(book.id)
    const countLinks = db.prepare('SELECT COUNT(*) c FROM book_words WHERE word_id = ?')
    const delWord = db.prepare('DELETE FROM words WHERE id = ?')
    for (const { word_id } of wordIds) {
      if (countLinks.get(word_id).c === 0) delWord.run(word_id)
    }
    if (getSetting('defaultBookId', 'b_newwords') === book.id) {
      setSetting('defaultBookId', 'b_newwords')
    }
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
  res.json({ ok: true })
})

export default router
