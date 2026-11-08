import { useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, CheckCircle2, Layers, RotateCcw, Sparkles, Volume2, X, Zap } from 'lucide-react'
import { api } from '@/lib/api'
import { useSettings } from '@/lib/hooks'
import { SpeakButton } from '@/components/SpeakButton'
import { Badge } from '@/components/Badge'
import { EmptyState } from '@/components/EmptyState'
import { toast } from '@/store/ui'
import { cn, firstLine, formatDuration, shuffle } from '@/lib/utils'
import { keyMatches, shortcutLabel } from '@/lib/shortcuts'
import { speak } from '@/lib/tts'
import { playCorrectSound, playWrongSound } from '@/lib/sound'
import type { QueueItem } from '@shared/types'

type Feedback = 'correct' | 'mastered' | 'wrong' | 'skip' | null

function escapeRegExp(text: string) {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

function clozeExample(word: { term: string; example_en: string }) {
  if (!word.example_en || !word.term) return ''
  const re = new RegExp(`\\b${escapeRegExp(word.term)}(?:s|es|ed|d|ing|ly|ies)?\\b`, 'i')
  return re.test(word.example_en) ? word.example_en.replace(re, '______') : ''
}

export default function Learn() {
  const [params] = useSearchParams()
  const bookId = params.get('book') || undefined
  const extra = params.get('extra') === '1'
  const { settings } = useSettings()
  const queryClient = useQueryClient()
  const queue = useQuery({
    queryKey: ['queue', 'new', bookId || 'level', extra],
    queryFn: () =>
      api.queue({
        mode: 'new',
        bookId,
        limit: extra ? 10 : Math.min(200, Math.max(1, settings.dailyNew)),
        extra,
      }),
    staleTime: 0,
  })
  const items = queue.data?.items ?? []
  const [deck, setDeck] = useState<QueueItem[]>([])
  const [index, setIndex] = useState(0)
  const [revealed, setRevealed] = useState(false)
  const [answered, setAnswered] = useState(false)
  const [selected, setSelected] = useState<number | null>(null)
  const [mode, setMode] = useState<'quiz' | 'flip'>(() => {
    try {
      return window.localStorage.getItem('inkling-learn-mode') === 'flip' ? 'flip' : 'quiz'
    } catch {
      return 'quiz'
    }
  })
  const [feedback, setFeedback] = useState<Feedback>(null)
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  const [correctSelections, setCorrectSelections] = useState(0)
  const [wrongSelections, setWrongSelections] = useState(0)
  const [cutCount, setCutCount] = useState(0)
  const [attempts, setAttempts] = useState<Record<string, number>>({})
  const [correctCounts, setCorrectCounts] = useState<Record<string, number>>({})
  const [masteredIds, setMasteredIds] = useState<Set<string>>(() => new Set())
  const [done, setDone] = useState(false)
  const shownAt = useRef(Date.now())
  const startedAt = useRef(Date.now())
  const current = deck[index]

  const meaning = current ? firstLine(current.meaning_cn, 80) : ''
  const options = useMemo(() => {
    if (!current) return [] as string[]
    const distractors = (current.distractors?.meanings || []).filter((m) => m && m !== meaning)
    const list = [meaning, ...distractors].filter(Boolean)
    const unique = [...new Set(list)].slice(0, 4)
    return unique.length >= 2 ? shuffle(unique) : []
  }, [current?.id, meaning])

  useEffect(() => {
    setDeck(items)
    setIndex(0)
    setDone(false)
    setRevealed(false)
    setAnswered(false)
    setSelected(null)
    setFeedback(null)
    setCombo(0)
    setMaxCombo(0)
    setCorrectSelections(0)
    setWrongSelections(0)
    setCutCount(0)
    setAttempts({})
    setCorrectCounts({})
    setMasteredIds(new Set())
    startedAt.current = Date.now()
  }, [queue.data?.items])

  useEffect(() => {
    shownAt.current = Date.now()
    setRevealed(false)
    setAnswered(false)
    setSelected(null)
    setFeedback(null)
  }, [index, current?.id])

  useEffect(() => {
    try {
      window.localStorage.setItem('inkling-learn-mode', mode)
    } catch {
      /* 忽略无 localStorage 的环境 */
    }
    setRevealed(false)
    setAnswered(false)
    setSelected(null)
    setFeedback(null)
  }, [mode])

  useLayoutEffect(() => {
    if (current && settings.autoSpeak) {
      speak(current.term, { accent: settings.ttsAccent, rate: settings.ttsRate })
    }
  }, [index, current?.id, settings.autoSpeak, settings.ttsAccent, settings.ttsRate])

  const addMastered = (wordId: string) => {
    setMasteredIds((prev) => {
      const next = new Set(prev)
      next.add(wordId)
      return next
    })
  }

  const finish = () => {
    setDone(true)
    queryClient.invalidateQueries({ queryKey: ['stats'] })
    queryClient.invalidateQueries({ queryKey: ['books'] })
  }

  const advance = () => {
    if (index + 1 >= deck.length) finish()
    else setIndex((i) => i + 1)
  }

  const grade = useMutation({
    mutationFn: (vars: {
      wordId: string
      rating: number
      word?: QueueItem
      reinsertAt?: number
    }) =>
      api.grade({
        wordId: vars.wordId,
        rating: vars.rating,
        mode: 'learn',
        durationMs: Math.min(600000, Date.now() - shownAt.current),
      }),
    onSuccess: (_data, vars) => {
      if (vars.word && vars.reinsertAt !== undefined) {
        setDeck((prev) => {
          const next = [...prev]
          next.splice(Math.min(next.length, vars.reinsertAt!), 0, vars.word!)
          return next
        })
      }
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  const master = useMutation({
    mutationFn: (wordId: string) => api.markMastered(wordId),
    onSuccess: (_data, wordId) => addMastered(wordId),
    onError: (err: Error) => toast(err.message, 'error'),
  })

  const cut = useMutation({
    mutationFn: () => api.markMastered(current!.id),
    onSuccess: () => {
      const wordId = current!.id
      const hasNext = deck.slice(index + 1).some((word) => word.id !== wordId)
      addMastered(wordId)
      setCutCount((c) => c + 1)
      // 已掌握后，把同一张卡后续的复现也移除。
      setDeck((prev) => prev.filter((word, i) => i <= index || word.id !== wordId))
      toast('已斩掉，这个词不再安排复习')
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      queryClient.invalidateQueries({ queryKey: ['books'] })
      if (hasNext) setIndex((i) => i + 1)
      else finish()
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  const applyAnswer = (ok: boolean, choice: number | null) => {
    if (!current || answered) return
    const wordId = current.id
    const attemptNo = (attempts[wordId] || 0) + 1
    const previousCorrect = correctCounts[wordId] || 0
    const nextCorrect = previousCorrect + (ok ? 1 : 0)
    setAttempts((prev) => ({ ...prev, [wordId]: attemptNo }))
    setSelected(choice)
    setAnswered(true)
    setRevealed(true)
    if (ok) {
      playCorrectSound()
      setCorrectSelections((c) => c + 1)
      setCorrectCounts((prev) => ({ ...prev, [wordId]: nextCorrect }))
      setCombo((c) => {
        const next = c + 1
        setMaxCombo((m) => Math.max(m, next))
        return next
      })
      if (nextCorrect >= 2) {
        setFeedback('mastered')
        master.mutate(wordId)
        return
      }
      setFeedback('correct')
      grade.mutate({
        wordId,
        rating: 2,
        word: current,
        reinsertAt: attemptNo < 3 ? index + 5 : undefined,
      })
      return
    }

    playWrongSound()
    setWrongSelections((c) => c + 1)
    setCombo(0)
    setFeedback('wrong')
    grade.mutate({
      wordId,
      rating: 0,
      word: current,
      reinsertAt: attemptNo < 3 ? index + 5 : undefined,
    })
  }

  const choose = (option: string, i: number) => applyAnswer(option === meaning, i)
  const selfReport = (ok: boolean) => applyAnswer(ok, null)

  const reveal = () => {
    if (revealed) return
    setRevealed(true)
    if (mode === 'quiz') setFeedback('skip')
  }

  const speakCurrent = () => {
    if (!current) return
    const text = revealed && current.example_en ? current.example_en : current.term
    speak(text, { accent: settings.ttsAccent, rate: settings.ttsRate })
  }

  const saving = grade.isPending || master.isPending || cut.isPending

  const next = () => {
    if (saving) return
    advance()
  }

  useEffect(() => {
    const optionKeys = [
      settings.shortcutOption1,
      settings.shortcutOption2,
      settings.shortcutOption3,
      settings.shortcutOption4,
    ]
    const onKey = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      const revealKey = keyMatches(e.key, settings.shortcutReveal)
      const nextKey = keyMatches(e.key, settings.shortcutNext)
      const speakKey = keyMatches(e.key, settings.shortcutSpeak)

      if (!revealed) {
        if (mode === 'quiz') {
          const optionIndex = optionKeys.findIndex((key) => keyMatches(e.key, key))
          if (optionIndex >= 0 && optionIndex < options.length) {
            e.preventDefault()
            choose(options[optionIndex], optionIndex)
            return
          }
        }
        if (revealKey || nextKey) {
          e.preventDefault()
          reveal()
          return
        }
      } else if (nextKey) {
        e.preventDefault()
        next()
        return
      }

      if (speakKey && current) {
        e.preventDefault()
        speakCurrent()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  if (queue.isLoading) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="h-[460px] skeleton rounded-3xl" />
      </div>
    )
  }

  if (done || (!items.length && queue.data)) {
    const total = items.length
    const mastered = masteredIds.size
    const elapsed = Date.now() - startedAt.current
    return (
      <div className="mx-auto max-w-2xl">
        <div className="card overflow-hidden">
          <div className="paper-grain border-b border-line bg-forest-soft/50 px-6 py-10 text-center">
            <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-forest text-paper">
              <CheckCircle2 size={26} />
            </span>
            <h1 className="mt-4 serif text-3xl">{done ? '这一组学完了' : '今天的新词已经够了'}</h1>
            <p className="mt-2 text-sm text-muted">
              {done
                ? mastered >= total
                  ? '两次答对，全部掌握。接下来交给复习。'
                  : '还有词没拿到两次答对，它们会进入复习继续出现。'
                : queue.data?.counts.newRemaining === 0
                  ? '想多学一点也可以，但别让复习欠账。'
                  : '这本词书暂时没有新词了。'}
            </p>
          </div>
          {done ? (
            <div className="grid grid-cols-2 divide-x divide-y divide-line sm:grid-cols-5 sm:divide-y-0">
              {[
                { label: '本组词数', value: total },
                { label: '已掌握', value: `${mastered} / ${total}` },
                { label: '答对次数', value: correctSelections },
                { label: '答错次数', value: wrongSelections },
                { label: '用时', value: formatDuration(elapsed) },
              ].map((s) => (
                <div key={s.label} className="px-2 py-5 text-center">
                  <div className="serif text-xl">{s.value}</div>
                  <div className="mt-1 text-[9px] text-muted">{s.label}</div>
                </div>
              ))}
            </div>
          ) : (
            <div className="px-6 py-8 text-center">
              <p className="text-sm text-ink-soft">
                今日新学 {queue.data?.daily.newWords} / {settings.dailyNew}，到期复习{' '}
                {queue.data?.counts.due} 个。
              </p>
              {cutCount > 0 && <p className="mt-2 text-[11px] text-muted">本次直接斩掉 {cutCount} 个</p>}
            </div>
          )}
          {cutCount > 0 && done && (
            <p className="border-t border-line px-4 py-2 text-center text-[10px] text-muted">
              其中直接斩掉 {cutCount} 个
            </p>
          )}
          <div className="flex flex-wrap justify-center gap-2 border-t border-line px-5 py-4">
            {queue.data?.counts.due ? (
              <Link to={`/words/review${bookId ? `?book=${bookId}` : ''}`} className="btn btn-primary">
                <RotateCcw size={15} />
                去复习 {queue.data.counts.due} 个
              </Link>
            ) : (
              <Link to={bookId ? `/words/books/${bookId}` : '/words'} className="btn btn-primary">
                回到词书
              </Link>
            )}
            {queue.data?.counts.newRemaining === 0 && (
              <Link
                to={`/words/learn?extra=1${bookId ? `&book=${bookId}` : ''}`}
                className="btn btn-ghost"
              >
                再学 10 个
              </Link>
            )}
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
        title="没有可学的新词"
        description="换一本词书，或者先去复习到期的卡片。"
        action={
          <>
            <Link to="/words" className="btn btn-primary">
              选一本词书
            </Link>
            <Link to="/words/review" className="btn btn-ghost">
              去复习
            </Link>
          </>
        }
      />
    )
  }

  const progress = ((index + (revealed ? 0.5 : 0)) / Math.max(1, deck.length)) * 100
  const cloze = clozeExample(current)
  const answerCount = correctCounts[current.id] || 0

  return (
    <div className="mx-auto flex max-w-3xl flex-col lg:min-h-[calc(100vh-9rem)] lg:justify-center">
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
              新学 · {settings.level === 'cet4' ? '四级' : settings.level === 'cet6' ? '六级' : '全部'}
              {combo >= 2 && (
                <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-soft px-2 py-0.5 text-[9px] text-amber">
                  <Zap size={10} />
                  连对 {combo}
                </span>
              )}
            </span>
            <span className="tabular-nums">
              {index + 1} / {deck.length}
            </span>
          </div>
          <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
            <div
              className="h-full rounded-full bg-forest transition-all duration-300"
              style={{ width: `${progress}%` }}
            />
          </div>
        </div>
      </div>

      <div className="card mt-5 overflow-hidden">
        <div className="flex items-start justify-between px-5 pt-5 sm:px-7">
          <div className="flex flex-wrap items-center gap-2">
            <Badge variant="forest">新词</Badge>
            <button
              type="button"
              onClick={() => setMode(mode === 'quiz' ? 'flip' : 'quiz')}
              title="切换经典闪卡模式"
              className="inline-flex items-center gap-1 rounded-full border border-line px-2 py-0.5 text-[9px] text-muted hover:border-line-strong hover:text-ink"
            >
              <Layers size={10} />
              {mode === 'quiz' ? '翻转模式' : '测义模式'}
            </button>
            {feedback && (
              <Badge
                variant={
                  feedback === 'wrong'
                    ? 'danger'
                    : feedback === 'skip'
                      ? 'amber'
                      : 'forest'
                }
              >
                {feedback === 'correct'
                  ? `${mode === 'flip' ? '记住' : '答对'} ${answerCount}/2`
                  : feedback === 'mastered'
                    ? '已掌握'
                    : feedback === 'wrong'
                      ? '答错了'
                      : '看答案'}
              </Badge>
            )}
          </div>
          <div className="flex items-center gap-1">
            <SpeakButton text={current.term} size={18} accent="en-US" label="美式发音" />
            <SpeakButton text={current.term} size={18} accent="en-GB" label="英式发音" />
          </div>
        </div>

        <div className="px-5 pb-4 pt-7 text-center sm:px-10">
          <h1 className="serif text-[44px] leading-tight tracking-tight sm:text-[56px]">{current.term}</h1>
          <div className="mt-2.5 flex items-center justify-center gap-2 font-mono text-xs text-muted">
            {current.phonetic || '—'}
            {current.collins >= 3 && (
              <span className="rounded-full bg-amber-soft px-1.5 py-0.5 font-sans text-[9px] text-amber">
                高频
              </span>
            )}
          </div>
          {cloze && !revealed && mode === 'quiz' && (
            <p className="mx-auto mt-5 max-w-lg rounded-xl bg-surface-2/50 px-4 py-3 serif text-[15px] leading-relaxed text-ink-soft">
              {cloze}
            </p>
          )}
        </div>

        {!revealed ? (
          mode === 'flip' ? (
            <div className="px-5 pb-6 text-center sm:px-7">
              <p className="text-[11px] text-muted">经典闪卡 · 先回想，再翻面</p>
              <button type="button" onClick={reveal} className="btn btn-primary mt-4 !py-2.5">
                翻面看释义
                <ArrowRight size={14} className="rotate-90" />
              </button>
              <p className="mt-3 text-[10px] text-muted/70">
                {shortcutLabel(settings.shortcutReveal)} / {shortcutLabel(settings.shortcutNext)} 翻面
              </p>
            </div>
          ) : (
            <div className="px-5 pb-5 sm:px-7">
              {options.length ? (
                <>
                  <p className="mb-2 text-center text-[10px] uppercase tracking-[0.14em] text-muted">
                    选一个最接近的释义，答对 2 次即掌握
                  </p>
                  <div className="grid gap-2 sm:grid-cols-2">
                    {options.map((option, i) => (
                      <button
                        key={option}
                        type="button"
                        onClick={() => choose(option, i)}
                        className="flex items-start gap-2.5 rounded-xl border border-line bg-surface px-3.5 py-3 text-left text-[12.5px] leading-relaxed text-ink-soft transition-colors hover:border-line-strong hover:bg-surface-2/50"
                      >
                        <span className="mt-0.5 grid h-5 w-5 shrink-0 place-items-center rounded-full border border-line text-[10px] text-muted">
                          {String.fromCharCode(65 + i)}
                        </span>
                        {option}
                      </button>
                    ))}
                  </div>
                  <button
                    type="button"
                    onClick={reveal}
                    className="mx-auto mt-4 block text-[11px] text-muted hover:text-ink"
                  >
                    不想选，直接看释义
                  </button>
                </>
              ) : (
                <button type="button" onClick={reveal} className="btn btn-primary w-full !py-3">
                  显示释义
                </button>
              )}
            </div>
          )
        ) : (
          <div className="animate-fade-up px-5 pb-4 sm:px-7">
            <div className="mb-4 text-center text-[11px] leading-relaxed">
              {feedback === 'correct' && (
                <span className="text-forest">
                  {mode === 'flip' ? '记住 1 次' : '答对 1 次'}。再正确一次，就可以把「{current.term}」标记为掌握。
                </span>
              )}
              {feedback === 'mastered' && (
                <span className="text-forest">
                  {mode === 'flip' ? '两次记住' : '两次答对'}，已把「{current.term}」标记为掌握。
                </span>
              )}
              {feedback === 'wrong' && (
                <span className="text-danger">
                  这次不计入正确次数
                  {selected !== null ? `，你选了「${options[selected]}」` : ''}。正确答案：{meaning}
                </span>
              )}
              {feedback === 'skip' && <span className="text-muted">未作答，本次不计入正确次数。</span>}
            </div>
            {answered && selected !== null && feedback === 'mastered' && (
              <div className="mb-3 text-center text-[10px] text-muted">
                你选了 <span className="text-forest">{options[selected]}</span>
              </div>
            )}
            <div className="mx-auto max-w-lg">
              <div className="whitespace-pre-line text-center text-[17px] leading-relaxed text-ink">
                {current.meaning_cn || '暂无释义'}
              </div>
              {current.pos && <div className="mt-1.5 text-center text-[11px] text-muted">{current.pos}</div>}
              {current.example_en && (
                <div className="mt-4 rounded-xl bg-surface-2/60 p-4 text-left">
                  <p className="eyebrow mb-1">Example</p>
                  <p className="serif text-[15px] leading-relaxed text-ink">{current.example_en}</p>
                  <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{current.example_cn}</p>
                </div>
              )}
              {current.exchange && (
                <div className="mt-3 text-[10px] text-muted">词形：{current.exchange}</div>
              )}
              {current.meaning_en && (
                <details className="mt-3 text-[10px] text-muted">
                  <summary className="cursor-pointer">英文释义</summary>
                  <p className="mt-1 leading-relaxed">{current.meaning_en}</p>
                </details>
              )}
            </div>
          </div>
        )}

        <div className="border-t border-line px-5 py-4 sm:px-7">
          {!revealed ? (
            <div className="flex items-center justify-center gap-2 text-[10px] text-muted">
              <Volume2 size={12} />
              先在心里回想，再选择或翻开
              <kbd className="rounded border border-line px-1 font-mono text-[9px]">Space</kbd>
            </div>
          ) : mode === 'flip' && !answered ? (
            <>
              <div className="grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => selfReport(false)}
                  className="btn border !border-danger/40 !py-3 text-danger hover:bg-danger-soft"
                >
                  还没记住
                </button>
                <button
                  type="button"
                  onClick={() => selfReport(true)}
                  className="btn border !border-forest/40 !py-3 text-forest hover:bg-forest-soft"
                >
                  记住了
                </button>
              </div>
              <p className="mt-2 text-center text-[10px] text-muted">
                连续两次「记住了」自动掌握；「还没记住」不计入正确次数
              </p>
              <div className="mt-1 flex justify-center">
                <button
                  type="button"
                  onClick={() => cut.mutate()}
                  className="text-[10px] text-muted hover:text-danger hover:underline"
                >
                  这个词已经会了，斩掉
                </button>
              </div>
            </>
          ) : (
            <>
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-1.5 text-[10px] text-muted">
                  掌握进度
                  <span className={cn('h-1.5 w-6 rounded-full', answerCount >= 2 ? 'bg-forest' : 'bg-surface-2')} />
                  <span className={cn('h-1.5 w-6 rounded-full', answerCount >= 1 ? 'bg-forest' : 'bg-surface-2')} />
                  <span className="ml-1">{Math.min(2, answerCount)} / 2</span>
                </div>
                <button type="button" className="btn btn-primary" disabled={saving} onClick={next}>
                  {saving ? '保存中…' : '继续'}
                  <ArrowRight size={15} />
                </button>
              </div>
              <div className="mt-2 flex justify-center">
                {feedback !== 'mastered' && (
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => cut.mutate()}
                    className="text-[10px] text-muted hover:text-danger hover:underline disabled:opacity-50"
                  >
                    这个词已经会了，斩掉
                  </button>
                )}
              </div>
            </>
          )}
        </div>
      </div>

      <div className="mx-auto mt-3 w-fit max-w-full rounded-2xl bg-paper/85 px-3 py-2 backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-center gap-3 text-[10px] text-muted">
          {!revealed ? (
            mode === 'flip' ? (
              <>
                <span>{shortcutLabel(settings.shortcutReveal)} / {shortcutLabel(settings.shortcutNext)} 翻面</span>
                <span>点击卡片下方按钮也可以</span>
              </>
            ) : (
              <>
                <span>
                  A {shortcutLabel(settings.shortcutOption1)} · B {shortcutLabel(settings.shortcutOption2)} · C{' '}
                  {shortcutLabel(settings.shortcutOption3)} · D {shortcutLabel(settings.shortcutOption4)}
                </span>
                <span>{shortcutLabel(settings.shortcutReveal)} 看释义</span>
              </>
            )
          ) : mode === 'flip' && !answered ? (
            <>
              <span>选择「记住了 / 还没记住」</span>
              <span>{shortcutLabel(settings.shortcutNext)} 跳过</span>
            </>
          ) : (
            <>
              <span>正确 2 次自动掌握</span>
              <span>错题不计入次数</span>
              <span>{shortcutLabel(settings.shortcutNext)} 继续</span>
            </>
          )}
          <span>{shortcutLabel(settings.shortcutSpeak)} 发音 / 句子</span>
        </div>
        {deck[index + 1] && (
          <p className="mt-1 text-center text-[10px] text-muted/70">
            下一个 · {deck[index + 1].term}
          </p>
        )}
      </div>
    </div>
  )
}
