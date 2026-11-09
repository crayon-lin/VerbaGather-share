import { getSetting } from '../db.mjs'
import {
  AI_TYPES,
  cleanMeaning,
  normalizeTypes,
  shuffleQuestionOptions,
  snapshot,
} from './quiz.mjs'

export function aiConfig() {
  const enabled = Boolean(getSetting('aiEnabled', false))
  const baseUrl = String(getSetting('aiBaseUrl', '') || '').trim()
  const apiKey = String(getSetting('aiApiKey', '') || '').trim()
  const model = String(getSetting('aiModel', '') || '').trim() || 'deepseek-chat'
  return { enabled, baseUrl, apiKey, model, ready: enabled && Boolean(baseUrl) }
}

async function callChat(config, messages, timeoutMs = 15000, maxTokens = 2200) {
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
        temperature: 0.65,
        max_tokens: maxTokens,
        messages,
      }),
      signal: controller.signal,
    })
    if (!res.ok) {
      const text = await res.text().catch(() => '')
      throw new Error(`模型接口返回 ${res.status}${text ? `：${text.slice(0, 120)}` : ''}`)
    }
    const body = await res.json()
    const content = body?.choices?.[0]?.message?.content
    if (Array.isArray(content)) {
      return content.map((part) => (typeof part === 'string' ? part : part?.text || '')).join('')
    }
    if (typeof content !== 'string' || !content.trim()) {
      throw new Error('模型没有返回内容')
    }
    return content
  } finally {
    clearTimeout(timer)
  }
}

function extractJson(text) {
  const cleaned = String(text)
    .replace(/^```(?:json)?/i, '')
    .replace(/```$/i, '')
    .trim()
  const start = cleaned.indexOf('{')
  const end = cleaned.lastIndexOf('}')
  if (start < 0 || end <= start) throw new Error('模型返回的不是 JSON')
  return JSON.parse(cleaned.slice(start, end + 1))
}

function normalizeOptions(value) {
  if (!Array.isArray(value)) return []
  const out = []
  const seen = new Set()
  for (const raw of value) {
    const text = String(
      raw && typeof raw === 'object'
        ? raw.text ?? raw.value ?? raw.label ?? raw.content ?? ''
        : raw ?? '',
    ).trim()
    if (!text || text.length > 320) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(text)
    if (out.length >= 6) break
  }
  return out
}

const TYPE_ALIASES = {
  'passage_cloze': 'passage_cloze',
  'passage-cloze': 'passage_cloze',
  'passagecloze': 'passage_cloze',
  'cloze_passage': 'passage_cloze',
  '完形填空': 'passage_cloze',
  'reading': 'reading',
  'reading_comprehension': 'reading',
  'reading-comprehension': 'reading',
  'readingcomprehension': 'reading',
  '阅读理解': 'reading',
  'listening': 'listening',
  'listening_comprehension': 'listening',
  'listening-comprehension': 'listening',
  '听力题干': 'listening',
  'sentence': 'sentence',
  'sentence_translation': 'sentence',
  'sentence-translation': 'sentence',
  '句子翻译': 'sentence',
}

const CONTEXT_TYPES = new Set(['sentence', 'passage_cloze', 'listening', 'reading'])
const TARGET_TYPES = new Set(['en2cn', 'cn2en', 'cloze', 'spell'])

function normalizeAiType(value) {
  const raw = String(value || '').trim()
  if (!raw) return ''
  const key = raw.toLowerCase().replace(/\s+/g, '_')
  if (AI_TYPES.includes(key)) return key
  return TYPE_ALIASES[key] || TYPE_ALIASES[raw] || ''
}

function firstText(...values) {
  for (const value of values) {
    if (typeof value === 'string' || typeof value === 'number') {
      const text = String(value).trim()
      if (text) return text
    }
  }
  return ''
}

