import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  ChevronLeft,
  Clock3,
  FileJson,
  FileText,
  Loader2,
  RefreshCw,
  ScrollText,
  Sparkles,
  Trash2,
  Upload,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useSettings } from '@/lib/hooks'
import { PageHeader } from '@/components/PageHeader'
import { QuestionBody } from '@/components/QuestionBody'
import { ProgressRing } from '@/components/ProgressRing'
import { Modal } from '@/components/Modal'
import { toast } from '@/store/ui'
import { cn, levelLabel, shuffle } from '@/lib/utils'
import { keyMatches } from '@/lib/shortcuts'
import type { EssaySummary, Question, QuestionType, Sentence } from '@shared/types'

type PaperPhase = 'library' | 'loading' | 'run' | 'done'

interface Paper {
  id: string
  title: string
  level: 'cet4' | 'cet6'
  writingPrompt: string
  questions: Question[]
  isCustom?: boolean
}

const PAPER_QUESTION_TYPES: QuestionType[] = [
  'en2cn',
  'cn2en',
  'listen',
  'cloze',
  'sentence',
  'passage_cloze',
  'listening',
  'reading',
]

const PAPER_OPTIONS = [
  {
    id: 'paper-cet4-1',
    level: 'cet4' as const,
    title: 'CET-4 真题模考 · 套卷一',
    description: '按四六级真题结构组合：听力、阅读、句子翻译与写作。',
  },
  {
    id: 'paper-cet4-2',
    level: 'cet4' as const,
    title: 'CET-4 真题模考 · 套卷二',
    description: '换一组本地语料，练同一套题型的节奏与时间分配。',
  },
  {
    id: 'paper-cet6-1',
    level: 'cet6' as const,
    title: 'CET-6 真题模考 · 套卷一',
    description: '六级难度套卷，适合考前完整走一遍题型和节奏。',
  },
  {
    id: 'paper-cet6-2',
    level: 'cet6' as const,
    title: 'CET-6 真题模考 · 套卷二',
    description: '换一组六级语料，集中练阅读、翻译和听力。',
  },
]

const TYPE_LABEL: Record<string, string> = {
  listening: '听力',
  reading: '阅读',
  sentence: '翻译',
  passage_cloze: '完形',
  en2cn: '词义',
  cn2en: '词义',
}

function baseWord(text: string): Question['word'] {
  return {
    id: 'paper',
    term: text.slice(0, 60),
    phonetic: '',
    meaning_cn: text,
    example_en: '',
    example_cn: '',
  }
}

function pickOptions(correct: string, pool: string[], n = 4) {
  const wrong = shuffle(pool.filter((value) => value && value !== correct)).slice(0, n - 1)
  return shuffle([correct, ...wrong])
}

function buildListening(sentence: Sentence, pool: Sentence[], order: number): Question {
  const options = pickOptions(
    sentence.text_cn,
    pool.map((item) => item.text_cn),
  )
  return {
    id: `paper-listening-${order}`,
    wordId: null,
    type: 'listening',
    prompt: '听句子，选择最接近的中文意思',
    answer: sentence.text_cn,
    options,
    answerIndex: options.indexOf(sentence.text_cn),
    audioText: sentence.text_en,
    word: baseWord(sentence.text_en),
    explanation: sentence.text_en,
  }
}

function buildTranslation(sentence: Sentence, pool: Sentence[], order: number): Question {
  const options = pickOptions(
    sentence.text_en,
    pool.map((item) => item.text_en),
  )
  return {
    id: `paper-sentence-${order}`,
    wordId: null,
    type: 'sentence',
    prompt: sentence.text_cn,
    answer: sentence.text_en,
    options,
    answerIndex: options.indexOf(sentence.text_en),
    word: baseWord(sentence.text_en),
    explanation: sentence.text_en,
  }
}

