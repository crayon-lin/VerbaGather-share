import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, RotateCcw, Sparkles, X, Zap } from 'lucide-react'
import { api } from '@/lib/api'
import { useSettings } from '@/lib/hooks'
import { SpeakButton } from '@/components/SpeakButton'
import { QuestionBody } from '@/components/QuestionBody'
import { EmptyState } from '@/components/EmptyState'
import { Badge } from '@/components/Badge'
import { toast } from '@/store/ui'
import { cn, firstLine, formatDuration, shuffle } from '@/lib/utils'
import { keyMatches } from '@/lib/shortcuts'
import { speak } from '@/lib/tts'
import { playCorrectSound, playWrongSound } from '@/lib/sound'
import type { Question, QueueItem } from '@shared/types'

const TYPES = ['en2cn', 'cn2en', 'listen', 'spell', 'cloze'] as const

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function clozePrompt(item: QueueItem) {
  if (!item.example_en || !item.term) return ''
  const re = new RegExp(`\\b${escapeRegExp(item.term)}(?:s|es|ed|d|ing|ly|ies)?\\b`, 'i')
  return re.test(item.example_en) ? item.example_en.replace(re, '______') : ''
}

function makeQuestion(item: QueueItem, index: number, seed: number): Question {
  let type = TYPES[(index + seed) % TYPES.length]
  const meaning = firstLine(item.meaning_cn, 80)
  const otherMeanings = (item.distractors?.meanings || []).filter((m) => m && m !== meaning)
  const otherTerms = (item.distractors?.terms || []).filter(
    (t) => t.toLowerCase() !== item.term.toLowerCase(),
  )
  const word = {
    id: item.id,
    term: item.term,
    phonetic: item.phonetic,
    meaning_cn: item.meaning_cn,
    example_en: item.example_en,
    example_cn: item.example_cn,
    state: item.state,
  }
  const cloze = clozePrompt(item)
  if (type === 'cloze' && !cloze) type = 'en2cn'
  if (type === 'spell') {
    return {
      id: `r_${index}`,
      wordId: item.id,
      type,
      prompt: meaning,
      answer: item.term,
      options: [],
      answerIndex: -1,
      word,
    }
  }
  if (type === 'en2cn') {
    const options = shuffle([meaning, ...otherMeanings.slice(0, 3)])
    return {
      id: `r_${index}`,
      wordId: item.id,
      type,
      prompt: item.term,
      answer: meaning,
      options,
      answerIndex: options.indexOf(meaning),
      word,
    }
  }
  const options = shuffle([item.term, ...otherTerms.slice(0, 3)])
  return {
    id: `r_${index}`,
    wordId: item.id,
    type,
    prompt: type === 'listen' ? '' : type === 'cloze' ? cloze : meaning,
    answer: item.term,
    options,
    answerIndex: options.indexOf(item.term),
    word,
  }
}

