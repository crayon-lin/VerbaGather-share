import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery } from '@tanstack/react-query'
import { Check, Clock, Loader2, Pause, PenLine, Play, RotateCcw, Save, Sparkles } from 'lucide-react'
import { api } from '@/lib/api'
import { useSettings } from '@/lib/hooks'
import { PageHeader } from '@/components/PageHeader'
import { toast } from '@/store/ui'
import { cn, essayTypeLabel, formatDuration, wordCount } from '@/lib/utils'
import type { EssayScoreResult } from '@shared/types'

const CHECKS = [
  '内容切题，没有跑题或漏掉要点',
  '三段结构清楚，每段有中心句',
  '使用了连接词与至少两个高级句型',
  '检查过主谓一致、时态与拼写',
]

export default function EssayPractice() {
  const { settings } = useSettings()
  const [params] = useSearchParams()
  const essays = useQuery({
    queryKey: ['essays', settings.level, 'all'],
    queryFn: () => api.essays({ type: 'all', level: settings.level }),
  })
  const items = essays.data?.items ?? []
  const [selectedId, setSelectedId] = useState<string>('')
  const [content, setContent] = useState('')
  const [checks, setChecks] = useState<boolean[]>(CHECKS.map(() => false))
  const [seconds, setSeconds] = useState(0)
  const [running, setRunning] = useState(false)
  const [savedAt, setSavedAt] = useState<string | null>(null)
  const [hydrated, setHydrated] = useState(false)
  const [submitted, setSubmitted] = useState(false)
  const [aiScore, setAiScore] = useState<EssayScoreResult | null>(null)
  const [aiError, setAiError] = useState('')
  const initialized = useRef(false)
  const skipNextSave = useRef(false)

  useEffect(() => {
    if (initialized.current || !items.length) return
    const wanted = params.get('prompt')
    const hit = wanted ? items.find((e) => e.title_cn === wanted) : null
    setSelectedId(hit?.id || items[0].id)
    initialized.current = true
  }, [items, params])

  const selected = useMemo(() => items.find((e) => e.id === selectedId), [items, selectedId])
  const target = selected?.level === 'cet6' ? { min: 150, max: 200 } : { min: 120, max: 180 }
  const words = wordCount(content)
  const status =
    words === 0 ? '空的' : words < target.min ? `还差 ${target.min - words} 词` : words > target.max ? `超出 ${words - target.max} 词` : '字数合适'

  const draftQuery = useQuery({
    queryKey: ['essay-draft', selectedId],
    queryFn: () => api.essayDraft(selectedId),
    enabled: Boolean(selectedId),
  })
  const saveDraft = useMutation({
    mutationFn: (data: { content: string; checks: boolean[]; seconds: number; savedAt: string }) =>
      api.saveEssayDraft(selectedId, data),
    onSuccess: (result) => setSavedAt(result.draft.savedAt),
    onError: (err: Error) => toast(err.message, 'error'),
  })
  const deleteDraft = useMutation({
    mutationFn: () => api.deleteEssayDraft(selectedId),
    onError: (err: Error) => toast(err.message, 'error'),
  })

  const score = useMutation({
    mutationFn: () =>
      api.scoreEssay({
        content: content.trim(),
        prompt: selected?.prompt_cn || selected?.title_cn || '',
        level: selected?.level === 'cet6' ? 'cet6' : 'cet4',
        wordCount: words,
      }),
    onSuccess: (result) => {
      setAiScore(result)
      setAiError('')
    },
    onError: (err: Error) => {
      setAiScore(null)
      setAiError(err.message)
    },
  })

  const runAiScore = () => {
    if (!settings.essayAiEnabled) {
      toast('请先在「设置 → AI 作文评分」中开启并填写模型', 'info')
      return
    }
    if (words < 30) {
      toast('至少写 30 个词再让 AI 评分', 'info')
      return
    }
    setAiError('')
    setSubmitted(true)
    score.mutate()
  }

  useEffect(() => {
    if (!selectedId) return
    setSubmitted(false)
    setAiScore(null)
    setAiError('')
    setContent('')
    setChecks(CHECKS.map(() => false))
    setSeconds(0)
    setSavedAt(null)
    setHydrated(false)
    setRunning(false)
  }, [selectedId])

  useEffect(() => {
    if (!selectedId || !draftQuery.isSuccess) return
    const draft = draftQuery.data?.draft
    setContent(draft?.content || '')
    setChecks(CHECKS.map((_, index) => Boolean(draft?.checks?.[index])))
    setSeconds(draft?.seconds || 0)
    setSavedAt(draft?.savedAt || null)
    setHydrated(true)
  }, [selectedId, draftQuery.isSuccess, draftQuery.data])

  useEffect(() => {
    if (!selectedId || !draftQuery.isError) return
    setContent('')
    setChecks(CHECKS.map(() => false))
    setSeconds(0)
    setSavedAt(null)
    setHydrated(true)
  }, [selectedId, draftQuery.isError])

  useEffect(() => {
    if (!running) return
    const timer = window.setInterval(() => setSeconds((s) => s + 1), 1000)
    return () => window.clearInterval(timer)
  }, [running])

  useEffect(() => {
    if (!selectedId || !hydrated) return
    if (skipNextSave.current) {
      skipNextSave.current = false
      return
    }
    const timer = window.setTimeout(() => {
      saveDraft.mutate({
        content,
        checks,
        seconds,
        savedAt: new Date().toISOString(),
      })
    }, 700)
    return () => window.clearTimeout(timer)
  }, [content, checks, seconds, selectedId, hydrated])

  const reset = () => {
    if (!window.confirm('清空这篇草稿？内容无法恢复。')) return
    skipNextSave.current = true
    setContent('')
    setChecks(CHECKS.map(() => false))
    setSeconds(0)
    setRunning(false)
    setSubmitted(false)
    setAiScore(null)
    setAiError('')
    setSavedAt(null)
    deleteDraft.mutate()
  }

  return (
    <div className="mx-auto max-w-6xl">
      <PageHeader
        back={{ to: '/essays', label: '作文库' }}
        eyebrow="Practice"
        title="写作训练"
        description="选一个题目，限时写一篇；字数、用时和自检清单都在旁边，草稿会自动保存在本机。"
        actions={
          <Link to="/essays" className="btn btn-ghost">
            看范文
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.6fr_1fr]">
        <div className="min-w-0">
          <div className="card overflow-hidden">
            <div className="flex flex-wrap items-center gap-2 border-b border-line px-4 py-3">
              <select
                className="field !w-auto max-w-full !py-1.5 !text-xs"
                value={selectedId}
                onChange={(e) => setSelectedId(e.target.value)}
              >
                {items.map((e) => (
                  <option key={e.id} value={e.id}>
                    {e.title_cn}（{e.level === 'cet6' ? '六级' : '四级'}）
                  </option>
                ))}
              </select>
              <div className="ml-auto flex items-center gap-1.5">
                <button
                  type="button"
                  onClick={() => setRunning((v) => !v)}
                  className="btn btn-ghost !py-1.5 !text-xs"
                >
                  {running ? <Pause size={13} /> : <Play size={13} />}
                  {running ? '暂停' : seconds ? '继续' : '计时'}
                </button>
                <span className="flex items-center gap-1 font-mono text-[11px] text-muted">
                  <Clock size={12} />
                  {formatDuration(seconds * 1000)}
                </span>
                <button
                  type="button"
                  onClick={reset}
                  className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-danger"
                  aria-label="清空草稿"
                >
                  <RotateCcw size={13} />
                </button>
              </div>
            </div>

            <div className="px-4 pt-4">
              <div className="rounded-xl border border-line bg-surface-2/40 p-4">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="rounded-full border border-line bg-surface px-2 py-0.5 text-[10px] text-muted">
                    {selected ? essayTypeLabel(selected.type) : '—'}
                  </span>
                  <span className="text-[10px] text-muted">
                    目标 {target.min}–{target.max} 词
                  </span>
                </div>
                <p className="mt-2 whitespace-pre-line text-[11.5px] leading-relaxed text-ink-soft">
                  {selected?.prompt_cn || '选择一道题目开始。'}
                </p>
              </div>

              <textarea
                value={content}
                onChange={(e) => {
                  setContent(e.target.value)
                  setAiScore(null)
                  setAiError('')
                  if (!running) setRunning(true)
                }}
                placeholder="Start writing here…"
                spellCheck={false}
                className="mt-4 min-h-[420px] w-full resize-y rounded-xl border border-line bg-surface px-5 py-4 font-serif text-[17px] leading-[2] text-ink outline-none transition-colors placeholder:text-muted/50 focus:border-forest"
                style={{
                  backgroundImage:
                    'repeating-linear-gradient(to bottom, transparent 0, transparent calc(2em - 1px), color-mix(in srgb, var(--c-line) 55%, transparent) calc(2em - 1px), color-mix(in srgb, var(--c-line) 55%, transparent) 2em)',
                  backgroundAttachment: 'local',
                }}
              />
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-line px-4 py-3">
              <div className="flex items-center gap-3 text-[11px]">
                <span
                  className={cn(
                    'tabular-nums',
                    words > 0 && words >= target.min && words <= target.max
                      ? 'text-forest'
                      : 'text-muted',
                  )}
                >
                  {words} 词
                </span>
                <span className="text-muted">· {status}</span>
                {savedAt && (
                  <span className="flex items-center gap-1 text-[10px] text-muted/70">
                    <Save size={11} />
                    已自动保存
                  </span>
                )}
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  className="btn btn-soft !py-2 !text-xs"
                  disabled={score.isPending || !content.trim()}
                  onClick={runAiScore}
                >
                  {score.isPending ? (
                    <Loader2 size={14} className="animate-spin" />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  {score.isPending ? '评分中…' : 'AI 打分'}
                </button>
                <button
                  type="button"
                  className="btn btn-primary !py-2 !text-xs"
                  disabled={!content.trim()}
                  onClick={() => {
                    setRunning(false)
                    setSubmitted(true)
                  }}
                >
                  <Check size={14} />
                  完成本次练习
                </button>
              </div>
            </div>
          </div>

          {submitted && (
            <div className="card mt-4 p-5 animate-fade-up">
              <div className="flex items-start gap-3">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-forest-soft text-forest">
                  <Sparkles size={18} />
                </span>
                <div className="flex-1">
                  <h2 className="serif text-xl">写完了，先自己看一遍</h2>
                  <p className="mt-1 text-[11px] text-muted">
                    用时 {formatDuration(seconds * 1000)} · {words} 词 ·{' '}
                    {words >= target.min && words <= target.max ? '字数符合要求' : '字数还可以再调整'}
                  </p>
                  <div className="mt-3 grid gap-1.5 sm:grid-cols-2">
                    {CHECKS.map((c, i) => (
                      <label key={c} className="flex cursor-pointer items-start gap-2 text-[11px] text-ink-soft">
                        <input
                          type="checkbox"
                          className="mt-0.5 h-3.5 w-3.5 accent-[var(--c-forest)]"
                          checked={checks[i]}
                          onChange={(e) =>
                            setChecks((prev) => prev.map((v, idx) => (idx === i ? e.target.checked : v)))
                          }
                        />
                        {c}
                      </label>
                    ))}
                  </div>
                  {aiError && (
                    <p className="mt-4 rounded-lg border border-danger/30 bg-danger-soft/30 px-3 py-2 text-[11px] text-danger">
                      {aiError}
                    </p>
                  )}
                  {aiScore && (
                    <div className="mt-4 rounded-xl border border-forest/20 bg-forest-soft/20 p-4">
                      <div className="flex flex-wrap items-end justify-between gap-2">
                        <div>
                          <p className="eyebrow">AI review</p>
                          <div className="mt-1 serif text-3xl leading-none">
                            {aiScore.score}
                            <span className="ml-1 font-sans text-xs text-muted">/ {aiScore.maxScore}</span>
                          </div>
                        </div>
                        <span className="rounded-full bg-forest-soft px-2.5 py-1 text-[9px] text-forest">
                          参考分 · 非官方
                        </span>
                      </div>
                      {aiScore.summary && (
                        <p className="mt-3 text-[11px] leading-relaxed text-ink-soft">{aiScore.summary}</p>
                      )}
                      {aiScore.dimensions.length > 0 && (
                        <div className="mt-3 grid gap-2 sm:grid-cols-3">
                          {aiScore.dimensions.map((dimension) => (
                            <div key={dimension.name} className="rounded-lg bg-surface/70 p-2.5">
                              <div className="flex items-center justify-between text-[10px]">
                                <span className="text-muted">{dimension.name}</span>
                                <span className="text-ink-soft">
                                  {dimension.score}/{dimension.maxScore}
                                </span>
                              </div>
                              <div className="mt-1.5 h-1 overflow-hidden rounded-full bg-surface-2">
                                <div
                                  className="h-full rounded-full bg-forest"
                                  style={{
                                    width: `${Math.min(100, (dimension.score / Math.max(1, dimension.maxScore)) * 100)}%`,
                                  }}
                                />
                              </div>
                              <p className="mt-1.5 line-clamp-2 text-[9px] leading-relaxed text-muted">
                                {dimension.comment}
                              </p>
                            </div>
                          ))}
                        </div>
                      )}
                      <div className="mt-3 grid gap-3 sm:grid-cols-2">
                        {aiScore.strengths.length > 0 && (
                          <div>
                            <p className="text-[10px] font-medium text-forest">做得好的地方</p>
                            <ul className="mt-1 space-y-1 text-[10px] leading-relaxed text-muted">
                              {aiScore.strengths.map((item) => (
                                <li key={item}>· {item}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {aiScore.improvements.length > 0 && (
                          <div>
                            <p className="text-[10px] font-medium text-amber">可以改进的地方</p>
                            <ul className="mt-1 space-y-1 text-[10px] leading-relaxed text-muted">
                              {aiScore.improvements.map((item) => (
                                <li key={item}>· {item}</li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                      {aiScore.suggestions.length > 0 && (
                        <div className="mt-3 border-t border-line/60 pt-2.5">
                          <p className="text-[10px] font-medium text-ink-soft">可替换表达</p>
                          <ul className="mt-1 space-y-1 text-[10px] leading-relaxed text-muted">
                            {aiScore.suggestions.map((item) => (
                              <li key={item}>· {item}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                    </div>
                  )}
                  <p className="mt-3 text-[10px] leading-relaxed text-muted">
                    自检清单和 AI 评分都是练习参考，不是官方成绩；可以对照右侧范文继续修改。
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="card p-5">
            <p className="eyebrow">自检清单</p>
            <div className="mt-3 space-y-2.5">
              {CHECKS.map((c, i) => (
                <label key={c} className="flex cursor-pointer items-start gap-2 text-[11.5px] leading-relaxed">
                  <span
                    className={cn(
                      'mt-0.5 grid h-4 w-4 shrink-0 place-items-center rounded border',
                      checks[i] ? 'border-forest bg-forest text-paper' : 'border-line',
                    )}
                  >
                    {checks[i] && <Check size={10} />}
                  </span>
                  <input
                    type="checkbox"
                    className="sr-only"
                    checked={checks[i]}
                    onChange={(e) =>
                      setChecks((prev) => prev.map((v, idx) => (idx === i ? e.target.checked : v)))
                    }
                  />
                  <span className={cn(checks[i] ? 'text-ink' : 'text-muted')}>{c}</span>
                </label>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <p className="eyebrow">字数与时间</p>
            <div className="mt-3 grid grid-cols-2 gap-3">
              <div className="rounded-xl bg-surface-2/50 p-3">
                <div className="serif text-lg">{words}</div>
                <div className="mt-0.5 text-[9px] text-muted">当前词数</div>
              </div>
              <div className="rounded-xl bg-surface-2/50 p-3">
                <div className="serif text-lg">
                  {target.min}–{target.max}
                </div>
                <div className="mt-0.5 text-[9px] text-muted">考试要求</div>
              </div>
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-surface-2">
              <div
                className={cn(
                  'h-full rounded-full transition-all',
                  words > target.max ? 'bg-danger' : words >= target.min ? 'bg-forest' : 'bg-amber',
                )}
                style={{ width: `${Math.min(100, (words / target.max) * 100)}%` }}
              />
            </div>
            <ul className="mt-3 space-y-1 text-[10px] leading-relaxed text-muted">
              <li>· 四级建议 120–180 词，六级 150–200 词。</li>
              <li>· 先花 3 分钟列提纲，再动笔。</li>
              <li>· 留 3 分钟检查时态、单复数与拼写。</li>
            </ul>
          </div>

          {selected && (
            <div className="card p-5">
              <p className="eyebrow">参考范文</p>
              <Link to={`/essays/${selected.id}`} className="mt-2 block">
                <h3 className="serif text-base leading-snug text-ink hover:text-forest">
                  {selected.title_cn}
                </h3>
                <p className="mt-1 text-[10px] text-muted">
                  {selected.word_count} 词 · 对照译文与结构
                </p>
              </Link>
              <div className="mt-3 space-y-1.5">
                {selected.tips.map((tip) => (
                  <p key={tip} className="text-[10px] leading-relaxed text-muted">
                    · {tip}
                  </p>
                ))}
              </div>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
