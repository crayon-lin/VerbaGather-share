import crypto from 'node:crypto'

export const QUIZ_TYPES = [
  'en2cn',
  'cn2en',
  'listen',
  'spell',
  'cloze',
  'sentence',
  'passage_cloze',
  'listening',
  'reading',
]
export const AI_TYPES = [
  'en2cn',
  'cn2en',
  'spell',
  'cloze',
  'sentence',
  'passage_cloze',
  'listening',
  'reading',
]

export function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function normalizeTypes(input) {
  const list = Array.isArray(input)
    ? input
    : String(input || '')
        .split(',')
        .map((x) => x.trim())
  const out = list.filter((t) => QUIZ_TYPES.includes(t))
  return out.length ? [...new Set(out)] : ['en2cn', 'cn2en', 'listen', 'spell']
}

export function cleanMeaning(text) {
  return String(text || '').split('\n')[0].slice(0, 90).trim()
}

export function shuffleQuestionOptions(question) {
  if (!question || !Array.isArray(question.options) || question.options.length < 2) {
    return question
  }
  if (!Number.isInteger(question.answerIndex) || question.answerIndex < 0) {
    return question
  }
  const correct = question.options[question.answerIndex]
  if (correct === undefined) return question
  const options = shuffle(question.options)
  return {
    ...question,
    options,
    answerIndex: options.indexOf(correct),
  }
}

export function snapshot(word) {
  return {
    id: word.id || null,
    term: word.term,
    phonetic: word.phonetic || '',
    pos: word.pos || '',
    meaning_cn: word.meaning_cn || '',
    meaning_en: word.meaning_en || '',
    example_en: word.example_en || '',
    example_cn: word.example_cn || '',
    exchange: word.exchange || '',
  }
}

function escapeRegExp(text) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function clozePrompt(word) {
  const example = String(word.example_en || '').trim()
  if (!example || !word.term) return ''
  const re = new RegExp(`\\b${escapeRegExp(word.term)}(?:s|es|ed|d|ing|ly|ies)?\\b`, 'i')
  if (!re.test(example)) return ''
  return example.replace(re, '______')
}

function uniqueOptions(options) {
  const seen = new Set()
  const out = []
  for (const option of options) {
    const text = String(option || '').trim()
    if (!text) continue
    const key = text.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(text)
  }
  return out
}

function termOptions(word, pool, n = 3) {
  const others = shuffle(
    pool
      .filter((p) => p.term && p.term.toLowerCase() !== word.term.toLowerCase())
      .map((p) => p.term),
  )
  return uniqueOptions([word.term, ...others.slice(0, n)])
}

function meaningOptions(word, pool, n = 3) {
  const correct = cleanMeaning(word.meaning_cn)
  const others = shuffle(
    pool
      .filter((p) => p.term && p.term.toLowerCase() !== word.term.toLowerCase())
      .map((p) => cleanMeaning(p.meaning_cn))
      .filter(Boolean),
  )
  return uniqueOptions([correct, ...others.slice(0, n)])
}

function baseQuestion(word, type, prompt, options, answer) {
  const answerIndex = options.findIndex((o) => o.toLowerCase() === String(answer).toLowerCase())
  return shuffleQuestionOptions({
    id: `q_${crypto.randomUUID().slice(0, 10)}`,
    wordId: word.id || null,
    type,
    prompt,
    answer,
    options,
    answerIndex: type === 'spell' ? -1 : answerIndex,
    word: snapshot(word),
    explanation: `${word.term}：${cleanMeaning(word.meaning_cn)}`,
  })
}

export function buildLocalQuestion(word, type, pool = []) {
  const wordPool = pool.filter((p) => p && p.term)
  const meaning = cleanMeaning(word.meaning_cn)
  if (!word.term || !meaning) return null
  if (type === 'en2cn') {
    const options = meaningOptions(word, wordPool)
    if (options.length < 2) return null
    return baseQuestion(word, type, word.term, options, meaning)
  }
  if (type === 'cn2en') {
    const options = termOptions(word, wordPool)
    if (options.length < 2) return null
    return baseQuestion(word, type, meaning, options, word.term)
  }
  if (type === 'listen') {
    const options = termOptions(word, wordPool)
    if (options.length < 2) return null
    return baseQuestion(word, type, '', options, word.term)
  }
  if (type === 'spell') {
    return baseQuestion(word, type, meaning, [], word.term)
  }
  if (type === 'cloze') {
    const prompt = clozePrompt(word)
    if (!prompt) return null
    const options = termOptions(word, wordPool)
    if (options.length < 2) return null
    return baseQuestion(word, type, prompt, options, word.term)
  }
  return null
}

export function buildLocalQuestions(words, types, count, pool = []) {
  const list = words.filter((w) => w && w.term && cleanMeaning(w.meaning_cn))
  if (!list.length) return []
  const typeList = normalizeTypes(types)
  const wordPool = pool.length ? pool : list
  const questions = []
  const seen = new Set()
  for (let i = 0; i < count * 2 && questions.length < count; i += 1) {
    const word = list[i % list.length]
    const type = typeList[i % typeList.length]
    const question = buildLocalQuestion(word, type, wordPool)
    if (!question) continue
    const key = `${question.type}|${question.prompt}|${question.options.join('|')}`
    if (seen.has(key)) continue
    seen.add(key)
    questions.push(question)
  }
  // 若题型不足（例如单词没有例句），用释义选择题补足
  for (let i = 0; questions.length < count && i < list.length * 4; i += 1) {
    const word = list[i % list.length]
    const question = buildLocalQuestion(word, 'en2cn', wordPool)
    if (!question) continue
    const key = `${question.type}|${question.prompt}|${question.options.join('|')}`
    if (seen.has(key)) continue
    seen.add(key)
    questions.push(question)
  }
  return questions
}

export function quizSignature({ sourceType, sourceRef, count, types, level }) {
  return [sourceType, sourceRef, count, [...types].sort().join(','), level].join('|')
}
