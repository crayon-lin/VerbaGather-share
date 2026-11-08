import { Router } from 'express'
import { z } from 'zod'
import { bad, HttpError } from '../lib/http.mjs'
import { searchAiConfig, searchWithAi } from '../lib/ai.mjs'

const router = Router()

const searchInput = z.object({
  query: z.string().trim().min(1).max(240),
  context: z.string().max(4000).optional().default(''),
})

router.post('/ai/search', async (req, res) => {
  const parsed = searchInput.safeParse(req.body)
  if (!parsed.success) throw bad('搜索参数有误', parsed.error.flatten())
  const config = searchAiConfig()
  if (!config.enabled) throw bad('AI 搜索未启用，请先在设置中开启')
  if (!config.baseUrl) throw bad('AI 搜索缺少 Base URL，请先在设置中填写')
  try {
    const result = await searchWithAi(parsed.data)
    res.json(result)
  } catch (err) {
    if (err instanceof HttpError) throw err
    throw new HttpError(502, err?.message || 'AI 搜索失败')
  }
})

export default router
