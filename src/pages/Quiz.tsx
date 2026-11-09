import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  BookOpen,
  Check,
  ChevronLeft,
  ClipboardList,
  Loader2,
  Minus,
  Plus,
  RefreshCw,
  Sparkles,
  Trash2,
  Trophy,
  Wand2,
  X,
  Zap,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useSettings } from '@/lib/hooks'
import { PageHeader } from '@/components/PageHeader'
import { QuestionBody } from '@/components/QuestionBody'
import { ProgressRing } from '@/components/ProgressRing'
import { SpeakButton } from '@/components/SpeakButton'
import { EmptyState } from '@/components/EmptyState'
import { toast } from '@/store/ui'
import { cn, levelLabel } from '@/lib/utils'
import { keyMatches, shortcutLabel } from '@/lib/shortcuts'
import { shuffleQuestionOptions } from '@/lib/quiz'
import { speak } from '@/lib/tts'
import { playCorrectSound, playWrongSound } from '@/lib/sound'
import type { Question, QuizSet, QuizSetSummary } from '@shared/types'

const TYPE_OPTIONS = [
  { value: 'en2cn', label: '看英选中' },
  { value: 'cn2en', label: '看中选英' },
  { value: 'cloze', label: '例句填空' },
  { value: 'spell', label: '拼写' },
  { value: 'sentence', label: '句子翻译' },
  { value: 'passage_cloze', label: '完形填空' },
  { value: 'listening', label: '听力题干' },
  { value: 'reading', label: '阅读理解' },
]

const TENDENCY_OPTIONS = [
  { value: 'balanced', label: '均衡' },
  { value: 'meaning', label: '词义为主' },
  { value: 'grammar', label: '语法为主' },
  { value: 'collocation', label: '固定搭配' },
  { value: 'confusion', label: '辨析易混词' },
]

const SPECIFIC_TENDENCIES = ['meaning', 'grammar', 'collocation', 'confusion']

function SelectAllCheckbox({
  checked,
  indeterminate = false,
  onChange,
  label = '全选',
}: {
  checked: boolean
  indeterminate?: boolean
  onChange: (checked: boolean) => void
  label?: string
}) {
  return (
    <button
      type="button"
      role="checkbox"
      aria-checked={indeterminate ? 'mixed' : checked}
      onClick={() => onChange(!checked)}
      className="inline-flex items-center gap-1.5 text-[10px] text-muted transition-colors hover:text-ink"
    >
      <span
        className={cn(
          'grid h-4 w-4 place-items-center rounded border',
          checked || indeterminate ? 'border-forest bg-forest text-paper' : 'border-line',
        )}
      >
        {indeterminate ? <Minus size={10} /> : checked ? <Check size={10} /> : null}
      </span>
      {label}
    </button>
  )
}

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

