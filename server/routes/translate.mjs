import { Router } from 'express'
import { z } from 'zod'
import { bad, HttpError } from '../lib/http.mjs'
import { translateWithAi } from '../lib/translate.mjs'

const router = Router()

const chatMessage = z.object({
  role: z.enum(['user', 'assistant']),
  content: z.string().trim().min(1).max(4000),
})

const translateInput = z.object({
  text: z.string().trim().min(1).max(1200),
  question: z.string().trim().max(1000).optional(),
  translation: z.string().trim().max(4000).optional(),
  history: z.array(chatMessage).max(20).optional().default([]),
})

router.post('/ai/translate', async (req, res) => {
  const parsed = translateInput.safeParse(req.body)
  if (!parsed.success) throw bad('翻译参数有误', parsed.error.flatten())
  try {
    const result = await translateWithAi(parsed.data)
    res.json(result)
  } catch (err) {
    if (err instanceof HttpError) throw err
    throw new HttpError(502, err?.message || 'AI 翻译失败')
  }
})

export default router