function buildReading(essay: EssaySummary, titles: string[], order: number): Question | null {
  const passage = essay.firstParagraph || essay.excerpt
  if (!passage) return null
  const options = pickOptions(essay.title_en, titles)
  return {
    id: `paper-reading-${order}`,
    wordId: null,
    type: 'reading',
    passage,
    prompt: 'What is the passage mainly about?',
    answer: essay.title_en,
    options,
    answerIndex: options.indexOf(essay.title_en),
    word: baseWord(essay.title_en),
    explanation: essay.title_cn,
  }
}

function parseImportedPapers(text: string, fallbackLevel: 'cet4' | 'cet6'): Paper[] {
  const payload = JSON.parse(text)
  const list = Array.isArray(payload) ? payload : Array.isArray(payload?.papers) ? payload.papers : [payload]
  const out: Paper[] = []
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue
    const title = String(raw.title || raw.name || '').trim()
    if (!title) continue
    const level = raw.level === 'cet6' ? 'cet6' : raw.level === 'cet4' ? 'cet4' : fallbackLevel
    const questionsRaw = Array.isArray(raw.questions) ? raw.questions : []
    const questions: Question[] = []
    for (const [index, item] of questionsRaw.entries()) {
      if (!item || typeof item !== 'object') continue
      const type = String(item.type || '') as QuestionType
      if (!PAPER_QUESTION_TYPES.includes(type)) continue
      const options = Array.isArray(item.options)
        ? item.options.map((option: unknown) => String(option).trim()).filter(Boolean).slice(0, 6)
        : []
      const answerIndex = Number(item.answerIndex)
      if (type !== 'spell' && (options.length < 2 || !Number.isInteger(answerIndex) || answerIndex < 0 || answerIndex >= options.length)) {
        continue
      }
      const prompt = String(item.prompt || '').trim()
      const passage = String(item.passage || '').trim()
      const audioText = String(item.audioText || '').trim()
      if (['reading', 'passage_cloze'].includes(type) && !passage) continue
      if (type === 'listening' && !audioText) continue
      if (!prompt && type !== 'spell') continue
      questions.push({
        id: String(item.id || `import-${out.length}-${index}`),
        wordId: null,
        type,
        prompt,
        answer: String(item.answer || options[answerIndex] || '').trim(),
        options,
        answerIndex: type === 'spell' ? -1 : answerIndex,
        ...(passage ? { passage } : {}),
        ...(audioText ? { audioText } : {}),
        explanation: String(item.explanation || '').trim(),
        word: item.word && typeof item.word === 'object' ? (item.word as Question['word']) : baseWord(prompt || title),
      })
    }
    if (!questions.length) continue
    out.push({
      id: `custom-paper-${Date.now()}-${out.length}`,
      title,
      level,
      writingPrompt: String(raw.writingPrompt || raw.writing_prompt || '').trim(),
      questions,
      isCustom: true,
    })
  }
  return out
}

