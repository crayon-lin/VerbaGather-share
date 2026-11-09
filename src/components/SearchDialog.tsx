import { useEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookPlus, FileText, Loader2, Quote, Search, Sparkles, X } from 'lucide-react'
import { api } from '@/lib/api'
import { useSettings } from '@/lib/hooks'
import { useDebounced } from '@/lib/useDebounced'
import { useUIStore, toast } from '@/store/ui'
import { cn, categoryLabel } from '@/lib/utils'

type SearchMode = 'local' | 'ai'

export function SearchDialog() {
  const open = useUIStore((s) => s.searchOpen)
  const setOpen = useUIStore((s) => s.setSearchOpen)
  const { settings } = useSettings()
  const [q, setQ] = useState('')
  const [mode, setMode] = useState<SearchMode>('local')
  const [aiAnswer, setAiAnswer] = useState('')
  const [aiError, setAiError] = useState('')
  const inputRef = useRef<HTMLInputElement>(null)
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const debounced = useDebounced(q, 220)
  const { data, isFetching } = useQuery({
    queryKey: ['search', debounced],
    queryFn: () => api.search(debounced),
    enabled: debounced.trim().length > 0,
    staleTime: 30_000,
  })
  const aiSearch = useMutation({
    mutationFn: () =>
      api.aiSearch({
        query: q.trim(),
        context: buildContext(),
      }),
    onSuccess: (data) => {
      setAiAnswer(data.answer)
      setAiError('')
    },
    onError: (err: Error) => {
      setAiAnswer('')
      setAiError(err.message)
    },
  })
  const addWord = useMutation({
    mutationFn: (term: string) => api.createWord({ term, bookId: 'b_newwords' }),
    onSuccess: (res) => {
      toast(res.created ? `${res.word.term} 已收进生词本` : `${res.word.term} 已在生词本中`)
      queryClient.invalidateQueries({ queryKey: ['books'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      queryClient.invalidateQueries({ queryKey: ['dict'] })
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  const buildContext = () => {
    if (!data) return ''
    const lines: string[] = []
    for (const word of data.words.slice(0, 4)) {
      lines.push(`单词 ${word.term} ${word.phonetic || ''}：${word.meaning_cn.split('\n')[0]}`)
    }
    for (const sentence of data.sentences.slice(0, 3)) {
      lines.push(`句子：${sentence.text_en} / ${sentence.text_cn}`)
    }
    for (const essay of data.essays.slice(0, 2)) {
      lines.push(`作文：${essay.title_cn} / ${essay.title_en}`)
    }
    for (const template of data.templates.slice(0, 2)) {
      lines.push(`句型：${template.text_en} / ${template.text_cn}`)
    }
    return lines.join('\n').slice(0, 3500)
  }

  const runAi = () => {
    if (!q.trim() || aiSearch.isPending) return
    if (!settings.searchAiEnabled) {
      setAiError('AI 搜索未启用，请先在设置中开启并填写模型配置')
      return
    }
    if (!settings.searchAiBaseUrl.trim()) {
      setAiError('AI 搜索缺少 Base URL，请先在设置中填写')
      return
    }
    setAiAnswer('')
    setAiError('')
    aiSearch.mutate()
  }

  useEffect(() => {
    if (!open) return
    setQ('')
    setMode('local')
    setAiAnswer('')
    setAiError('')
    window.setTimeout(() => inputRef.current?.focus(), 40)
  }, [open])

  useEffect(() => {
    setAiAnswer('')
    setAiError('')
  }, [q, mode])

  useEffect(() => {
    if (!open) return
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setOpen(false)
    }
    document.addEventListener('keydown', onKey)
    document.body.style.overflow = 'hidden'
    return () => {
      document.removeEventListener('keydown', onKey)
      document.body.style.overflow = ''
    }
  }, [open, setOpen])

  if (!open) return null
  const go = (path: string) => {
    setOpen(false)
    navigate(path)
  }
  const hasResults =
    data && (data.words.length || data.sentences.length || data.essays.length || data.templates.length)

  return createPortal(
    <div className="fixed inset-0 z-[80] flex items-start justify-center px-4 pt-[8vh] sm:pt-[12vh]">
      <button
        type="button"
        aria-label="关闭搜索"
        className="absolute inset-0 bg-ink/30 backdrop-blur-[3px] animate-fade-in"
        onClick={() => setOpen(false)}
      />
      <div className="relative z-10 w-full max-w-2xl overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-float)] animate-scale-in">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Search size={18} className="text-muted" />
          <input
            ref={inputRef}
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && mode === 'ai') {
                e.preventDefault()
                runAi()
              }
            }}
            placeholder={mode === 'ai' ? '问 AI：单词、语法、写作…' : '搜索单词、句子、作文…'}
            className="h-14 flex-1 bg-transparent text-[15px] outline-none placeholder:text-muted/70"
          />
          {(isFetching || aiSearch.isPending) && <Loader2 size={16} className="animate-spin text-muted" />}
          <button
            type="button"
            onClick={() => setOpen(false)}
            className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface-2"
            aria-label="关闭"
          >
            <X size={16} />
          </button>
        </div>
        <div className="flex items-center gap-1.5 border-b border-line px-4 py-2">
          <button
            type="button"
            onClick={() => setMode('local')}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] transition-colors',
              mode === 'local' ? 'bg-forest-soft text-forest' : 'text-muted hover:text-ink',
            )}
          >
            <Search size={12} />
            本地搜索
          </button>
          <button
            type="button"
            onClick={() => setMode('ai')}
            className={cn(
              'inline-flex items-center gap-1 rounded-full px-2.5 py-1 text-[10px] transition-colors',
              mode === 'ai' ? 'bg-forest-soft text-forest' : 'text-muted hover:text-ink',
            )}
          >
            <Sparkles size={12} />
            AI 搜索
          </button>
          {mode === 'ai' && (
            <span className="ml-auto text-[9px] text-muted">
              {settings.searchAiEnabled ? 'Enter 提问' : '未启用'}
            </span>
          )}
        </div>
        <div className="max-h-[58vh] overflow-y-auto px-2 py-2">
          {!q.trim() && (
            <div className="px-3 py-8 text-center text-sm text-muted">
              {mode === 'ai' ? '问 AI 一个单词、语法或写作问题' : '输入英文单词或中文关键词开始搜索'}
              <div className="mt-3 flex flex-wrap justify-center gap-2">
                {['abandon', '坚持', '图表作文', '创造力'].map((k) => (
                  <button key={k} type="button" className="chip" onClick={() => setQ(k)}>
                    {k}
                  </button>
                ))}
              </div>
            </div>
          )}
          {mode === 'ai' && q.trim() && (
            <div className="px-3 pt-2">
              {aiSearch.isPending ? (
                <div className="rounded-xl border border-line bg-surface-2/40 px-4 py-5 text-center text-sm text-muted">
                  <Loader2 size={18} className="mx-auto mb-2 animate-spin" />
                  AI 正在组织回答…
                </div>
              ) : aiError ? (
                <div className="rounded-xl border border-danger/30 bg-danger-soft/30 px-4 py-3 text-[12px] leading-relaxed text-danger">
                  {aiError}
                  {(!settings.searchAiEnabled || !settings.searchAiBaseUrl.trim()) && (
                    <button
                      type="button"
                      onClick={() => go('/settings')}
                      className="ml-2 underline underline-offset-2"
                    >
                      去设置
                    </button>
                  )}
                </div>
              ) : aiAnswer ? (
                <div className="rounded-xl border border-forest/20 bg-forest-soft/35 px-4 py-3.5">
                  <div className="mb-2 flex items-center gap-1.5 text-[10px] font-medium text-forest">
                    <Sparkles size={12} />
                    AI 回答
                  </div>
                  <div className="whitespace-pre-wrap text-[13px] leading-relaxed text-ink-soft">
                    {aiAnswer}
                  </div>
                </div>
              ) : (
                <div className="rounded-xl border border-line bg-surface-2/30 px-4 py-4 text-center text-[11px] text-muted">
                  {settings.searchAiEnabled
                    ? '按 Enter 向 AI 提问'
                    : 'AI 搜索未启用，可在设置中单独配置模型'}
                </div>
              )}
            </div>
          )}
          {q.trim() && mode === 'local' && !isFetching && !hasResults && (
            <div className="px-3 py-10 text-center text-sm text-muted">没有找到相关内容</div>
          )}
          {data?.words?.length ? (
            <Section title="单词">
              {data.words.map((w) => (
                <div
                  key={w.id}
                  className="flex items-center gap-3 rounded-xl px-3 py-2.5 hover:bg-surface-2"
                >
                  <div className="min-w-0 flex-1">
                    <div className="flex items-baseline gap-2">
                      <span className="serif text-lg">{w.term}</span>
                      <span className="font-mono text-[10px] text-muted">{w.phonetic}</span>
                    </div>
                    <div className="truncate text-xs text-muted">{w.meaning_cn.split('\n')[0]}</div>
                  </div>
                  <button
                    type="button"
                    title="收进生词本"
                    disabled={addWord.isPending}
                    onClick={() => addWord.mutate(w.term)}
                    className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-muted hover:bg-forest-soft hover:text-forest"
                  >
                    <BookPlus size={15} />
                  </button>
                </div>
              ))}
            </Section>
          ) : null}
          {data?.sentences?.length ? (
            <Section title="句子">
              {data.sentences.map((s) => (
                <button
                  key={s.id}
                  type="button"
                  onClick={() => go(`/sentences?focus=${s.id}`)}
                  className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface-2"
                >
                  <Quote size={15} className="mt-1 shrink-0 text-forest" />
                  <div className="min-w-0">
                    <div className="truncate text-sm text-ink-soft">{s.text_en}</div>
                    <div className="mt-0.5 text-[11px] text-muted">
                      {categoryLabel(s.category)} · {s.source}
                    </div>
                  </div>
                </button>
              ))}
            </Section>
          ) : null}
          {data?.essays?.length ? (
            <Section title="作文">
              {data.essays.map((e) => (
                <button
                  key={e.id}
                  type="button"
                  onClick={() => go(`/essays/${e.id}`)}
                  className="flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface-2"
                >
                  <FileText size={15} className="shrink-0 text-amber" />
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-sm">{e.title_cn}</div>
                    <div className="truncate text-[11px] text-muted">{e.title_en}</div>
                  </div>
                  <span className="text-[10px] text-muted">{e.level === 'cet6' ? '六级' : '四级'}</span>
                </button>
              ))}
            </Section>
          ) : null}
          {data?.templates?.length ? (
            <Section title="作文模板">
              {data.templates.map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => go('/essays?tab=templates')}
                  className="flex w-full items-start gap-3 rounded-xl px-3 py-2.5 text-left hover:bg-surface-2"
                >
                  <FileText size={15} className="mt-1 shrink-0 text-muted" />
                  <div className="min-w-0">
                    <div className="truncate text-sm text-ink-soft">{t.text_en}</div>
                    <div className="truncate text-[11px] text-muted">{t.text_cn}</div>
                  </div>
                </button>
              ))}
            </Section>
          ) : null}
        </div>
        <div className="flex items-center justify-between border-t border-line px-4 py-2.5 text-[10px] text-muted">
          <span>
            {mode === 'ai'
              ? settings.searchAiEnabled
                ? `AI 搜索 · ${settings.searchAiModel || '默认模型'}`
                : 'AI 搜索未启用'
              : '本地词典 · 离线可用'}
          </span>
          <span>{mode === 'ai' ? 'Enter 提问 · Esc 关闭' : 'Esc 关闭'}</span>
        </div>
      </div>
    </div>,
    document.body,
  )
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mb-1">
      <div className="px-3 pb-1 pt-2 text-[10px] uppercase tracking-[0.14em] text-muted">{title}</div>
      {children}
    </div>
  )
}
