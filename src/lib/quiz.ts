import type { Question } from '@shared/types'
import { shuffle } from '@/lib/utils'

export function shuffleQuestionOptions(question: Question): Question {
  if (!Array.isArray(question.options) || question.options.length < 2) return question
  if (!Number.isInteger(question.answerIndex) || question.answerIndex < 0) return question
  const correct = question.options[question.answerIndex]
  if (correct === undefined) return question
  const options = shuffle(question.options)
  return { ...question, options, answerIndex: options.indexOf(correct) }
}
