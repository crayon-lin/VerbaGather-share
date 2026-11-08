import test from 'node:test'
import assert from 'node:assert/strict'
import { scheduleWord } from '../server/lib/srs.mjs'

const NOW = new Date('2026-01-01T00:00:00.000Z')

test('新词选择“认识”后进入 1 天间隔', () => {
  const next = scheduleWord(null, 2, NOW)
  assert.equal(next.state, 'review')
  assert.equal(next.interval_days, 1)
  assert.equal(next.reps, 1)
  assert.equal(next.due_at, '2026-01-02T00:00:00.000Z')
  assert.equal(next.ease, 2.5)
})

test('“不认识”回到 10 分钟后的学习状态', () => {
  const next = scheduleWord({ ease: 2.5, interval_days: 7, reps: 3, state: 'review' }, 0, NOW)
  assert.equal(next.state, 'learning')
  assert.equal(next.interval_days, 0.0069)
  assert.equal(next.lapses, 1)
  assert.equal(next.wrong, 1)
  assert.equal(next.ease, 2.3)
  assert.equal(next.due_at, '2026-01-01T00:10:00.000Z')
})

test('“模糊”从新词进入半天间隔', () => {
  const next = scheduleWord(null, 1, NOW)
  assert.equal(next.interval_days, 0.5)
  assert.equal(next.state, 'learning')
  assert.equal(next.ease, 2.45)
})

test('连续“认识”按 ease 放大间隔，并达到掌握', () => {
  const prev = { ease: 2.5, interval_days: 30, reps: 2, state: 'review' }
  const next = scheduleWord(prev, 2, NOW)
  assert.equal(next.interval_days, 75)
  assert.equal(next.reps, 3)
  assert.equal(next.state, 'mastered')
})

test('“太简单”提升 ease 且间隔额外放大', () => {
  const prev = { ease: 2.9, interval_days: 1, reps: 1, state: 'review' }
  const next = scheduleWord(prev, 3, NOW)
  assert.equal(next.interval_days, Math.round(1 * 2.9 * 1.3 * 10000) / 10000)
  assert.equal(next.ease, 3.0)
  assert.equal(next.correct, 1)
})

test('间隔上限 365 天', () => {
  const prev = { ease: 2.5, interval_days: 300, reps: 3, state: 'review' }
  const next = scheduleWord(prev, 3, NOW)
  assert.equal(next.interval_days, 365)
  assert.equal(next.state, 'mastered')
})

test('学习记录累加，不因重置间隔而丢失', () => {
  const prev = { ease: 2.5, interval_days: 3, reps: 2, state: 'review', correct: 4, wrong: 1 }
  const next = scheduleWord(prev, 2, NOW)
  assert.equal(next.correct, 5)
  assert.equal(next.wrong, 1)
})