export default function Quiz() {
  const [params] = useSearchParams()
  const { settings } = useSettings()
  const queryClient = useQueryClient()
  const books = useQuery({ queryKey: ['books'], queryFn: api.books })
  const sets = useQuery({ queryKey: ['quiz-sets'], queryFn: api.quizSets })

  const [tab, setTab] = useState<'create' | 'sets'>('create')
  const [mode, setMode] = useState<'book' | 'word'>('book')
  const [bookId, setBookId] = useState(params.get('book') || '')
  const [word, setWord] = useState('')
  const [countText, setCountText] = useState('5')
  const count = Math.min(50, Math.max(1, Number(countText) || 1))
  const setCountValue = (value: number) => {
    setCountText(String(Math.min(50, Math.max(1, Math.round(value)))))
  }
  const [difficulty, setDifficulty] = useState(3)
  const [types, setTypes] = useState<string[]>(() => TYPE_OPTIONS.map((item) => item.value))
  const [tendencies, setTendencies] = useState<string[]>(() => [...SPECIFIC_TENDENCIES])
  const [phase, setPhase] = useState<'setup' | 'play' | 'done'>('setup')
  const [activeSet, setActiveSet] = useState<QuizSet | null>(null)
  const [questions, setQuestions] = useState<Question[]>([])
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [spell, setSpell] = useState('')
  const [submitted, setSubmitted] = useState(false)
  const [correct, setCorrect] = useState(0)
  const [wrong, setWrong] = useState<Question[]>([])
  const [combo, setCombo] = useState(0)
  const [maxCombo, setMaxCombo] = useState(0)
  const [recorded, setRecorded] = useState(false)
  const [loadingSet, setLoadingSet] = useState('')
  const [redoSet, setRedoSet] = useState<QuizSetSummary | null>(null)
  const [redoTypes, setRedoTypes] = useState<string[]>([])
  const startedAt = useRef(Date.now())

  const aiReady = settings.aiEnabled && Boolean(settings.aiBaseUrl.trim())
  const current = questions[index]
  const setList = sets.data?.items ?? []
  const totalSet = setList.find((set) => set.source_type === 'all')
  const notebooks = setList.filter((set) => set.source_type !== 'all')
  const generatorLabel = (generator: QuizSetSummary['generator']) =>
    generator === 'ai' ? 'AI 出题' : generator === 'mixed' ? 'AI + 本地' : '本地题库'
  const isCorrect =
    submitted &&
    current &&
    (current.type === 'spell'
      ? spell.trim().toLowerCase() === current.answer.toLowerCase()
      : selected === current.answerIndex)

  useEffect(() => {
    if (bookId) return
    const list = books.data?.items ?? []
    const preferred = settings.level === 'cet6' ? 'b_cet6' : 'b_cet4'
    const fallback = list.find((b) => b.total > 0)?.id || ''
    setBookId(list.some((b) => b.id === preferred) ? preferred : fallback)
  }, [books.data, settings.level, bookId])

  const resetPlay = () => {
    setIndex(0)
    setSelected(null)
    setSpell('')
    setSubmitted(false)
    setCorrect(0)
    setWrong([])
    setCombo(0)
    setMaxCombo(0)
    setRecorded(false)
    startedAt.current = Date.now()
  }

  const startSet = (set: QuizSet) => {
    setActiveSet(set)
    setQuestions(set.questions.map((question) => shuffleQuestionOptions(question)))
    resetPlay()
    setPhase('play')
  }

  const generate = useMutation({
    mutationFn: () =>
      api.generateQuizSet({
        bookId: mode === 'book' ? bookId : undefined,
        word: mode === 'word' ? word.trim() : undefined,
        count,
        types,
        difficulty,
        tendencies,
      }),
    onSuccess: (data) => {
      const added = data.added ?? []
      queryClient.invalidateQueries({ queryKey: ['quiz-sets'] })
      if (!added.length) {
        toast('这些题目已经在这本做题本里了，换个题型或词书再试', 'info')
        return
      }
      startSet({ ...data.set, questions: added })
      toast(
        `已累计 ${added.length} 题到「${data.set.source_label}」做题本，总题库同步更新`,
        'info',
      )
      if (data.notice) toast(data.notice, 'info')
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  const record = useMutation({
    mutationFn: (data: { score: number; total: number }) =>
      api.recordQuizAttempt(activeSet!.id, data.score, data.total),
    onSuccess: (res) => {
      setActiveSet((prev) =>
        prev
          ? {
              ...prev,
              attempts: res.attempts,
              last_score: Math.round((correct / Math.max(1, questions.length)) * 100),
              best_score: res.best,
            }
          : prev,
      )
      queryClient.invalidateQueries({ queryKey: ['quiz-sets'] })
    },
  })

  const mistake = useMutation({
    mutationFn: (wordId: string) => api.addMistake(wordId),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['books'] }),
  })

  useEffect(() => {
    if (phase !== 'play' || !current) return
    setSelected(null)
    setSpell('')
    setSubmitted(false)
  }, [index, phase, current?.id])

  const autoSpeechText =
    current?.type === 'cloze'
      ? current.prompt.replace(/_{2,}/g, 'blank')
      : current?.type === 'listening'
        ? current.audioText || ''
        : current?.type === 'sentence'
          ? /[\u4e00-\u9fff]/.test(current.prompt)
            ? ''
            : current.prompt
          : current?.type === 'en2cn' || current?.type === 'listen'
            ? current.word.term
            : ''

  useLayoutEffect(() => {
    if (phase !== 'play' || !autoSpeechText || !settings.autoSpeak) return
    speak(autoSpeechText, { accent: settings.ttsAccent, rate: settings.ttsRate })
  }, [phase, index, current?.id, autoSpeechText, settings.autoSpeak, settings.ttsAccent, settings.ttsRate])

  const submit = (choice: number) => {
    if (!current || submitted) return
    setSelected(choice)
    setSubmitted(true)
    const ok =
      current.type === 'spell'
        ? spell.trim().toLowerCase() === current.answer.toLowerCase()
        : choice === current.answerIndex
    if (ok) {
      setCorrect((c) => c + 1)
      setCombo((c) => {
        const nextCombo = c + 1
        setMaxCombo((value) => Math.max(value, nextCombo))
        return nextCombo
      })
      if (settings.quizSound) playCorrectSound()
    } else {
      setWrong((prev) => [...prev, current])
      setCombo(0)
      if (settings.quizSound) playWrongSound()
      if (current.wordId) mistake.mutate(current.wordId)
    }
  }

  const finish = () => {
    setPhase('done')
    const score = Math.round((correct / Math.max(1, questions.length)) * 100)
    if (activeSet && !recorded) {
      setRecorded(true)
      record.mutate({ score, total: questions.length })
    }
    queryClient.invalidateQueries({ queryKey: ['stats'] })
    queryClient.invalidateQueries({ queryKey: ['books'] })
  }

  const next = () => {
    if (index + 1 >= questions.length) finish()
    else setIndex((i) => i + 1)
  }

  const speakCurrent = () => {
    if (!current) return
    let text = current.word.term
    if (current.type === 'cloze') text = current.prompt.replace(/_{2,}/g, current.answer)
    else if (current.type === 'listening') text = current.audioText || current.prompt
    else if (current.type === 'sentence') {
      if (/[\u4e00-\u9fff]/.test(current.prompt)) return
      text = current.prompt
    } else if (current.type === 'reading' || current.type === 'passage_cloze') {
      text = current.passage || current.prompt
    }
    speak(text, { accent: settings.ttsAccent, rate: settings.ttsRate })
  }

  useEffect(() => {
    const optionKeys = [
      settings.shortcutOption1,
      settings.shortcutOption2,
      settings.shortcutOption3,
      settings.shortcutOption4,
    ]
    const onKey = (e: KeyboardEvent) => {
      if (phase !== 'play') return
      const target = e.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') {
        if (e.key === 'Enter' && current?.type === 'spell' && !submitted) {
          e.preventDefault()
          submit(-1)
        }
        return
      }
      if (!submitted && current && current.type !== 'spell') {
        const optionIndex = optionKeys.findIndex((key) => keyMatches(e.key, key))
        if (optionIndex >= 0 && optionIndex < current.options.length) {
          e.preventDefault()
          submit(optionIndex)
          return
        }
      }
      if (submitted && keyMatches(e.key, settings.shortcutNext)) {
        e.preventDefault()
        next()
        return
      }
      if (keyMatches(e.key, settings.shortcutSpeak) && current) {
        e.preventDefault()
        speakCurrent()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  const openSet = async (id: string) => {
    setLoadingSet(id)
    try {
      const { set } = await api.quizSet(id)
      startSet(set)
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setLoadingSet('')
    }
  }

  const openRedo = (set: QuizSetSummary) => {
    setRedoSet(set)
    setRedoTypes(set.types.length ? set.types : TYPE_OPTIONS.map((item) => item.value))
  }

  const confirmRedo = async () => {
    if (!redoSet || !redoTypes.length) {
      toast('至少选择一种题型', 'info')
      return
    }
    setLoadingSet(redoSet.id)
    try {
      const { set } = await api.quizSet(redoSet.id)
      const filtered = {
        ...set,
        questions: set.questions
          .filter((question) => redoTypes.includes(question.type))
          .map((question) => shuffleQuestionOptions(question)),
      }
      if (!filtered.questions.length) {
        toast('这些题型里暂时没有题目，换一个选择试试', 'info')
        return
      }
      startSet(filtered)
      setRedoSet(null)
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setLoadingSet('')
    }
  }

  const deleteSet = useMutation({
    mutationFn: (id: string) => api.deleteQuizSet(id),
    onSuccess: () => {
      toast('已从做题本删除')
      queryClient.invalidateQueries({ queryKey: ['quiz-sets'] })
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  if (phase === 'setup') {
    const chosenBook = books.data?.items.find((b) => b.id === bookId)
    const redoChoices = redoSet
      ? redoSet.types.length
        ? redoSet.types
        : TYPE_OPTIONS.map((item) => item.value)
      : []
    return (
      <>
      <div className="mx-auto max-w-5xl">
        <PageHeader
          eyebrow="Quiz"
          title="小测"
          description="选一本词书或一个单词，让模型或本地题库出题。同一本词书只保留一本做题本，新题会累计进去；总题库汇总全部题目。"
          back={{ to: '/words', label: '单词本' }}
        />

        <div className="mb-5 flex items-center gap-1.5">
          <button
            type="button"
            onClick={() => setTab('create')}
            className={cn('chip !px-4 !py-1.5', tab === 'create' && 'chip-active')}
          >
            <Wand2 size={13} />
            出题
          </button>
          <button
            type="button"
            onClick={() => setTab('sets')}
            className={cn('chip !px-4 !py-1.5', tab === 'sets' && 'chip-active')}
          >
            <ClipboardList size={13} />
            做题本
            <span className="ml-1 text-[9px] opacity-60">{notebooks.length}</span>
          </button>
        </div>

        {tab === 'create' ? (
          <>
            <div className="card p-5 sm:p-6">
              <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
                <div>
                  <div className="mb-2 flex gap-1.5">
                    <button
                      type="button"
                      onClick={() => setMode('book')}
                      className={cn('chip !py-1.5', mode === 'book' && 'chip-active')}
                    >
                      <BookOpen size={13} />
                      按词书
                    </button>
                    <button
                      type="button"
                      onClick={() => setMode('word')}
                      className={cn('chip !py-1.5', mode === 'word' && 'chip-active')}
                    >
                      <Sparkles size={13} />
                      输入单词
                    </button>
                  </div>

                  {mode === 'book' ? (
                    <>
                      <label className="label" htmlFor="quiz-book">
                        词书
                      </label>
                      <select
                        id="quiz-book"
                        className="field"
                        value={bookId}
                        onChange={(e) => setBookId(e.target.value)}
                      >
                        {(books.data?.items ?? [])
                          .filter((b) => b.total > 0)
                          .map((b) => (
                            <option key={b.id} value={b.id}>
                              {b.name} · {b.total} 词
                            </option>
                          ))}
                      </select>
                      {chosenBook && (
                        <p className="mt-2 text-[10px] text-muted">
                          {levelLabel(chosenBook.level)} · {chosenBook.total} 词，随机抽取并生成 {count} 题。
                        </p>
                      )}
                    </>
                  ) : (
                    <>
                      <label className="label" htmlFor="quiz-word">
                        单词
                      </label>
                      <input
                        id="quiz-word"
                        className="field"
                        placeholder="例如 abandon、serendipity、ephemeral"
                        value={word}
                        onChange={(e) => setWord(e.target.value)}
                      />
                      <p className="mt-2 text-[10px] text-muted">
                        会从本地词典补全音标与释义；多个单词的题目会累计到同一本「单词专项」做题本。
                      </p>
                    </>
                  )}

                  <div className="mt-5">
                    <span className="label">题量</span>
                    <div className="flex flex-wrap items-center gap-2">
                      {[5, 8, 10].map((n) => (
                        <button
                          key={n}
                          type="button"
                          onClick={() => setCountValue(n)}
                          className={cn('chip !px-4 !py-2', count === n && 'chip-active')}
                        >
                          {n} 题
                        </button>
                      ))}
                      <div className="flex items-center gap-1.5">
                        <span className="text-[10px] text-muted">自定义</span>
                        <input
                          type="text"
                          inputMode="numeric"
                          pattern="[0-9]*"
                          value={countText}
                          onChange={(e) => {
                            const raw = e.target.value.replace(/\D/g, '').slice(0, 2)
                            if (!raw) {
                              setCountText('')
                              return
                            }
                            setCountText(String(Math.min(50, Number(raw))))
                          }}
                          onBlur={() => setCountText(String(count))}
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') e.currentTarget.blur()
                          }}
                          className="no-spinner field !w-14 !py-1.5 text-center !text-xs"
                          aria-label="自定义题量，最多 50 题"
                        />
                        <span className="text-[10px] text-muted">题</span>
                      </div>
                    </div>
                    <p className="mt-1.5 text-[10px] text-muted">1–50 题，可直接键盘输入</p>
                  </div>

                  <div className="mt-5">
                    <span className="label">AI 难度</span>
                    <div className="flex flex-wrap gap-1.5">
                      {[
                        { value: 1, label: '基础' },
                        { value: 2, label: '较易' },
                        { value: 3, label: '中等' },
                        { value: 4, label: '较难' },
                        { value: 5, label: '挑战' },
                      ].map((level) => (
                        <button
                          key={level.value}
                          type="button"
                          onClick={() => setDifficulty(level.value)}
                          className={cn(
                            'chip !px-3 !py-1.5',
                            difficulty === level.value && 'chip-active',
                          )}
                        >
                          {level.value} · {level.label}
                        </button>
                      ))}
                    </div>
                    <p className="mt-1.5 text-[10px] text-muted">
                      难度只影响 AI 出题；本地题库保持当前词书的随机难度。
                    </p>
                  </div>

                  <div className="mt-5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="label">题型</span>
                      <SelectAllCheckbox
                        checked={types.length === TYPE_OPTIONS.length}
                        indeterminate={types.length > 0 && types.length < TYPE_OPTIONS.length}
                        onChange={(checked) =>
                          setTypes(checked ? TYPE_OPTIONS.map((item) => item.value) : [])
                        }
                      />
                    </div>
                    <div className="grid gap-2 sm:grid-cols-2">
                      {TYPE_OPTIONS.map((t) => {
                        const active = types.includes(t.value)
                        return (
                          <button
                            key={t.value}
                            type="button"
                            onClick={() =>
                              setTypes((prev) =>
                                prev.includes(t.value)
                                  ? prev.filter((v) => v !== t.value)
                                  : [...prev, t.value],
                              )
                            }
                            className={cn(
                              'flex items-center justify-between rounded-xl border px-3.5 py-2.5 text-left text-sm transition-colors',
                              active
                                ? 'border-forest/40 bg-forest-soft/50 text-ink'
                                : 'border-line text-muted hover:border-line-strong',
                            )}
                          >
                            {t.label}
                            <span
                              className={cn(
                                'grid h-4 w-4 place-items-center rounded border',
                                active ? 'border-forest bg-forest text-paper' : 'border-line',
                              )}
                            >
                              {active && <Check size={11} />}
                            </span>
                          </button>
                        )
                      })}
                    </div>
                  </div>

                  <div className="mt-5">
                    <div className="flex items-center justify-between gap-2">
                      <span className="label">出题倾向</span>
                      <SelectAllCheckbox
                        checked={
                          tendencies.length === SPECIFIC_TENDENCIES.length &&
                          SPECIFIC_TENDENCIES.every((value) => tendencies.includes(value))
                        }
                        indeterminate={
                          tendencies.length > 0 &&
                          tendencies.length < SPECIFIC_TENDENCIES.length &&
                          !tendencies.includes('balanced')
                        }
                        onChange={(checked) => setTendencies(checked ? [...SPECIFIC_TENDENCIES] : [])}
                      />
                    </div>
                    <div className="flex flex-wrap gap-1.5">
                      {TENDENCY_OPTIONS.map((item) => {
                        const active = tendencies.includes(item.value)
                        return (
                          <button
                            key={item.value}
                            type="button"
                            onClick={() =>
                              setTendencies((prev) => {
                                if (item.value === 'balanced') {
                                  return prev.includes('balanced') ? [] : ['balanced']
                                }
                                const withoutBalanced = prev.filter((value) => value !== 'balanced')
                                return withoutBalanced.includes(item.value)
                                  ? withoutBalanced.filter((value) => value !== item.value)
                                  : [...withoutBalanced, item.value]
                              })
                            }
                            className={cn('chip !px-3 !py-1.5', active && 'chip-active')}
                          >
                            {item.label}
                          </button>
                        )
                      })}
                    </div>
                    <p className="mt-1.5 text-[10px] text-muted">
                      可多选；「均衡」与其他选项互斥。倾向只影响 AI 出题，不会改变本地题库。
                    </p>
                  </div>
                </div>

                <div className="rounded-2xl border border-line bg-surface-2/30 p-4">
                  <div className="flex items-center gap-2">
                    <span
                      className={cn(
                        'grid h-8 w-8 place-items-center rounded-full',
                        aiReady ? 'bg-forest-soft text-forest' : 'bg-surface-2 text-muted',
                      )}
                    >
                      <Wand2 size={15} />
                    </span>
                    <div>
                      <div className="text-[12px] font-medium">{aiReady ? 'AI 出题已开启' : '本地题库出题'}</div>
                      <div className="text-[10px] text-muted">
                        {aiReady ? settings.aiModel || 'deepseek-chat' : '在设置中填写模型后可切换'}
                      </div>
                    </div>
                  </div>
                  <p className="mt-3 text-[11px] leading-relaxed text-muted">
                    {aiReady
                      ? '点击生成会调用模型，并把新题追加到对应做题本。同一本词书只保留一本做题本，旧题不会丢；总题库同步汇总。'
                      : '题目由本地词库与释义生成，离线可用；开启 AI 后会优先调用模型，失败自动回退本地。同一本词书只保留一本做题本。'}
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary mt-4 w-full"
                    disabled={generate.isPending || !types.length || (mode === 'word' ? !word.trim() : !bookId)}
                    onClick={() => generate.mutate()}
                  >
                    {generate.isPending ? (
                      <>
                        <Loader2 size={15} className="animate-spin" />
                        正在出题…
                      </>
                    ) : (
                      <>
                        <Wand2 size={15} />
                        生成 {count} 题
                      </>
                    )}
                  </button>
                  {generate.isPending && aiReady && (
                    <p className="mt-2 text-center text-[10px] text-muted">调用模型可能需要几秒钟</p>
                  )}
                </div>
              </div>
            </div>

            <div className="mt-4 grid gap-3 sm:grid-cols-3">
              {[
                { icon: Wand2, title: 'AI / 本地双通道', desc: '模型失败自动回退，不会卡住' },
                { icon: ClipboardList, title: '一本词书一本做题本', desc: '新题累计追加，不再重复建本' },
                { icon: Trophy, title: '总题库汇总', desc: '所有词书 + 单词专项，集中重做' },
              ].map((f) => {
                const Icon = f.icon
                return (
                  <div key={f.title} className="flex items-start gap-3 rounded-xl border border-line bg-paper/85 p-4 backdrop-blur-sm">
                    <Icon size={16} className="mt-0.5 text-forest" />
                    <div>
                      <div className="text-[13px] font-medium">{f.title}</div>
                      <div className="mt-0.5 text-[11px] text-muted">{f.desc}</div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        ) : (
          <>
            {sets.isLoading ? (
              <div className="grid gap-4 sm:grid-cols-2">
                {[0, 1].map((i) => (
                  <div key={i} className="h-40 skeleton rounded-2xl" />
                ))}
              </div>
            ) : (
              <>
                {totalSet && (
                  <div className="card mb-4 overflow-hidden border-forest/30">
                    <div className="flex flex-wrap items-center justify-between gap-4 p-5 sm:p-6">
                      <div className="flex items-start gap-3">
                        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-forest-soft text-forest">
                          <Trophy size={18} />
                        </span>
                        <div>
                          <div className="flex flex-wrap items-center gap-2">
                            <h3 className="serif text-xl">总题库</h3>
                            <span className="rounded-full bg-forest-soft px-2 py-0.5 text-[9px] text-forest">
                              汇总
                            </span>
                          </div>
                          <p className="mt-1 text-[11px] text-muted">
                            所有词书做题本 + 单词专项，共 {totalSet.count} 题
                          </p>
                          <p className="mt-1 text-[10px] text-muted">
                            {totalSet.count
                              ? totalSet.types.map((t) => TYPE_LABEL[t] || t).join(' / ')
                              : '还没有题目，生成后会自动汇总到这里'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-3">
                        <span className="text-right text-[10px] leading-relaxed text-muted">
                          做过 {totalSet.attempts} 次
                          {totalSet.best_score !== null ? (
                            <>
                              <br />
                              最好 {totalSet.best_score}%
                            </>
                          ) : null}
                        </span>
                        <button
                          type="button"
                          className="btn btn-primary !py-2 !text-xs"
                          disabled={!totalSet.count || loadingSet === totalSet.id}
                          onClick={() => openRedo(totalSet)}
                        >
                          {loadingSet === totalSet.id ? (
                            <Loader2 size={13} className="animate-spin" />
                          ) : (
                            <RefreshCw size={13} />
                          )}
                          重做
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {notebooks.length ? (
                  <div className="grid gap-4 sm:grid-cols-2">
                    {notebooks.map((set: QuizSetSummary) => (
                      <div key={set.id} className="card p-5">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <div className="flex flex-wrap items-center gap-1.5">
                              <span
                                className={cn(
                                  'rounded-full px-2 py-0.5 text-[9px]',
                                  set.generator === 'ai'
                                    ? 'bg-forest-soft text-forest'
                                    : set.generator === 'mixed'
                                      ? 'bg-amber-soft text-amber'
                                      : 'bg-surface-2 text-muted',
                                )}
                              >
                                {generatorLabel(set.generator)}
                              </span>
                              <span className="text-[9px] text-muted">{set.source_label}</span>
                            </div>
                            <h3 className="mt-2 serif text-lg leading-snug">{set.title}</h3>
                            <p className="mt-1 text-[10px] text-muted">
                              累计 {set.count} 题 ·{' '}
                              {set.types.map((t) => TYPE_LABEL[t] || t).join(' / ')}
                            </p>
                          </div>
                          <button
                            type="button"
                            onClick={() => {
                              if (window.confirm(`删除「${set.title}」？总题库会同步移除这部分题目。`)) {
                                deleteSet.mutate(set.id)
                              }
                            }}
                            className="grid h-7 w-7 shrink-0 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-danger"
                            aria-label="删除做题本"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                        <div className="mt-4 flex items-center justify-between border-t border-line pt-3 text-[10px] text-muted">
                          <span>
                            做过 {set.attempts} 次
                            {set.last_score !== null ? ` · 上次 ${set.last_score}%` : ''}
                            {set.best_score !== null ? ` · 最好 ${set.best_score}%` : ''}
                          </span>
                          <button
                            type="button"
                            className="btn btn-soft !py-1.5 !text-xs"
                            disabled={loadingSet === set.id || !set.count}
                            onClick={() => openRedo(set)}
                          >
                            {loadingSet === set.id ? (
                              <Loader2 size={13} className="animate-spin" />
                            ) : (
                              <RefreshCw size={13} />
                            )}
                            重做
                          </button>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <EmptyState
                    icon={<ClipboardList size={22} />}
                    title="还没有做题本"
                    description="去「出题」生成一组，系统会按词书自动归并；同一本词书不会再新建第二本。"
                    action={
                      <button type="button" className="btn btn-primary" onClick={() => setTab('create')}>
                        <Plus size={14} />
                        去出题
                      </button>
                    }
                  />
                )}
              </>
            )}
          </>
        )}
      </div>

      {redoSet && (
        <div
          className="fixed inset-0 z-[75] flex items-center justify-center bg-ink/35 px-4 backdrop-blur-[2px]"
          role="dialog"
          aria-modal="true"
          onClick={() => setRedoSet(null)}
        >
          <div
            className="w-full max-w-md rounded-2xl border border-line bg-surface p-5 shadow-[var(--shadow-float)]"
            onClick={(event) => event.stopPropagation()}
          >
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow">Redo</p>
                <h3 className="mt-1 serif text-xl">选择题型重做</h3>
                <p className="mt-1 text-[11px] text-muted">{redoSet.title} · 共 {redoSet.count} 题</p>
              </div>
              <button
                type="button"
                onClick={() => setRedoSet(null)}
                className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
                aria-label="关闭"
              >
                <X size={14} />
              </button>
            </div>

            <div className="mt-4 flex items-center justify-between">
              <span className="label !mb-0">本轮题型</span>
              <SelectAllCheckbox
                checked={
                  redoChoices.length > 0 &&
                  redoChoices.every((type) => redoTypes.includes(type)) &&
                  redoTypes.length === redoChoices.length
                }
                indeterminate={
                  redoTypes.length > 0 && redoTypes.length < redoChoices.length
                }
                onChange={(checked) => setRedoTypes(checked ? redoChoices : [])}
              />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-1.5">
              {redoChoices.map((type) => {
                const active = redoTypes.includes(type)
                return (
                  <button
                    key={type}
                    type="button"
                    onClick={() =>
                      setRedoTypes((prev) =>
                        prev.includes(type)
                          ? prev.filter((value) => value !== type)
                          : [...prev, type],
                      )
                    }
                    className={cn(
                      'flex items-center justify-between rounded-lg border px-2.5 py-2 text-left text-[11px] transition-colors',
                      active
                        ? 'border-forest/40 bg-forest-soft/50 text-ink'
                        : 'border-line text-muted hover:border-line-strong',
                    )}
                  >
                    {TYPE_LABEL[type] || type}
                    <span
                      className={cn(
                        'grid h-4 w-4 place-items-center rounded border',
                        active ? 'border-forest bg-forest text-paper' : 'border-line',
                      )}
                    >
                      {active && <Check size={10} />}
                    </span>
                  </button>
                )
              })}
            </div>

            <p className="mt-3 text-[10px] leading-relaxed text-muted">
              只重做选中的题型，原有做题本和总题库不会被修改。
            </p>
            <div className="mt-4 flex justify-end gap-2">
              <button type="button" className="btn btn-ghost !py-2 !text-xs" onClick={() => setRedoSet(null)}>
                取消
              </button>
              <button
                type="button"
                className="btn btn-primary !py-2 !text-xs"
                disabled={!redoTypes.length || loadingSet === redoSet.id}
                onClick={confirmRedo}
              >
                {loadingSet === redoSet.id ? <Loader2 size={13} className="animate-spin" /> : null}
                开始重做
              </button>
            </div>
          </div>
        </div>
      )}
      </>
    )
  }

  if (phase === 'done') {
    const total = questions.length
    const accuracy = total ? Math.round((correct / total) * 100) : 0
    return (
      <div className="mx-auto max-w-2xl">
        <div className="card overflow-hidden">
          <div className="paper-grain border-b border-line px-6 py-9 text-center">
            <div className="flex justify-center">
              <ProgressRing value={correct} max={total} size={104} stroke={7}>
                <div className="text-center">
                  <div className="serif text-2xl leading-none">{accuracy}%</div>
                  <div className="mt-1 text-[9px] text-muted">正确率</div>
                </div>
              </ProgressRing>
            </div>
            <h1 className="mt-4 serif text-3xl">小测完成</h1>
            <p className="mt-2 text-sm text-muted">
              {accuracy >= 90
                ? '很稳，这批词可以放心了。'
                : accuracy >= 70
                  ? '基础不错，错词再回看一遍。'
                  : '错词已经进错题本，明天优先复习。'}
            </p>
            <p className="mt-1 text-[10px] text-muted">
              {activeSet?.title}
              {activeSet?.best_score !== null ? ` · 最好成绩 ${activeSet?.best_score}%` : ''}
            </p>
          </div>
          <div className="grid grid-cols-3 divide-x divide-line text-center">
            <div className="py-4">
              <div className="serif text-xl">{correct}</div>
              <div className="mt-1 text-[10px] text-muted">答对</div>
            </div>
            <div className="py-4">
              <div className="serif text-xl text-danger">{wrong.length}</div>
              <div className="mt-1 text-[10px] text-muted">答错</div>
            </div>
            <div className="py-4">
              <div className="serif text-xl">{total}</div>
              <div className="mt-1 text-[10px] text-muted">总题数</div>
            </div>
          </div>
          {wrong.length > 0 && (
            <div className="border-t border-line px-5 py-4">
              <p className="eyebrow mb-3">需要再看一眼</p>
              <div className="max-h-64 space-y-2 overflow-y-auto">
                {wrong.map((q) => (
                  <div key={q.id} className="flex items-start justify-between gap-3 rounded-xl bg-surface-2/50 px-3 py-2.5">
                    <div className="min-w-0">
                      <div className="flex items-center gap-2">
                        <span className="serif text-lg">{q.word.term}</span>
                        <SpeakButton text={q.word.term} size={13} />
                      </div>
                      <div className="mt-0.5 line-clamp-2 text-[11px] text-muted">
                        {q.word.meaning_cn}
                      </div>
                    </div>
                    <Link
                      to="/words/books/b_mistakes"
                      className="shrink-0 text-[10px] text-forest hover:underline"
                    >
                      错题本
                    </Link>
                  </div>
                ))}
              </div>
            </div>
          )}
          <div className="flex flex-wrap justify-center gap-2 border-t border-line px-5 py-4">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                resetPlay()
                setPhase('play')
              }}
            >
              <RefreshCw size={15} />
              再做一次（不消耗 token）
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setPhase('setup')
                setActiveSet(null)
                setTab('create')
              }}
            >
              <Plus size={15} />
              继续出题
            </button>
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setPhase('setup')
                setActiveSet(null)
                setTab('sets')
              }}
            >
              打开做题本
            </button>
          </div>
        </div>
      </div>
    )
  }

  if (!current) {
    return (
      <EmptyState
        icon={<ClipboardList size={22} />}
        title="这组题目没有内容"
        description="回到出题页重新生成一组。"
        action={
          <button type="button" className="btn btn-primary" onClick={() => setPhase('setup')}>
            回去出题
          </button>
        }
      />
    )
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col lg:min-h-[calc(100vh-9rem)] lg:justify-center">
      <div className="rounded-2xl border border-line bg-surface/85 p-3.5 shadow-[var(--shadow-card)] backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              if (window.confirm('退出这次小测？已作答的部分不会记录成绩。')) setPhase('setup')
            }}
            className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-ink"
          >
            <ChevronLeft size={14} />
            退出小测
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <span className="serif text-lg">小测</span>
            {activeSet && (
              <span className="max-w-[280px] truncate rounded-full bg-surface-2 px-2 py-0.5 text-[9px] text-muted">
                {generatorLabel(activeSet.generator)} · {activeSet.source_label}
              </span>
            )}
          </div>
          <div className="flex items-center gap-3 text-[10px]">
            <span className="text-forest">答对 {correct}</span>
            <span className="text-danger">答错 {wrong.length}</span>
            {combo >= 2 && (
              <span className="inline-flex items-center gap-0.5 rounded-full bg-amber-soft px-2 py-0.5 text-[9px] text-amber">
                <Zap size={10} />
                连对 {combo}
              </span>
            )}
            <span className="tabular-nums text-muted">
              {index + 1} / {questions.length}
            </span>
          </div>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-forest transition-all duration-300"
            style={{ width: `${((index + (submitted ? 1 : 0)) / questions.length) * 100}%` }}
          />
        </div>
      </div>

      <div className="card mt-4 overflow-hidden border-t-[3px] border-t-forest/40">
        <QuestionBody
          question={current}
          selected={selected}
          submitted={submitted}
          spell={spell}
          onSpell={setSpell}
          onSelect={submit}
        />
        {submitted && (
          <div className="border-t border-line bg-surface-2/30 px-5 py-4 animate-fade-up sm:px-7">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <span className="serif text-2xl">{current.word.term}</span>
                  <SpeakButton text={current.word.term} size={15} />
                  <span
                    className={cn(
                      'rounded-full px-2 py-0.5 text-[10px]',
                      isCorrect ? 'bg-forest-soft text-forest' : 'bg-danger-soft text-danger',
                    )}
                  >
                    {isCorrect ? '答对了' : '答错了，已进错题本'}
                  </span>
                </div>
                <div className="mt-1 text-[11px] text-muted">{current.word.phonetic}</div>
                <div className="mt-1.5 whitespace-pre-line text-sm text-ink-soft">
                  {current.word.meaning_cn}
                </div>
                {current.explanation && (
                  <div className="mt-1.5 text-[10px] leading-relaxed text-muted">
                    {current.explanation}
                  </div>
                )}
                {current.type !== 'cloze' && current.word.example_en && (
                  <div className="mt-1.5 inline-flex items-center gap-1 text-[10px] text-muted">
                    <SpeakButton text={current.word.example_en} size={12} label="朗读例句" />
                    朗读例句
                  </div>
                )}
              </div>
              <button type="button" className="btn btn-primary" onClick={next}>
                {index + 1 >= questions.length ? '查看结果' : '下一题'}
                <ArrowRight size={15} />
              </button>
            </div>
          </div>
        )}
      </div>
      <div className="mx-auto mt-4 flex w-fit max-w-full flex-wrap items-center justify-center gap-2 rounded-full border border-line bg-surface/85 px-4 py-2 text-[10px] text-muted backdrop-blur-sm">
        {submitted ? (
          <>
            <span>{shortcutLabel(settings.shortcutNext)} 下一题</span>
            <span className="text-line-strong">·</span>
            <span>{shortcutLabel(settings.shortcutSpeak)} 朗读</span>
          </>
        ) : current.type === 'spell' ? (
          <>
            <span>输入答案后回车提交</span>
            <span className="text-line-strong">·</span>
            <span>{shortcutLabel(settings.shortcutSpeak)} 朗读</span>
          </>
        ) : (
          <>
            <span>
              {shortcutLabel(settings.shortcutOption1)} / {shortcutLabel(settings.shortcutOption2)} /{' '}
              {shortcutLabel(settings.shortcutOption3)} / {shortcutLabel(settings.shortcutOption4)} 选择答案
            </span>
            <span className="text-line-strong">·</span>
            <span>{shortcutLabel(settings.shortcutSpeak)} 朗读</span>
          </>
        )}
      </div>
    </div>
  )
}
