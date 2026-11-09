import { Volume2 } from 'lucide-react'
import type { Question } from '@shared/types'
import { SpeakButton } from '@/components/SpeakButton'
import { useSettings } from '@/lib/hooks'
import { speak } from '@/lib/tts'
import { cn } from '@/lib/utils'

const TYPE_LABEL: Record<string, string> = {
  en2cn: '看英选中',
  cn2en: '看中选英',
  listen: '听音选词',
  spell: '拼写填空',
  cloze: '例句填空',
  sentence: '句子翻译',
  passage_cloze: '完形填空',
  listening: '听力题干',
  reading: '阅读理解',
}

export function QuestionBody({
  question,
  selected,
  submitted,
  spell,
  onSpell,
  onSelect,
}: {
  question: Question
  selected: number | null
  submitted: boolean
  spell: string
  onSpell: (v: string) => void
  onSelect: (index: number) => void
}) {
  const { settings } = useSettings()
  const isListening = question.type === 'listen'
  const isAudioListening = question.type === 'listening'
  const isSpell = question.type === 'spell'
  const isCloze = question.type === 'cloze'
  const isSentence = question.type === 'sentence'
  const isReading = question.type === 'reading'
  const isPassageCloze = question.type === 'passage_cloze'
  const hasPassage = isReading || isPassageCloze
  const meaning = question.word.meaning_cn.split('\n')[0]
  const blankCount = Math.max(
    1,
    question.blankCount || question.passage?.match(/_{2,}/g)?.length || 1,
  )
  const blankIndex = Math.max(0, Math.min(question.blankIndex ?? 0, blankCount - 1))
  const renderPassage = () => {
    if (!question.passage) return null
    if (!isPassageCloze) return question.passage
    let blank = 0
    return question.passage.split(/(_{2,})/g).map((part, index) => {
      if (!/_{2,}/.test(part)) return <span key={`text-${index}`}>{part}</span>
      const current = blank
      blank += 1
      const active = current === blankIndex
      return (
        <span
          key={`blank-${index}`}
          className={cn(
            'mx-0.5 inline-flex min-w-[2.4rem] items-center justify-center gap-1 rounded-md border px-1.5 align-baseline',
            active
              ? 'border-forest bg-forest-soft text-forest'
              : 'border-line bg-surface-2/60 text-muted',
          )}
        >
          <span className="text-[10px] leading-none">{current + 1}</span>
          <span className="font-medium">
            {submitted && active ? question.answer : '____'}
          </span>
        </span>
      )
    })
  }
  const blankPrompt = question.prompt.replace(/_{2,}/g, 'blank')
  const fullPrompt = question.prompt.replace(/_{2,}/g, question.answer)
  const sentenceNeedsNoTts = isSentence && /[\u4e00-\u9fff]/.test(question.prompt)

  return (
    <div>
      <div className="flex items-center justify-between gap-2 px-5 pt-5 sm:px-7">
        <span className="rounded-full border border-line px-2.5 py-0.5 text-[10px] text-muted">
          {TYPE_LABEL[question.type]}
        </span>
        {isPassageCloze && (
          <span className="rounded-full bg-forest-soft px-2.5 py-0.5 text-[10px] text-forest">
            第 {blankIndex + 1} / {blankCount} 空
          </span>
        )}
        <div className="flex items-center gap-1">
          {isListening ? (
            <button
              type="button"
              onClick={() =>
                speak(question.word.term, { accent: settings.ttsAccent, rate: settings.ttsRate })
              }
              className="inline-flex items-center gap-1.5 rounded-full bg-forest-soft px-3 py-1.5 text-[11px] font-medium text-forest"
            >
              <Volume2 size={14} />
              再听一次
            </button>
          ) : isAudioListening ? (
            <button
              type="button"
              onClick={() =>
                speak(question.audioText || question.prompt, {
                  accent: settings.ttsAccent,
                  rate: settings.ttsRate,
                })
              }
              className="inline-flex items-center gap-1.5 rounded-full bg-forest-soft px-3 py-1.5 text-[11px] font-medium text-forest"
            >
              <Volume2 size={14} />
              播放听力
            </button>
          ) : (
            <>
              {question.type === 'en2cn' && (
                <SpeakButton text={question.word.term} size={14} label="朗读单词" />
              )}
              {isSentence && !sentenceNeedsNoTts && (
                <SpeakButton text={question.prompt} size={14} label="朗读原句" />
              )}
              {hasPassage && question.passage && (
                <SpeakButton text={question.passage} size={14} label="朗读短文" />
              )}
              {isCloze && (
                <SpeakButton
                  text={submitted ? fullPrompt : blankPrompt}
                  size={14}
                  label={submitted ? '朗读完整例句' : '朗读句子（空位读作 blank）'}
                />
              )}
            </>
          )}
        </div>
      </div>

      <div className="px-5 pb-2 pt-7 text-center sm:px-7">
        {isListening ? (
          <button
            type="button"
            onClick={() =>
              speak(question.word.term, { accent: settings.ttsAccent, rate: settings.ttsRate })
            }
            className="mx-auto grid h-20 w-20 place-items-center rounded-full border border-line bg-surface-2 text-forest transition-colors hover:bg-forest-soft"
            aria-label="播放单词"
          >
            <Volume2 size={30} />
          </button>
        ) : (
          <>
            {hasPassage && question.passage && (
              <div className="mx-auto mb-4 max-h-64 max-w-xl overflow-y-auto rounded-xl border border-line bg-surface-2/40 p-4 text-left">
                <p className="eyebrow mb-2">Passage</p>
                <p className="whitespace-pre-wrap serif text-[14px] leading-[1.75] text-ink-soft">
                  {renderPassage()}
                </p>
              </div>
            )}
            <div
              className={cn(
                'text-balance',
                question.type === 'en2cn'
                  ? 'serif text-[40px] leading-tight sm:text-[52px]'
                  : isCloze
                    ? 'mx-auto max-w-xl serif text-[19px] leading-[1.8] sm:text-[21px]'
                    : isSentence || hasPassage || isAudioListening
                      ? 'mx-auto max-w-xl serif text-[19px] leading-[1.8] sm:text-[21px]'
                      : 'serif text-[22px] leading-relaxed sm:text-[26px]',
              )}
            >
              {isCloze
                ? question.prompt.replace(/_{2,}/g, '______')
                : isPassageCloze
                  ? `选择最适合填入第 ${blankIndex + 1} 空的词`
                  : question.prompt}
            </div>
          </>
        )}
        <p className="mt-3 text-[11px] text-muted">
          {isListening
            ? '听发音，选出对应的单词'
            : isAudioListening
              ? '听材料，回答问题'
              : isSpell
                ? '根据释义拼出单词'
                : isCloze
                  ? '选一个词填进句子'
                  : isSentence
                    ? '选择最贴切的译文'
                    : isReading
                      ? '阅读短文，选择正确答案'
                      : isPassageCloze
                        ? `共 ${blankCount} 空，选出最合适的一项`
                        : '选出最合适的一项'}
        </p>
      </div>

      {isSpell ? (
        <div className="mx-auto max-w-md px-5 pb-6 pt-4 sm:px-7">
          <div className="rounded-xl border border-line bg-surface-2/50 px-3 py-2 text-center text-[11px] text-muted">
            首字母 {question.word.term[0]?.toUpperCase()} · 共 {question.word.term.length} 个字母
          </div>
          <input
            value={spell}
            onChange={(e) => onSpell(e.target.value)}
            disabled={submitted}
            autoFocus
            autoComplete="off"
            autoCapitalize="off"
            spellCheck={false}
            placeholder="在这里输入完整单词"
            className={cn(
              'field mt-3 text-center font-mono !text-lg tracking-[0.12em]',
              submitted &&
                (spell.trim().toLowerCase() === question.answer.toLowerCase()
                  ? '!border-forest !bg-forest-soft'
                  : '!border-danger !bg-danger-soft'),
            )}
            onKeyDown={(e) => {
              if (e.key === 'Enter') {
                e.preventDefault()
                onSelect(-1)
              }
            }}
          />
          {!submitted && (
            <button
              type="button"
              onClick={() => onSelect(-1)}
              disabled={!spell.trim()}
              className="btn btn-primary mt-3 w-full"
            >
              确认拼写
            </button>
          )}
          {submitted && (
            <p className="mt-3 text-center text-sm">
              正确答案：
              <span className="serif text-lg text-forest">{question.answer}</span>
            </p>
          )}
        </div>
      ) : (
        <div className="grid gap-2 px-5 pb-6 pt-3 sm:grid-cols-2 sm:px-7">
          {question.options.map((option, i) => {
            const isCorrect = submitted && i === question.answerIndex
            const isWrong = submitted && selected === i && i !== question.answerIndex
            return (
              <button
                key={`${option}-${i}`}
                type="button"
                disabled={submitted}
                onClick={() => onSelect(i)}
                className={cn(
                  'flex items-start gap-3 rounded-xl border px-3.5 py-3 text-left text-[13px] leading-relaxed transition-all',
                  'border-line bg-surface hover:border-line-strong hover:bg-surface-2/50',
                  selected === i && !submitted && '!border-forest !bg-forest-soft text-forest',
                  isCorrect && '!border-forest !bg-forest-soft text-forest',
                  isWrong && '!border-danger !bg-danger-soft text-danger',
                  submitted && !isCorrect && !isWrong && 'opacity-60',
                )}
              >
                <span
                  className={cn(
                    'mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-line text-[10px]',
                    (selected === i || isCorrect) && 'border-current',
                  )}
                >
                  {String.fromCharCode(65 + i)}
                </span>
                <span className={question.type === 'en2cn' ? '' : 'serif text-[15px]'}>{option}</span>
              </button>
            )
          })}
        </div>
      )}

      {submitted && selected === -1 && isSpell && (
        <div className="px-5 pb-5 text-center text-[11px] text-muted sm:px-7">
          你的答案：{spell || '（空）'} · 释义：{meaning}
        </div>
      )}
    </div>
  )
}