function normalizeAiItem(item, words) {
  if (!item || typeof item !== 'object') return null
  const rawTerm = String(
    item.term || (item.word && typeof item.word === 'object' ? item.word.term : item.word) || '',
  ).trim()
  const term = rawTerm.toLowerCase()
  const matchedWord = term
    ? words.find((word) => String(word.term || '').toLowerCase() === term)
    : null
  const passage = firstText(item.passage, item.article, item.text, item.content, item.passage_text)
  const audioText = firstText(
    item.audioText,
    item.audio_text,
    item.audio,
    item.script,
    item.transcript,
  )
  const rawBlankIndex = item.blankIndex ?? item.blank_index
  const blankIndex =
    rawBlankIndex !== undefined && Number.isInteger(Number(rawBlankIndex))
      ? Number(rawBlankIndex)
      : null
  const passageBlankCount = (passage.match(/_{2,}/g) || []).length
  const rawBlankCount = item.blankCount ?? item.blank_count
  const blankCount = Math.max(
    Number.isInteger(Number(rawBlankCount)) ? Number(rawBlankCount) : 0,
    passageBlankCount,
  )
  let type = normalizeAiType(item.type ?? item.question_type)
  if (!type) {
    if (audioText) type = 'listening'
    else if (passage) type = /_{2,}/.test(passage) ? 'passage_cloze' : 'reading'
  }
  if (!AI_TYPES.includes(type)) return null
  const isContext = CONTEXT_TYPES.has(type)
  if (!isContext && !matchedWord) return null
  if (isContext && !matchedWord && !words.length) return null

  const anchor = matchedWord || words[0]
  const meaning = cleanMeaning(anchor?.meaning_cn || '')
  let prompt = firstText(item.prompt, item.question, item.stem, item.question_text)
  let options = normalizeOptions(item.options)
  const rawIndex = item.answerIndex ?? item.answer_index ?? item.correctIndex ?? item.correct_index
  let answerIndex = Number.isInteger(Number(rawIndex)) ? Number(rawIndex) : -1
  const answerText = firstText(item.answer, item.correctAnswer, item.correct_answer)
  if (
    (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length) &&
    answerText
  ) {
    answerIndex = options.findIndex((option) => option.toLowerCase() === answerText.toLowerCase())
    if (answerIndex < 0) {
      answerIndex = options.findIndex(
        (option) =>
          option.toLowerCase().includes(answerText.toLowerCase()) ||
          answerText.toLowerCase().includes(option.toLowerCase()),
      )
    }
  }
  let answer = ''

  if (isContext) {
    if (options.length < 2) return null
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length) {
      return null
    }
    answer = options[answerIndex]
    if (type === 'sentence') {
      if (prompt.length < 8 || prompt.length > 500) return null
    } else if (type === 'passage_cloze') {
      if (passage.length < 20 || passage.length > 2000 || !/_{2,}/.test(passage)) return null
      prompt = prompt || '选择最适合填入空格的词'
    } else if (type === 'listening') {
      if (audioText.length < 20 || audioText.length > 2000) return null
      if (prompt.length < 3 || prompt.length > 300) return null
    } else if (type === 'reading') {
      if (passage.length < 40 || passage.length > 2500) return null
      if (prompt.length < 3 || prompt.length > 300) return null
    }
    return shuffleQuestionOptions({
      id: `ai_${Math.random().toString(36).slice(2, 10)}`,
      wordId: matchedWord?.id || null,
      type,
      prompt,
      answer,
      options,
      answerIndex,
      ...(passage ? { passage } : {}),
      ...(audioText ? { audioText } : {}),
      ...(type === 'passage_cloze'
        ? {
            blankIndex:
              blankIndex === null ? undefined : Math.max(0, Math.min(blankIndex, blankCount - 1)),
            blankCount: Math.max(1, blankCount),
          }
        : {}),
      word: snapshot(anchor),
      explanation:
        String(item.explanation || '').slice(0, 240) ||
        (meaning ? `${anchor.term}：${meaning}` : anchor?.term || ''),
    })
  }

  if (!TARGET_TYPES.has(type) || !matchedWord) return null
  const word = matchedWord

  if (type === 'spell') {
    options = []
    answerIndex = -1
    prompt = meaning
    answer = word.term
  } else if (type === 'en2cn') {
    if (options.length < 2) return null
    const exact = options.findIndex(
      (option) => option === meaning || meaning.includes(option) || option.includes(meaning.slice(0, 8)),
    )
    if (exact >= 0) answerIndex = exact
    if (!Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length) {
      answerIndex = options.findIndex((option) => option === meaning || meaning.includes(option))
    }
    if (answerIndex < 0) return null
    prompt = word.term
    answer = options[answerIndex]
  } else {
    if (options.length < 2) return null
    if (!options.some((option) => option.toLowerCase() === word.term.toLowerCase())) return null
    if (!Number.isInteger(answerIndex) || options[answerIndex]?.toLowerCase() !== word.term.toLowerCase()) {
      answerIndex = options.findIndex((option) => option.toLowerCase() === word.term.toLowerCase())
    }
    if (answerIndex < 0) return null
    answer = word.term
    if (type === 'cn2en') prompt = meaning
    if (type === 'cloze') {
      if (!/_{2,}/.test(prompt)) return null
      if (prompt.length < 8 || prompt.length > 500) return null
    }
  }

  return shuffleQuestionOptions({
    id: `ai_${Math.random().toString(36).slice(2, 10)}`,
    wordId: word.id || null,
    type,
    prompt,
    answer,
    options,
    answerIndex,
    word: snapshot(word),
    explanation: String(item.explanation || '').slice(0, 240) || `${word.term}：${meaning}`,
  })
}