export default function Review() {
  const [params] = useSearchParams()
  const bookId = params.get('book') || undefined
  const { settings } = useSettings()
  const queryClient = useQueryClient()
  const queue = useQuery({
    queryKey: ['queue', 'review', bookId || 'level'],
    queryFn: () =>
      api.queue({
        mode: 'review',
        bookId,
        limit: Math.min(100, Math.max(10, settings.dailyReview)),
      }),
    staleTime: 0,
  })
  const items = useMemo(() => queue.data?.items ?? [], [queue.data])
  const seed = useRef(Math.floor(Math.random() * TYPES.length)).current
  const decks = useMemo(() => items.map((item, i) => makeQuestion(item, i, seed)), [items, seed])

  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [spell, setSpell] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [correct, setCorrect] = useState(0)
  const [ratings, setRatings] = useState<Record<number, number>>({ 0: 0, 1: 0, 2: 0 })
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  const [cutCount, setCutCount] = useState(0)
  const [done, setDone] = useState(false)
  const shownAt = useRef(Date.now())
  const startedAt = useRef(Date.now())
  const current = decks[index]
  const isCorrect =
    submitted &&
    current &&
    (current.type === 'spell'
      ? spell.trim().toLowerCase() === current.answer.toLowerCase()
      : selected === current.answerIndex)

  useEffect(() => {
    setIndex(0)
    setDone(false)
    setCorrect(0)
    setRatings({ 0: 0, 1: 0, 2: 0 })
    setCombo(0)
    setMaxCombo(0)
    setCutCount(0)
    startedAt.current = Date.now()
  }, [queue.dataUpdatedAt])

  useEffect(() => {
    shownAt.current = Date.now()
    setSelected(null)
    setSpell('')
    setSubmitted(false)
  }, [index, current?.id])

  const autoSpeechText =
    current?.type === 'cloze'
      ? current.prompt.replace(/_{2,}/g, 'blank')
      : current?.type === 'en2cn' || current?.type === 'listen'
        ? current.word.term
        : ''

  useLayoutEffect(() => {
    if (!autoSpeechText || !settings.autoSpeak) return
    speak(autoSpeechText, { accent: settings.ttsAccent, rate: settings.ttsRate })
  }, [index, current?.id, autoSpeechText, settings.autoSpeak, settings.ttsAccent, settings.ttsRate])

  const finish = () => {
    setDone(true)
    queryClient.invalidateQueries({ queryKey: ['stats'] })
    queryClient.invalidateQueries({ queryKey: ['books'] })
  }

  const advance = () => {
    if (index + 1 >= decks.length) finish()
    else setIndex((i) => i + 1)
  }

  const grade = useMutation({
    mutationFn: (rating: number) =>
      api.grade({
        wordId: current.wordId!,
        rating,
        mode: 'review',
        durationMs: Math.min(600000, Date.now() - shownAt.current),
      }),
    onSuccess: (_data, rating) => {
      setRatings((prev) => ({ ...prev, [rating]: (prev[rating] || 0) + 1 }))
      advance()
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  const cut = useMutation({
    mutationFn: () => api.markMastered(current.wordId!),
    onSuccess: () => {
      setCutCount((c) => c + 1)
      toast('已斩掉，这个词归入已掌握')
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      queryClient.invalidateQueries({ queryKey: ['books'] })
      advance()
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  const submit = useCallback(
    (choice: number) => {
      if (!current || submitted) return
      setSelected(choice)
      setSubmitted(true)
      const ok =
        current.type === 'spell'
          ? spell.trim().toLowerCase() === current.answer.toLowerCase()
          : choice === current.answerIndex
      if (ok) {
        playCorrectSound()
        setCorrect((c) => c + 1)
        setCombo((c) => {
          const next = c + 1
          setMaxCombo((m) => Math.max(m, next))
          return next
        })
      } else {
        playWrongSound()
        setCombo(0)
      }
    },
    [current, submitted, spell],
  )

  const rate = useCallback(
    (rating: number) => {
      if (grade.isPending || cut.isPending) return
      grade.mutate(rating)
    },
    [grade, cut.isPending],
  )

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      const optionKeys = [
        settings.shortcutOption1,
        settings.shortcutOption2,
        settings.shortcutOption3,
        settings.shortcutOption4,
      ]
      if (!submitted && current && current.type !== 'spell') {
        const i = optionKeys.findIndex((key) => keyMatches(e.key, key))
        if (i >= 0 && i < current.options.length) {
          submit(i)
          return
        }
      }
      if (submitted && ['1', '2', '3'].includes(e.key)) {
        rate(Number(e.key) - 1)
        return
      }
      if (keyMatches(e.key, settings.shortcutSpeak) && current) {
        const text =
          current.type === 'cloze'
            ? current.prompt.replace(/_{2,}/g, current.answer)
            : current.word.term
        speak(text, { accent: settings.ttsAccent, rate: settings.ttsRate })
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [submitted, current, submit, rate, settings])

  if (queue.isLoading) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="h-[480px] skeleton rounded-3xl" />
      </div>
    )
  }

  if (done || (!decks.length && queue.data)) {
    const total = decks.length
    const elapsed = Date.now() - startedAt.current
    const accuracy = total ? Math.round((correct / total) * 100) : 0
    return (
      <div className="mx-auto max-w-2xl">
        <div className="card overflow-hidden">
          <div className="paper-grain border-b border-line bg-amber-soft/50 px-6 py-10 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-amber text-paper">
              <CheckCircle2 size={26} />
            </span>
            <h1 className="mt-4 serif text-3xl">{done ? '这一轮复习完成' : '暂时没有到期的词'}</h1>
            <p className="mt-2 text-sm text-muted">
              {done
                ? `${accuracy >= 80 ? '记得很稳，继续保持这个节奏。' : '有遗忘很正常，明天它们会再出现。'}${cutCount ? ` 斩掉 ${cutCount} 个。` : ''}`
                : '新词学完后会按间隔安排回来，先休息一下。'}
            </p>
          </div>
          {done && (
            <div className="grid grid-cols-2 divide-x divide-y divide-line sm:grid-cols-5 sm:divide-y-0">
              {[
                { label: '复习词数', value: total },
                { label: '一次答对', value: `${accuracy}%` },
                { label: '最高连对', value: maxCombo },
                { label: '没记住', value: ratings[0] || 0 },
                { label: '用时', value: formatDuration(elapsed) },
              ].map((s) => (
                <div key={s.label} className="px-2 py-5 text-center">
                  <div className="serif text-xl">{s.value}</div>
                  <div className="mt-1 text-[10px] text-muted">{s.label}</div>
                </div>
              ))}
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-2 border-t border-line px-5 py-4">
            {done ? (
              <button
                type="button"
                className="btn btn-primary"
                onClick={() => {
                  setDone(false)
                  queryClient.invalidateQueries({ queryKey: ['queue'] })
                  queue.refetch()
                }}
              >
                <RotateCcw size={15} />
                再来一组
              </button>
            ) : (
              <Link to="/words/learn" className="btn btn-primary">
                去学新词
              </Link>
            )}
            <Link to={bookId ? `/words/books/${bookId}` : '/words'} className="btn btn-ghost">
              回到词书
            </Link>
            <Link to="/" className="btn btn-ghost">
              回首页
            </Link>
          </div>
        </div>
      </div>
    )
  }

  if (!current) {
    return (
      <EmptyState
        icon={<Sparkles size={22} />}
        title="没有待复习的单词"
        description="先学一组新词，或者去做一次测验。"
        action={
          <>
            <Link to="/words/learn" className="btn btn-primary">
              学新词
            </Link>
            <Link to="/words/quiz" className="btn btn-ghost">
              做测验
            </Link>
          </>
        }
      />
    )
  }

  const progress = ((index + (submitted ? 0.5 : 0)) / decks.length) * 100

  return (
    <div className="mx-auto max-w-3xl">
      <div className="flex items-center gap-3">
        <Link
          to={bookId ? `/words/books/${bookId}` : '/words'}
          className="grid h-9 w-9 place-items-center rounded-full border border-line text-muted hover:text-ink"
          aria-label="退出"
        >
          <X size={16} />
        </Link>
        <div className="flex-1">
          <div className="flex items-end justify-between text-[11px] text-muted">
            <span className="flex items-center gap-2">
              复习 · 到期队列
              {combo >= 2 && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-soft px-2 py-0.5 text-[9px] text-amber">
                  <Zap size={10} />
                  连对 {combo}
                </span>
              )}
            </span>
            <span className="tabular-nums">
              {index + 1} / {decks.length}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-amber transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="card mt-5 overflow-hidden">
        <QuestionBody
          question={current}
          selected={selected}
          submitted={submitted}
          spell={spell}
          onSpell={setSpell}
          onSelect={submit}
        />

        {submitted && (
          <div className="border-t border-line bg-surface-2/30 px-5 py-5 animate-fade-up sm:px-7">
            <div className="flex items-start justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="serif text-3xl">{current.word.term}</span>
                  <SpeakButton text={current.word.term} size={17} />
                  <Badge variant={isCorrect ? 'forest' : 'danger'}>
                    {isCorrect ? '答对了' : '再记一次'}
                  </Badge>
                </div>
                <div className="mt-1.5 font-mono text-[11px] text-muted">{current.word.phonetic}</div>
              </div>
            </div>
            <div className="mt-3 whitespace-pre-line text-sm leading-relaxed text-ink-soft">
              {current.word.meaning_cn}
            </div>
            {current.word.example_en && (
              <div className="mt-3 rounded-lg border border-line/70 bg-surface px-3 py-2.5">
                <div className="flex items-start justify-between gap-2">
                  <p className="serif text-[14px] leading-relaxed">{current.word.example_en}</p>
                  <SpeakButton
                    text={current.word.example_en}
                    size={12}
                    label="朗读例句"
                    className="shrink-0"
                  />
                </div>
                <p className="mt-1 text-[11px] text-muted">{current.word.example_cn}</p>
              </div>
            )}
            <div className="mt-4">
              <p className="mb-2 text-[10px] uppercase tracking-[0.12em] text-muted">
                这次记得怎么样？
              </p>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { v: 0, label: '忘记了', cls: 'border-danger/40 text-danger hover:bg-danger-soft' },
                  { v: 1, label: '有点模糊', cls: 'border-amber/40 text-amber hover:bg-amber-soft' },
                  { v: 2, label: '记住了', cls: 'border-forest/40 text-forest hover:bg-forest-soft' },
                ].map((r) => (
                  <button
                    key={r.v}
                    type="button"
                    disabled={grade.isPending}
                    onClick={() => rate(r.v)}
                    className={cn('btn border !py-2.5', r.cls)}
                  >
                    {r.label}
                    <span className="ml-1 font-mono text-[10px] opacity-60">{r.v + 1}</span>
                  </button>
                ))}
              </div>
              <div className="mt-2 flex justify-center">
                <button
                  type="button"
                  disabled={cut.isPending || !current.wordId}
                  onClick={() => cut.mutate()}
                  className="text-[10px] text-muted hover:text-danger hover:underline disabled:opacity-50"
                >
                  这个词已经会了，斩掉（不再复习）
                </button>
              </div>
            </div>
          </div>
        )}
      </div>

      <p className="mt-4 text-center text-[10px] text-muted">
        {submitted ? '答错也请照实评分，复习间隔会自己调整。' : '先作答，再决定记得怎样。'}
      </p>
      <div className="mt-2 flex items-center justify-center gap-3 text-[10px] text-muted/70">
        {!submitted && current.type !== 'spell' && <span>1–4 选择</span>}
        {submitted && <span>1 忘记 · 2 模糊 · 3 记住</span>}
        <span>P 发音</span>
      </div>
    </div>
  )
}
