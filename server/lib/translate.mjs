import { getSetting } from '../db.mjs'

const SYSTEM_PROMPT = `你是用户的中英翻译与英语学习助手。
规则：
1. 当用户只给出一段选中文本时，做翻译：原文主要是中文就翻译成自然英文；其他语言翻译成简体中文。只输出译文，不要解释、不要加引号。
2. 当用户继续追问时，用中文回答，并结合选中的原文和初始译文解释语法、搭配、语气或使用场景；必要时给简短例句。
3. 不要虚构原文没有的信息，不要输出与问题无关的长篇内容。`

export function translateConfig() {
  const enabled = Boolean(getSetting('translateAiEnabled', false))
  const baseUrl = String(getSetting('translateAiBaseUrl', '') || '').trim()
  const apiKey = String(getSetting('translateAiApiKey', '') || '').trim()
  const model = String(getSetting('translateAiModel', '') || '').trim() || 'deepseek-chat'
  return { enabled, baseUrl, apiKey, model, ready: enabled && Boolean(baseUrl) }
}

async function callTranslationModel(config, messages, timeoutMs = 25000) {
  const base = config.baseUrl.replace(/\/+$/, '')
  const url = base.endsWith('/chat/completions') ? base : `${base}/chat/completions`
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)
  try {
    const res = await fetch(url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(config.apiKey ? { Authorization: `Bearer ${config.apiKey}` } : {}),
      },
      body: JSON.stringify({
        model: config.model,
        temperature: 0.25,
        max_tokens: 1400,
        messages,
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`翻译接口返回 ${res.status}${text ? `：${text.slice(0, 100)}` : ''}`)
    }
    const body = await res.json()
    const content = body?.choices?.[0]?.message?.content
    const reply = Array.isArray(content)
      ? content.map((part) => (typeof part === 'string' ? part : part?.text || '')).join('')
      : content
    if (typeof reply !== 'string' || !reply.trim()) throw new Error('翻译模型没有返回内容')
    return reply.trim()
  } finally {
    clearTimeout(timer)
  }
}

export async function translateWithAi({ text, question, translation, history = [] }) {
  const config = translateConfig()
  if (!config.enabled) throw new Error('AI 翻译未启用，请到「设置 → AI 翻译」中开启')
  if (!config.ready) throw new Error('AI 翻译缺少 Base URL，请到「设置 → AI 翻译」中填写')

  const source = String(text || '').trim()
  if (!source) throw new Error('没有选中的文本')
  const followUp = String(question || '').trim()
  const messages = [{ role: 'system', content: SYSTEM_PROMPT }]

  if (!followUp) {
    messages.push({
      role: 'user',
      content: `请翻译下面这段选中文本：\n"""${source}"""`,
    })
  } else {
    messages.push({
      role: 'user',
      content: `下面是我选中的原文：\n"""${source}"""`,
    })
    if (translation?.trim()) {
      messages.push({ role: 'assistant', content: translation.trim() })
    }
    for (const item of history.slice(-20)) {
      if (!item || !['user', 'assistant'].includes(item.role)) continue
      const content = String(item.content || '').trim()
      if (!content) continue
      messages.push({ role: item.role, content: content.slice(0, 4000) })
    }
    messages.push({ role: 'user', content: `追问：${followUp}` })
  }

  const reply = await callTranslationModel(config, messages)
  return { reply, model: config.model }
}
