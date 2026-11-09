import { Router } from 'express'
import crypto from 'node:crypto'
import { z } from 'zod'
import { db } from '../db.mjs'
import { bad, notFound } from '../lib/http.mjs'

const router = Router()

const paperSchema = z.object({
  title: z.string().trim().min(1).max(200),
  level: z.enum(['cet4', 'cet6']).optional().default('cet4'),
  writingPrompt: z.string().max(5000).optional().default(''),
  questions: z.array(z.any()).min(1).max(200),
})

function parseQuestions(value) {
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

function mapPaper(row) {
  return {
    id: row.id,
    title: row.title,
    level: row.level,
    writingPrompt: row.writing_prompt || '',
    questions: parseQuestions(row.questions),
    created_at: row.created_at,
    updated_at: row.updated_at,
  }
}

router.get('/papers', (req, res) => {
  const rows = db
    .prepare('SELECT * FROM papers ORDER BY updated_at DESC, id DESC LIMIT 100')
    .all()
  res.json({ items: rows.map(mapPaper) })
})

router.post('/papers/import', (req, res) => {
  const parsed = z.object({ papers: z.array(paperSchema).min(1).max(50) }).safeParse(req.body)
  if (!parsed.success) throw bad('真题格式不正确', parsed.error.flatten())
  const insert = db.prepare(
    `INSERT INTO papers (id, title, level, writing_prompt, questions, created_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  const now = new Date().toISOString()
  const ids = []
  const created = []
  for (const item of parsed.data.papers) {
    const id = `paper_custom_${crypto.randomUUID().slice(0, 10)}`
    insert.run(
      id,
      item.title,
      item.level,
      item.writingPrompt || '',
      JSON.stringify(item.questions),
      now,
      now,
    )
    ids.push(id)
    created.push({
      id,
      title: item.title,
      level: item.level,
      writingPrompt: item.writingPrompt || '',
      questions: item.questions,
      created_at: now,
      updated_at: now,
    })
  }
  res.status(201).json({ created: created.length, ids, items: created })
})

router.delete('/papers/:id', (req, res) => {
  const row = db.prepare('SELECT id FROM papers WHERE id = ?').get(req.params.id)
  if (!row) throw notFound('真题不存在')
  db.prepare('DELETE FROM papers WHERE id = ?').run(req.params.id)
  res.json({ ok: true })
})

export default router