export default function Papers() {
  const { settings } = useSettings()
  const [phase, setPhase] = useState<PaperPhase>('library')
  const [paper, setPaper] = useState<Paper | null>(null)
  const [level, setLevel] = useState<'cet4' | 'cet6'>(
    settings.level === 'cet6' ? 'cet6' : 'cet4',
  )
  const [index, setIndex] = useState(0)
  const [selected, setSelected] = useState<number | null>(null)
  const [submitted, setSubmitted] = useState(false)
  const [correct, setCorrect] = useState(0)
  const [wrong, setWrong] = useState<Question[]>([])
  const [loading, setLoading] = useState(false)
  const [writingOpen, setWritingOpen] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [importText, setImportText] = useState('')
  const [importRows, setImportRows] = useState<Paper[]>([])
  const [importBusy, setImportBusy] = useState(false)
  const importFileRef = useRef<HTMLInputElement>(null)
  const queryClient = useQueryClient()
  const papersQuery = useQuery({ queryKey: ['papers'], queryFn: api.papers })
  const customPapers = (papersQuery.data?.items ?? []).map((item) => ({
    ...item,
    isCustom: true as const,
  }))

  const current = paper?.questions[index]

  const saveImported = useMutation({
    mutationFn: () =>
      api.importPapers(
        importRows.map((item) => ({
          title: item.title,
          level: item.level,
          writingPrompt: item.writingPrompt,
          questions: item.questions,
        })),
      ),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ['papers'] })
      toast(`已导入 ${res.created} 套真题`)
      setImportRows([])
      setImportText('')
      setImportOpen(false)
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  const removePaper = useMutation({
    mutationFn: (id: string) => api.deletePaper(id),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['papers'] })
      toast('已删除导入的真题')
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  const addCustomPapers = (papers: Paper[]) => {
    if (!papers.length) {
      toast('没有解析到可用套卷，请检查 title 和 questions', 'error')
      return
    }
    setImportRows((prev) => [...prev, ...papers])
    setImportText('')
    toast(`识别到 ${papers.length} 套真题，确认后导入`)
  }

  const importCustom = () => {
    try {
      addCustomPapers(parseImportedPapers(importText, level))
    } catch (err) {
      toast(`JSON 解析失败：${(err as Error).message}`, 'error')
    }
  }

  const importFile = async (file: File) => {
    setImportBusy(true)
    try {
      const text = await file.text()
      addCustomPapers(parseImportedPapers(text, level))
    } catch (err) {
      toast(`读取失败：${(err as Error).message}`, 'error')
    } finally {
      setImportBusy(false)
      if (importFileRef.current) importFileRef.current.value = ''
    }
  }

  const removeCustomPaper = (id: string) => {
    if (!window.confirm('删除这套导入的真题？')) return
    removePaper.mutate(id)
  }

  const startCustomPaper = (item: Paper) => {
    setPaper(item)
    setIndex(0)
    setSelected(null)
    setSubmitted(false)
    setCorrect(0)
    setWrong([])
    setWritingOpen(false)
    setPhase('run')
  }

  const buildPaper = async (paperLevel: 'cet4' | 'cet6', paperTitle: string) => {
    setLoading(true)
    setPhase('loading')
    try {
      const [sentenceRes, essayRes] = await Promise.all([
        api.sentences({ level: paperLevel }),
        api.essays({ level: paperLevel }),
      ])
      const sentences = sentenceRes.items.filter((item) => item.text_en && item.text_cn)
      const essays = essayRes.items
      if (sentences.length < 8 || essays.length < 4) {
        toast('本地内容不足，暂时无法组合这套真题', 'info')
        setPhase('library')
        return
      }

      const sentencePool = shuffle(sentences).slice(0, 8)
      const essayTitles = essays.map((essay) => essay.title_en).filter(Boolean)
      const readingPool = essays.slice(0, 4)
      const questions: Question[] = []

      // 听力：用句子音频 + 中文理解选项
      sentencePool.slice(0, 3).forEach((sentence, i) => {
        questions.push(buildListening(sentence, sentencePool, i))
      })
      // 阅读：首段 + 主旨题
      readingPool.slice(0, 2).forEach((essay, i) => {
        const question = buildReading(essay, essayTitles, i)
        if (question) questions.push(question)
      })
      // 翻译：中文原句 + 英文译文选项
      sentencePool.slice(3, 5).forEach((sentence, i) => {
        questions.push(buildTranslation(sentence, sentencePool, i))
      })

      if (!questions.length) {
        toast('这套卷暂时没有可用题目', 'error')
        setPhase('library')
        return
      }

      const writingPrompt =
        essays.find((essay) => essay.prompt_en || essay.prompt_cn)?.prompt_en ||
        essays.find((essay) => essay.prompt_cn)?.prompt_cn ||
        'Write a short essay on a topic related to college life.'

      setPaper({
        id: `paper-${paperLevel}-local`,
        title: paperTitle,
        level: paperLevel,
        writingPrompt,
        questions,
      })
      setIndex(0)
      setSelected(null)
      setSubmitted(false)
      setCorrect(0)
      setWrong([])
      setWritingOpen(false)
      setPhase('run')
    } catch (err) {
      toast((err as Error).message, 'error')
      setPhase('library')
    } finally {
      setLoading(false)
    }
  }

  const submit = (choice: number) => {
    if (!current || submitted) return
    setSelected(choice)
    setSubmitted(true)
    if (choice === current.answerIndex) setCorrect((value) => value + 1)
    else setWrong((prev) => [...prev, current])
  }

  const next = () => {
    if (!paper) return
    if (index + 1 >= paper.questions.length) setPhase('done')
    else {
      setIndex((value) => value + 1)
      setSelected(null)
      setSubmitted(false)
    }
  }

  useEffect(() => {
    if (phase !== 'run') return
    const onKey = (event: KeyboardEvent) => {
      const target = event.target as HTMLElement
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA') return
      if (!submitted && current && ['1', '2', '3', '4'].includes(event.key)) {
        const choice = Number(event.key) - 1
        if (choice < current.options.length) submit(choice)
        return
      }
      if (submitted && keyMatches(event.key, settings.shortcutNext)) {
        event.preventDefault()
        next()
      }
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  })

  if (phase === 'library') {
    return (
      <div className="mx-auto max-w-5xl">
        <PageHeader
          eyebrow="Exams"
          title="真题"
          description="按四六级套卷结构组合听力、阅读、句子翻译与写作；和小测按词书逐题抽题不同，这里是一套完整的考试节奏。"
          actions={
            <button type="button" className="btn btn-ghost" onClick={() => setImportOpen(true)}>
              <Upload size={15} />
              导入真题
            </button>
          }
        />

        <div className="mb-5 flex flex-wrap items-center gap-2">
          {[
            { value: 'cet4' as const, label: 'CET-4' },
            { value: 'cet6' as const, label: 'CET-6' },
          ].map((item) => (
            <button
              key={item.value}
              type="button"
              onClick={() => setLevel(item.value)}
              className={cn('chip !px-4 !py-2', level === item.value && 'chip-active')}
            >
              {item.label}
            </button>
          ))}
          <span className="ml-auto text-[10px] text-muted">本地题库按真题结构组卷 · 不写入学习进度</span>
        </div>

        <div className="grid gap-4 sm:grid-cols-2">
          {PAPER_OPTIONS.filter((item) => item.level === level).map((item) => (
            <div key={item.id} className="card overflow-hidden">
              <div className="border-b border-line bg-forest-soft/25 px-5 py-5">
                <div className="flex items-center justify-between gap-2">
                  <span className="rounded-full bg-forest-soft px-2.5 py-0.5 text-[10px] text-forest">
                    {levelLabel(item.level)}
                  </span>
                  <span className="inline-flex items-center gap-1 text-[10px] text-muted">
                    <Clock3 size={12} />
                    约 35 分钟
                  </span>
                </div>
                <h2 className="mt-3 serif text-2xl">{item.title}</h2>
                <p className="mt-1.5 text-[11px] leading-relaxed text-muted">{item.description}</p>
              </div>
              <div className="p-5">
                <div className="grid grid-cols-2 gap-2 text-[11px]">
                  {[
                    { label: '听力理解', count: 3 },
                    { label: '阅读理解', count: 2 },
                    { label: '句子翻译', count: 2 },
                    { label: '写作', count: 1 },
                  ].map((section) => (
                    <div key={section.label} className="flex items-center justify-between rounded-lg bg-surface-2/50 px-2.5 py-2">
                      <span className="text-muted">{section.label}</span>
                      <span className="text-ink-soft">{section.count}</span>
                    </div>
                  ))}
                </div>
                <button
                  type="button"
                  className="btn btn-primary mt-5 w-full !py-2.5"
                  disabled={loading}
                  onClick={() => buildPaper(level, item.title)}
                >
                  {loading ? <Loader2 size={14} className="animate-spin" /> : <ScrollText size={14} />}
                  开始这套卷
                </button>
              </div>
            </div>
          ))}
        </div>

        {customPapers.length > 0 && (
          <div className="mt-6">
            <div className="mb-3 flex items-end justify-between">
              <div>
                <p className="eyebrow">Imported</p>
                <h2 className="mt-1 serif text-xl">我导入的真题</h2>
              </div>
              <span className="text-[10px] text-muted">保存在本机数据库</span>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              {customPapers.map((item) => (
                <div key={item.id} className="card flex items-center justify-between gap-3 p-4">
                  <button
                    type="button"
                    className="min-w-0 flex-1 text-left"
                    onClick={() => startCustomPaper(item)}
                  >
                    <div className="flex items-center gap-2">
                      <span className="rounded-full bg-amber-soft px-2 py-0.5 text-[9px] text-amber">
                        导入
                      </span>
                      <span className="text-[9px] text-muted">{levelLabel(item.level)}</span>
                    </div>
                    <div className="mt-1.5 truncate serif text-lg">{item.title}</div>
                    <div className="mt-0.5 text-[10px] text-muted">
                      {item.questions.length} 道选择题 · 约 35 分钟
                    </div>
                  </button>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-danger"
                      onClick={() => removeCustomPaper(item.id)}
                      aria-label="删除导入真题"
                    >
                      <Trash2 size={14} />
                    </button>
                    <button
                      type="button"
                      className="btn btn-soft !px-3 !py-1.5 !text-xs"
                      onClick={() => startCustomPaper(item)}
                    >
                      开始
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="mt-4 flex items-start gap-2 rounded-xl border border-line bg-paper/70 px-3.5 py-3 text-[10px] leading-relaxed text-muted backdrop-blur-sm">
          <Sparkles size={14} className="mt-0.5 shrink-0 text-amber" />
          套卷由本地句子、作文和题库组合生成，用来练节奏和题型；不是官方原卷。写作题会单独给出，不计入选择题分数。
        </div>

        <Modal
          open={importOpen}
          onClose={() => {
            if (!importBusy) setImportOpen(false)
          }}
          title="导入真题"
          size="xl"
          footer={
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-[11px] text-muted">
                已识别 {importRows.length} 套 · 导入后保存到本机数据库
              </span>
              <div className="flex gap-2">
                <button
                  type="button"
                  className="btn btn-ghost"
                  onClick={() => setImportOpen(false)}
                  disabled={importBusy || saveImported.isPending}
                >
                  取消
                </button>
                <button
                  type="button"
                  className="btn btn-primary"
                  disabled={!importRows.length || importBusy || saveImported.isPending}
                  onClick={() => saveImported.mutate()}
                >
                  {saveImported.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Upload size={14} />
                  )}
                  导入 {importRows.length} 套
                </button>
              </div>
            </div>
          }
        >
          <div className="grid gap-4 p-5 lg:grid-cols-[1.1fr_0.9fr]">
            <div>
              <textarea
                value={importText}
                onChange={(event) => setImportText(event.target.value)}
                placeholder={`{\n  "title": "CET-4 真题 · 我的套卷",\n  "level": "cet4",\n  "writingPrompt": "Write an essay about ...",\n  "questions": [\n    {\n      "type": "reading",\n      "prompt": "What is the passage mainly about?",\n      "passage": "……",\n      "options": ["A", "B", "C", "D"],\n      "answerIndex": 0\n    }\n  ]\n}`}
                className="min-h-[320px] w-full resize-y rounded-xl border border-line bg-surface p-3 font-mono text-[11px] leading-relaxed outline-none focus:border-forest"
              />
              <div className="mt-2 flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  className="btn btn-soft !py-1.5 !text-xs"
                  onClick={importCustom}
                  disabled={!importText.trim() || importBusy}
                >
                  解析内容
                </button>
                <button
                  type="button"
                  className="btn btn-soft !py-1.5 !text-xs"
                  onClick={() => importFileRef.current?.click()}
                  disabled={importBusy}
                >
                  <FileJson size={13} />
                  选择 JSON 文件
                </button>
                <input
                  ref={importFileRef}
                  type="file"
                  accept="application/json,.json"
                  className="hidden"
                  onChange={(event) => {
                    const file = event.target.files?.[0]
                    if (file) void importFile(file)
                  }}
                />
              </div>
            </div>
            <div className="min-w-0 rounded-xl border border-line bg-surface-2/30 p-4 text-[11px] leading-relaxed text-muted">
              {importRows.length ? (
                <div className="max-h-[390px] space-y-2 overflow-y-auto">
                  {importRows.map((row) => (
                    <div key={row.id} className="flex items-start gap-2 rounded-lg bg-surface p-2.5">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-[12px] font-medium text-ink-soft">{row.title}</div>
                        <div className="mt-0.5 text-[10px] text-muted">
                          {levelLabel(row.level)} · {row.questions.length} 道选择题
                        </div>
                      </div>
                      <button
                        type="button"
                        className="grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-danger"
                        onClick={() => setImportRows((prev) => prev.filter((item) => item.id !== row.id))}
                        aria-label="移除"
                      >
                        <Trash2 size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <p className="font-medium text-ink-soft">支持的题型</p>
                  <p className="mt-1">看英选中、看中选英、例句填空、句子翻译、完形填空、听力题干、阅读理解。</p>
                  <p className="mt-3 font-medium text-ink-soft">必填字段</p>
                  <p className="mt-1">title、questions；每道选择题需要 prompt、options、answerIndex。</p>
                  <p className="mt-3 font-medium text-ink-soft">阅读 / 完形</p>
                  <p className="mt-1">额外提供 passage；听力题提供 audioText。</p>
                  <p className="mt-3 text-[10px] text-muted/80">导入的套卷写入本机 SQLite，不再依赖浏览器存储。</p>
                </>
              )}
            </div>
          </div>
        </Modal>
      </div>
    )
  }

  if (phase === 'loading' || !paper) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="card p-8 text-center text-sm text-muted">
          <Loader2 size={20} className="mx-auto mb-3 animate-spin text-forest" />
          正在组合套卷…
        </div>
      </div>
    )
  }

  if (phase === 'done') {
    const total = paper.questions.length
    const accuracy = Math.round((correct / Math.max(1, total)) * 100)
    return (
      <div className="mx-auto max-w-2xl">
        <div className="card overflow-hidden">
          <div className="border-b border-line bg-forest-soft/30 px-6 py-9 text-center">
            <ProgressRing value={correct} max={total} size={104} stroke={7}>
              <div className="text-center">
                <div className="serif text-2xl leading-none">{accuracy}%</div>
                <div className="mt-1 text-[9px] text-muted">正确率</div>
              </div>
            </ProgressRing>
            <h1 className="mt-4 serif text-3xl">套卷完成</h1>
            <p className="mt-2 text-sm text-muted">
              选择题部分做完啦。写作题可以单独展开，再练一遍表达。
            </p>
            <p className="mt-1 text-[10px] text-muted">{paper.title}</p>
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
              <div className="mt-1 text-[10px] text-muted">选择题</div>
            </div>
          </div>
          <div className="border-t border-line p-5">
            <button
              type="button"
              className="flex w-full items-center justify-between rounded-xl bg-surface-2/50 px-3.5 py-3 text-left"
              onClick={() => setWritingOpen((value) => !value)}
            >
              <span className="flex items-center gap-2 text-[12px] font-medium">
                <FileText size={14} className="text-forest" />
                写作题
              </span>
              <span className="text-[10px] text-muted">{writingOpen ? '收起' : '展开'}</span>
            </button>
            {writingOpen && (
              <p className="mt-3 whitespace-pre-wrap rounded-xl bg-surface-2/35 px-3.5 py-3 text-[12px] leading-relaxed text-ink-soft">
                {paper.writingPrompt}
              </p>
            )}
          </div>
          <div className="flex flex-wrap justify-center gap-2 border-t border-line px-5 py-4">
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => {
                setPhase('library')
                setPaper(null)
                setWritingOpen(false)
              }}
            >
              <RefreshCw size={15} />
              再选一套
            </button>
            <Link to="/essays/practice" className="btn btn-ghost">
              <FileText size={15} />
              去写作训练
            </Link>
          </div>
        </div>
      </div>
    )
  }

  return (
    <div className="mx-auto flex max-w-3xl flex-col lg:min-h-[calc(100vh-9rem)] lg:justify-center">
      <div className="rounded-2xl border border-line bg-surface/85 p-3.5 shadow-[var(--shadow-card)] backdrop-blur-sm">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <button
            type="button"
            onClick={() => {
              if (window.confirm('退出这套真题？当前进度不会保存。')) setPhase('library')
            }}
            className="inline-flex items-center gap-1 text-[11px] text-muted hover:text-ink"
          >
            <ChevronLeft size={14} />
            退出套卷
          </button>
          <div className="flex min-w-0 items-center gap-2">
            <span className="serif text-lg">真题</span>
            <span className="max-w-[280px] truncate rounded-full bg-surface-2 px-2 py-0.5 text-[9px] text-muted">
              {paper.title}
            </span>
          </div>
          <span className="tabular-nums text-[10px] text-muted">
            {index + 1} / {paper.questions.length}
          </span>
        </div>
        <div className="mt-3 h-2 overflow-hidden rounded-full bg-surface-2">
          <div
            className="h-full rounded-full bg-forest transition-all duration-300"
            style={{ width: `${((index + (submitted ? 1 : 0)) / paper.questions.length) * 100}%` }}
          />
        </div>
      </div>

      {paper.writingPrompt && (
        <div className="mt-3 rounded-xl border border-line bg-paper/70 px-3.5 py-2.5 text-[10px] text-muted backdrop-blur-sm">
          <button
            type="button"
            className="inline-flex items-center gap-1.5 hover:text-ink"
            onClick={() => setWritingOpen((value) => !value)}
          >
            <FileText size={12} className="text-forest" />
            写作题（不计入选择题分数）
            <span>{writingOpen ? '收起' : '展开'}</span>
          </button>
          {writingOpen && (
            <p className="mt-2 whitespace-pre-wrap leading-relaxed text-ink-soft">{paper.writingPrompt}</p>
          )}
        </div>
      )}

      {current && (
        <div className="card mt-4 overflow-hidden border-t-[3px] border-t-forest/40">
          <div className="flex items-center justify-between px-5 pt-5 sm:px-7">
            <span className="rounded-full border border-line px-2.5 py-0.5 text-[10px] text-muted">
              {TYPE_LABEL[current.type] || '真题'}
            </span>
            <span className="inline-flex items-center gap-1 text-[10px] text-muted">
              <Clock3 size={12} />
              套卷
            </span>
          </div>
          <QuestionBody
            question={current}
            selected={selected}
            submitted={submitted}
            spell=""
            onSpell={() => {}}
            onSelect={submit}
          />
          {submitted && (
            <div className="border-t border-line px-5 py-4 text-center text-[11px] leading-relaxed sm:px-7">
              <span className={selected === current.answerIndex ? 'text-forest' : 'text-danger'}>
                {selected === current.answerIndex ? '答对了。' : '答错了。'}
              </span>
              <span className="text-muted">
                正确答案：{current.options[current.answerIndex]}
                {current.explanation ? ` · ${current.explanation}` : ''}
              </span>
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex items-center justify-between">
        <span className="text-[10px] text-muted">选择题做完后可以查看写作题，不写入学习进度</span>
        {submitted && (
          <button type="button" className="btn btn-primary" onClick={next}>
            {index + 1 >= paper.questions.length ? '查看结果' : '下一题'}
            <ArrowRight size={15} />
          </button>
        )}
      </div>
    </div>
  )
}
