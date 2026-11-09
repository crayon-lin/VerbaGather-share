import { Router } from 'express'
import { z } from 'zod'
import { bad, HttpError } from '../lib/http.mjs'
import { essayAiConfig, scoreEssay } from '../lib/ai.mjs'

const router = Router()

const scoreInput = z.object({
  content: z.string().trim().min(20).max(8000),
  prompt: z.string().max(2000).optional().default(''),
  level: z.enum(['cet4', 'cet6']).optional().default('cet4'),
  wordCount: z.number().int().min(0).max(2000).optional().default(0),
})

router.post('/ai/essay-score', async (req, res) => {
  const parsed = scoreInput.safeParse(req.body)
  if (!parsed.success) throw bad('作文内容太短或参数有误', parsed.error.flatten())
  const config = essayAiConfig()
  if (!config.enabled) throw bad('AI 作文评分未启用，请先在设置中开启')
  if (!config.baseUrl) throw bad('AI 作文评分缺少 Base URL，请先在设置中填写')
  try {
    const result = await scoreEssay(parsed.data)
    res.json(result)
  } catch (err) {
    if (err instanceof HttpError) throw err
    throw new HttpError(502, err?.message || 'AI 作文评分失败')
  }
})

export default router
