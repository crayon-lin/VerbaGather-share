import test from 'node:test'
import assert from 'node:assert/strict'
import {
  buildLocalQuestions,
  clozePrompt,
  normalizeTypes,
  quizSignature,
  shuffleQuestionOptions,
} from '../server/lib/quiz.mjs'

const words = [
  {
    id: 'w1',
    term: 'abandon',
    phonetic: '/əˈbændən/',
    meaning_cn: 'vt. 放弃；抛弃',
    example_en: 'He refused to abandon his dream after repeated failures.',
    example_cn: '他拒绝放弃梦想。',
  },
  {
    id: 'w2',
    term: 'benefit',
    phonetic: '/ˈbenɪfɪt/',
    meaning_cn: 'n. 益处；v. 有益于',
    example_en: 'Regular exercise benefits both body and mind.',
    example_cn: '规律运动有益身心。',
  },
  {
    id: 'w3',
    term: 'diligent',
    phonetic: '/ˈdɪlɪdʒənt/',
    meaning_cn: 'a. 勤奋的',
    example_en: 'A diligent student reviews notes every day.',
    example_cn: '勤奋的学生每天复习笔记。',
  },
  {
    id: 'w4',
    term: 'resilience',
    phonetic: '/rɪˈzɪliəns/',
    meaning_cn: 'n. 韧性；恢复力',
    example_en: 'Her resilience helped her recover from failure.',
    example_cn: '韧性帮助她从失败中恢复。',
  },
]

test('clozePrompt 把单词及词形变化替换成空', () => {
  assert.equal(
    clozePrompt(words[0]),
    'He refused to ______ his dream after repeated failures.',
  )
  assert.equal(clozePrompt(words[1]), 'Regular exercise ______ both body and mind.')
  assert.equal(clozePrompt({ term: 'missing', example_en: 'No hit here.' }), '')
})

test('本地出题覆盖多种题型且答案合法', () => {
  const questions = buildLocalQuestions(words, ['en2cn', 'cn2en', 'cloze', 'spell'], 8, words)
  assert.ok(questions.length >= 4)
  for (const q of questions) {
    assert.ok(q.prompt.length > 0 || q.type === 'listen')
    if (q.type === 'spell') {
      assert.equal(q.options.length, 0)
      assert.equal(q.answerIndex, -1)
    } else {
      assert.ok(q.options.length >= 2)
      assert.ok(q.answerIndex >= 0 && q.answerIndex < q.options.length)
    }
    if (q.type === 'cloze') assert.match(q.prompt, /_{2,}/)
  }
  assert.ok(questions.some((q) => q.type === 'cloze'))
})

test('normalizeTypes 过滤非法题型并保留顺序', () => {
  assert.deepEqual(normalizeTypes(['cloze', 'bad', 'en2cn']), ['cloze', 'en2cn'])
  assert.deepEqual(normalizeTypes([]), ['en2cn', 'cn2en', 'listen', 'spell'])
})

test('选项打乱后正确答案索引同步移动', () => {
  const question = {
    type: 'en2cn',
    prompt: 'abandon',
    options: ['vt. 放弃；抛弃', 'n. 益处', 'a. 勤奋的', 'n. 韧性'],
    answerIndex: 0,
    answer: 'vt. 放弃；抛弃',
  }
  const shuffled = shuffleQuestionOptions(question)
  assert.deepEqual(
    [...shuffled.options].sort(),
    [...question.options].sort(),
  )
  assert.equal(shuffled.options[shuffled.answerIndex], 'vt. 放弃；抛弃')
  const spell = { type: 'spell', options: [], answerIndex: -1, answer: 'abandon' }
  assert.deepEqual(shuffleQuestionOptions(spell), spell)
})

test('本地出题会打乱正确选项，不再固定 A', () => {
  const pool = Array.from({ length: 20 }, (_, i) => ({
    id: `w${i}`,
    term: `word${i}`,
    meaning_cn: `释义${i}`,
    example_en: `This is word${i} in a sentence.`,
  }))
  const questions = buildLocalQuestions(pool, ['en2cn'], 40, pool)
  const positions = new Set(questions.map((q) => q.answerIndex))
  assert.ok(positions.size > 1, `answer positions: ${[...positions].join(',')}`)
})

test('签名与题型顺序无关', () => {
  const a = quizSignature({
    sourceType: 'book',
    sourceRef: 'b_cet4',
    count: 5,
    types: ['en2cn', 'cloze'],
    level: 'cet4',
  })
  const b = quizSignature({
    sourceType: 'book',
    sourceRef: 'b_cet4',
    count: 5,
    types: ['cloze', 'en2cn'],
    level: 'cet4',
  })
  assert.equal(a, b)
})
