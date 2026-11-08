import { Router } from 'express'
import { z } from 'zod'
import { db } from '../db.mjs'
import { bad, notFound } from '../lib/http.mjs'

const router = Router()

const draftInput = z.object({
  content: z.string().max(30000).optional().default(''),
  checks: z.array(z.boolean()).max(20).optional().default([]),
  seconds: z.number().int().min(0).max(1000000).optional().default(0),
  savedAt: z.string().max(80).optional(),
})

function parseChecks(value) {
  try {
    const parsed = JSON.parse(value || '[]')
    return Array.isArray(parsed) ? parsed.map(Boolean) : []
  } catch {
    return []
  }
}

function mapDraft(row) {
  if (!row) return null
  return {
    essay_id: row.essay_id,
    content: row.content || '',
    checks: parseChecks(row.checks),
    seconds: Number(row.seconds) || 0,
    savedAt: row.saved_at || null,
    updated_at: row.updated_at,
  }
}

router.get('/essay-drafts', (req, res) => {
  const rows = db.prepare('SELECT * FROM essay_drafts ORDER BY updated_at DESC').all()
  res.json({ items: rows.map(mapDraft) })
})

router.get('/essay-drafts/:id', (req, res) => {
  const row = db.prepare('SELECT * FROM essay_drafts WHERE essay_id = ?').get(req.params.id)
  res.json({ draft: mapDraft(row) })
})

router.put('/essay-drafts/:id', (req, res) => {
  const parsed = draftInput.safeParse(req.body)
  if (!parsed.success) throw bad('草稿格式不正确', parsed.error.flatten())
  const essay = db.prepare('SELECT id FROM essays WHERE id = ?').get(req.params.id)
  if (!essay) throw notFound('作文不存在')
  const input = parsed.data
  const now = new Date().toISOString()
  const savedAt = input.savedAt || now
  db.prepare(
    `INSERT INTO essay_drafts (essay_id, content, checks, seconds, saved_at, updated_at)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(essay_id) DO UPDATE SET
       content = excluded.content,
       checks = excluded.checks,
       seconds = excluded.seconds,
       saved_at = excluded.saved_at,
       updated_at = excluded.updated_at`,
  ).run(
    req.params.id,
    input.content,
    JSON.stringify(input.checks || []),
    input.seconds || 0,
    savedAt,
    now,
  )
  const row = db.prepare('SELECT * FROM essay_drafts WHERE essay_id = ?').get(req.params.id)
  res.json({ draft: mapDraft(row) })
})

router.delete('/essay-drafts/:id', (req, res) => {
  db.prepare('DELETE FROM essay_drafts WHERE essay_id = ?').run(req.params.id)
  res.json({ ok: true })
})

export default router