function normalizeAiItems(item, words) {
  const type = normalizeAiType(item?.type ?? item?.question_type)
  if (type === 'passage_cloze' && Array.isArray(item?.blanks) && item.blanks.length) {
    const blanks = item.blanks.slice(0, 10)
    return blanks
      .map((blank, index) =>
        normalizeAiItem(
          {
            ...item,
            type: 'passage_cloze',
            options: blank?.options ?? blank?.choices ?? blank?.options_list ?? [],
            answerIndex: blank?.answerIndex ?? blank?.answer_index,
            answer: blank?.answer ?? blank?.correctAnswer ?? blank?.correct_answer,
            explanation: blank?.explanation || item?.explanation,
            blankIndex: index,
            blankCount: blanks.length,
            blanks: undefined,
          },
          words,
        ),
      )
      .filter(Boolean)
  }
  const question = normalizeAiItem(item, words)
  return question ? [question] : []
}

export function searchAiConfig() {
  const enabled = Boolean(getSetting('searchAiEnabled', false))
  const baseUrl = String(getSetting('searchAiBaseUrl', '') || '').trim()
  const apiKey = String(getSetting('searchAiApiKey', '') || '').trim()
  const model = String(getSetting('searchAiModel', '') || '').trim() || 'deepseek-chat'
  return { enabled, baseUrl, apiKey, model, ready: enabled && Boolean(baseUrl) }
}

export async function searchWithAi({ query, context = '' }) {
  const config = searchAiConfig()
  if (!config.ready) throw new Error('AI 搜索还没有配置 Base URL')
  const system =
    '你是拾词 Inkling 的英语学习搜索助手。用简洁、准确的中文回答，优先帮助四六级学习者理解单词、搭配、语法、句子和写作。不要写 Markdown 表格，不要编造来源。'
  const user = `用户搜索：${query}

本地词库中可能相关的内容（如果为空则忽略）：
${context || '（无）'}

请直接回答。如果是单词，给出音标（若已知）、核心释义、常见搭配和一个简短例句；如果是语法或写作问题，给出简明解释和可操作建议。控制在 500 字以内。`
  const content = await callChat(
    config,
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    25000,
    1400,
  )
  return { answer: content.trim(), model: config.model }
}

export function essayAiConfig() {
  const enabled = Boolean(getSetting('essayAiEnabled', false))
  const baseUrl = String(getSetting('essayAiBaseUrl', '') || '').trim()
  const apiKey = String(getSetting('essayAiApiKey', '') || '').trim()
  const model = String(getSetting('essayAiModel', '') || '').trim() || 'deepseek-chat'
  return { enabled, baseUrl, apiKey, model, ready: enabled && Boolean(baseUrl) }
}

export async function scoreEssay({ content, prompt = '', level = 'cet4', wordCount = 0 }) {
  const config = essayAiConfig()
  if (!config.ready) throw new Error('AI 作文评分还没有配置 Base URL')
  const system =
    '你是大学英语四六级写作阅卷老师。只输出一个 JSON 对象，不要 Markdown，不要输出 JSON 以外的解释。评分要具体、严格但鼓励。'
  const user = `请按四六级写作标准评分。
考试级别：${level === 'cet6' ? 'CET-6' : 'CET-4'}
题目：${prompt || '（未提供，按通用议论文标准）'}
词数：${wordCount || '未知'}
作文正文：
${content}

输出 JSON 格式：
{
  "score": 10.5,
  "maxScore": 15,
  "summary": "一句话总评",
  "dimensions": [
    {"name": "内容与切题", "score": 4, "maxScore": 5, "comment": "具体评价"},
    {"name": "结构与连贯", "score": 3.5, "maxScore": 5, "comment": "具体评价"},
    {"name": "语言与语法", "score": 3, "maxScore": 5, "comment": "具体评价"}
  ],
  "strengths": ["优点1", "优点2"],
  "improvements": ["改进1", "改进2"],
  "suggestions": ["可直接替换的句子或表达建议"]
}
分数保留一位小数；所有评价用中文，引用原句时保留英文。`
  const text = await callChat(
    config,
    [
      { role: 'system', content: system },
      { role: 'user', content: user },
    ],
    30000,
    1800,
  )
  const data = extractJson(text)
  const safeScore = (value, max) => {
    const n = Number(value)
    if (!Number.isFinite(n)) return 0
    return Math.max(0, Math.min(max, Math.round(n * 10) / 10))
  }
  const maxScore = safeScore(data.maxScore || 15, 30) || 15
  const dimensions = Array.isArray(data.dimensions)
    ? data.dimensions.slice(0, 6).map((item) => ({
        name: String(item?.name || '评分项').slice(0, 40),
        score: safeScore(item?.score, safeScore(item?.maxScore || 5, 10) || 5),
        maxScore: safeScore(item?.maxScore || 5, 10) || 5,
        comment: String(item?.comment || '').slice(0, 500),
      }))
    : []
  const list = (value) =>
    Array.isArray(value)
      ? value.map((item) => String(item).slice(0, 500)).filter(Boolean).slice(0, 6)
      : []
  return {
    score: safeScore(data.score, maxScore),
    maxScore,
    summary: String(data.summary || '').slice(0, 800),
    dimensions,
    strengths: list(data.strengths),
    improvements: list(data.improvements),
    suggestions: list(data.suggestions),
    model: config.model,
  }
}

export async function generateAiQuestions(words, types, count, difficulty = 3, tendencies = []) {
  const config = aiConfig()
  if (!config.ready || !words.length) return null
  const level = Math.min(5, Math.max(1, Math.round(Number(difficulty) || 3)))
  const tendencyMap = {
    balanced: '均衡：词义、语法、搭配和辨析按大致相同的比例混合出题。',
    meaning: '词义为主：重点考核心释义、词性与基本用法。',
    grammar: '语法为主：结合时态、从句、非谓语、词性转换等语法点。',
    collocation: '固定搭配：重点考常见介词搭配、动词短语、固定表达。',
    confusion: '辨析易混词：设置近义词、形近词、易混词的语境辨析。',
  }
  const requestedTendencies = [...new Set(Array.isArray(tendencies) ? tendencies : [])].filter(
    (value) => tendencyMap[value],
  )
  const tendencyList = requestedTendencies.includes('balanced')
    ? ['balanced']
    : requestedTendencies
  const tendencyText = tendencyList.length
    ? tendencyList.map((value) => `- ${tendencyMap[value]}`).join('\n')
    : '- 词义为主：重点考核心释义、词性与基本用法。'
  const difficultyText = {
    1: '基础：直接考查单词最常见的中文释义，干扰项尽量简单。',
    2: '较易：考查常见释义或基础搭配，干扰项来自同一词性。',
    3: '中等：把词放进常见语境，选项包含易混释义，需要结合例句判断。',
    4: '较难：考查近义词、词性变化、固定搭配或语境辨析。',
    5: '挑战：使用接近考试难度的长句、抽象语境或近义辨析，选项要有迷惑性。',
  }[level]
  const allowedTypes = normalizeTypes(types).filter((t) => AI_TYPES.includes(t))
  const typeList = allowedTypes.length ? allowedTypes : ['en2cn', 'cn2en', 'cloze', 'spell']
  const longTypes = ['sentence', 'passage_cloze', 'listening', 'reading']
  const hasLongQuestions = typeList.some((type) => longTypes.includes(type))
  const onlyLongQuestions = typeList.every((type) => longTypes.includes(type))
  const payload = words.slice(0, 20).map((w) => ({
    term: w.term,
    phonetic: w.phonetic || '',
    meaning_cn: cleanMeaning(w.meaning_cn),
    example_en: w.example_en || '',
  }))
  const system =
    '你是大学英语四六级命题老师。你只输出一个 JSON 对象，不要 Markdown，不要解释。'
  const buildUser = (requestCount, requestTypes) => `根据下面的单词，生成 ${requestCount} 道四六级风格的小测题。
单词数据：
${JSON.stringify(payload, null, 2)}

难度等级：${level}/5
${difficultyText}
出题倾向（可多选）：
${tendencyText}
题型只能从这些值里选：${requestTypes.join('、')}。
题型要求：
- en2cn：题干是英文单词，四个选项是中文释义，答案选项必须正确。
- cn2en：题干是中文释义，四个选项是英文单词，正确项必须是目标词本身。
- cloze：题干是包含 "______" 的英文例句，四个选项是英文单词，正确项是目标词本身。
- spell：题干是中文释义，不给选项，答案由前端拼写。
- sentence：句子翻译。prompt 是一句包含目标词的英文原句，options 是四个中文译文，answerIndex 指向最佳译文。
- passage_cloze：真实完形填空。passage 是 100–180 词英文短文，必须**正好包含 5 个 "______"**；只输出**一个** question 对象，type 为 passage_cloze，并用 blanks 数组给出 5 个空；blanks 每项包含该空的 options（四个英文选项）、answerIndex 和 explanation。不要输出 5 个独立 question，也不要只给一个空。
- listening：听力题干。audioText 是 40–100 词的英文对话或独白；prompt 是英文题干；options 是四个英文选项，answerIndex 指向正确答案。
- reading：阅读理解。passage 是 80–160 词的英文短文；prompt 是一个英文理解题；options 是四个英文选项，answerIndex 指向正确答案。
- 每道题都必须提供 term，且 term 必须从上面的单词数据中原样选择；阅读/完形如果与目标词关联较弱，也选择最相关的一个，不要省略 term。
- 不要输出省略号、占位符或 markdown 代码块；passage、audioText、prompt、options 都必须是完整内容。
- 所有选择题的选项顺序都要随机打乱，正确答案不要固定放在第一个，也不要形成 A/B/C/D 的规律。

输出格式：
{"questions":[{"term":"目标词","type":"reading","passage":"短文","audioText":"听力材料，仅 listening 使用","prompt":"题干","options":["选项1","选项2","选项3","选项4"],"answerIndex":2,"blankIndex":0,"blankCount":5,"explanation":"一句话解析"},{"term":"目标词","type":"passage_cloze","passage":"含 5 个 ______ 的短文","prompt":"选择最适合填入空格的词","blanks":[{"options":["选项1","选项2","选项3","选项4"],"answerIndex":2}, {"options":["选项1","选项2","选项3","选项4"],"answerIndex":0}, {"options":["选项1","选项2","选项3","选项4"],"answerIndex":1}, {"options":["选项1","选项2","选项3","选项4"],"answerIndex":3}, {"options":["选项1","选项2","选项3","选项4"],"answerIndex":0}],"explanation":"一句话解析"}]}
每个单词最多出 2 题，总共 ${requestCount} 题；题干和选项不要包含换行。`

  const request = async (requestCount, requestTypes) => {
    const requestLong = requestTypes.some((type) => longTypes.includes(type))
    const maxTokens = Math.min(8000, Math.max(3000, requestCount * (requestLong ? 600 : 220)))
    const content = await callChat(
      config,
      [
        { role: 'system', content: system },
        { role: 'user', content: buildUser(requestCount, requestTypes) },
      ],
      requestLong ? 60000 : 30000,
      maxTokens,
    )
    const data = extractJson(content)
    const items = Array.isArray(data?.questions) ? data.questions : []
    const batch = []
    const batchSeen = new Set()
    for (const item of items) {
      for (const question of normalizeAiItems(item, words)) {
        if (!question) continue
        if (!typeList.includes(question.type)) continue
        if (!requestTypes.includes(question.type)) continue
        const key = `${question.type}|${question.prompt}|${question.options.join('|')}`
        if (batchSeen.has(key)) continue
        batchSeen.add(key)
        batch.push(question)
      }
    }
    // 模型有时会省略 blankIndex；同一篇短文的连续空按顺序编号，
    // 避免整组完形都被当成第 1 空。
    const blankCounters = new Map()
    for (const question of batch) {
      if (question.type !== 'passage_cloze') continue
      const key = question.passage || ''
      if (question.blankIndex === undefined) {
        const next = blankCounters.get(key) || 0
        question.blankIndex = next
        question.blankCount = Math.max(question.blankCount || 0, next + 1)
        blankCounters.set(key, next + 1)
      } else {
        blankCounters.set(key, Math.max(blankCounters.get(key) || 0, question.blankIndex + 1))
      }
      if (!question.blankCount || question.blankCount < 2) {
        question.blankCount = Math.max(
          5,
          (question.passage?.match(/_{2,}/g) || []).length,
          question.blankIndex + 1,
        )
      }
    }
    return batch
  }

  const out = []
  const seen = new Set()
  const addQuestions = (batch) => {
    for (const question of batch) {
      const key = `${question.type}|${question.prompt}|${question.options.join('|')}`
      if (seen.has(key)) continue
      seen.add(key)
      out.push(question)
      if (out.length >= count) break
    }
  }
  const missingTypes = () =>
    typeList.filter((type) => !out.some((question) => question.type === type))

  let firstError = null
  const hasCloze = typeList.includes('passage_cloze')
  if (hasCloze) {
    try {
      // 完形填空是一篇短文中的 5 个空，作为一个对象返回后再展开；
      // 这样不会因为重复 5 次短文而把 JSON 输出截断。
      addQuestions(await request(1, ['passage_cloze']))
    } catch (error) {
      firstError = error
    }
    if (out.length >= 5) return out.slice(0, 5)
  } else {
    try {
      // 阅读/听力等长文本题型一次请求太多时，部分模型会返回空内容；
      // 只选长题型时先按 2 题一批生成，稳定后再补足。
      const firstCount = onlyLongQuestions ? Math.min(count, 2) : count
      addQuestions(await request(firstCount, typeList))
    } catch (error) {
      firstError = error
    }
  }

  const needsMore = () => out.length < count || (hasLongQuestions && missingTypes().length > 0)
  for (let attempt = 0; attempt < 6 && needsMore(); attempt += 1) {
    const missing = missingTypes()
    const requestTypes = missing.length ? missing : typeList
    const requestCount = Math.min(2, Math.max(1, count - out.length))
    try {
      addQuestions(await request(requestCount, requestTypes))
    } catch (error) {
      if (!firstError) firstError = error
    }
  }

  if (out.length) return out.slice(0, count)
  if (firstError && !hasLongQuestions) throw firstError
  return null
}
