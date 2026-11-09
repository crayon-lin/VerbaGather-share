import { useEffect, useMemo, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Copy, PenLine, Quote, Star, Trash2, Upload } from 'lucide-react'
import { api } from '@/lib/api'
import { useSettings } from '@/lib/hooks'
import { PageHeader } from '@/components/PageHeader'
import { Badge } from '@/components/Badge'
import { EmptyState } from '@/components/EmptyState'
import { SpeakButton } from '@/components/SpeakButton'
import { EssayImportModal } from '@/components/EssayImportModal'
import { toast } from '@/store/ui'
import { categoryLabel, cn, essayTypeLabel, levelLabel } from '@/lib/utils'
import type { EssaySummary, EssayType, Template } from '@shared/types'

const TYPES: Array<{ value: string; label: string }> = [
  { value: 'all', label: '全部' },
  { value: 'argument', label: '议论文' },
  { value: 'chart', label: '图表' },
  { value: 'letter', label: '书信' },
  { value: 'speech', label: '演讲' },
  { value: 'notice', label: '通知' },
  { value: 'review', label: '评论' },
]

const USAGES = [
  { value: 'all', label: '全部' },
  { value: '开头', label: '开头' },
  { value: '过渡', label: '过渡' },
  { value: '论证', label: '论证' },
  { value: '举例', label: '举例' },
  { value: '结尾', label: '结尾' },
]

export default function Essays() {
  const { settings } = useSettings()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [tab, setTab] = useState<'essays' | 'templates'>(
    params.get('tab') === 'templates' ? 'templates' : 'essays',
  )
  const [type, setType] = useState<string>('all')
  const [templateType, setTemplateType] = useState<string>('all')
  const [usage, setUsage] = useState<string>('all')
  const [importOpen, setImportOpen] = useState(false)

  const essays = useQuery({
    queryKey: ['essays', settings.level, type],
    queryFn: () => api.essays({ type, level: settings.level }),
  })
  const templates = useQuery({
    queryKey: ['templates'],
    queryFn: () => api.templates({}),
    staleTime: 5 * 60_000,
  })
  const favorite = useMutation({
    mutationFn: (id: string) => api.toggleFavorite('essay', id),
    onSuccess: (res) => {
      toast(res.favorited ? '已收藏' : '已取消收藏')
      queryClient.invalidateQueries({ queryKey: ['essays'] })
      queryClient.invalidateQueries({ queryKey: ['favorites'] })
    },
  })
  const removeEssay = useMutation({
    mutationFn: (id: string) => api.deleteEssay(id),
    onSuccess: () => {
      toast('已删除自定义作文')
      queryClient.invalidateQueries({ queryKey: ['essays'] })
      queryClient.invalidateQueries({ queryKey: ['favorites'] })
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  useEffect(() => {
    const next = new URLSearchParams(params)
    if (tab === 'templates') next.set('tab', 'templates')
    else next.delete('tab')
    if (next.toString() !== params.toString()) setParams(next, { replace: true })
  }, [tab, params, setParams])

  const essayItems = essays.data?.items ?? []
  const templateItems = useMemo(() => {
    return (templates.data?.items ?? []).filter(
      (t) =>
        (templateType === 'all' || t.type === templateType) && (usage === 'all' || t.usage === usage),
    )
  }, [templates.data, templateType, usage])
  const grouped = useMemo(() => {
    const map = new Map<string, Template[]>()
    for (const t of templateItems) {
      const list = map.get(t.usage) || []
      list.push(t)
      map.set(t.usage, list)
    }
    return Array.from(map.entries())
  }, [templateItems])

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast('已复制')
    } catch {
      toast('复制失败', 'error')
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Writing"
        title="作文"
        description="按四六级字数与结构撰写的范文，逐段对照译文、结构与亮点；另有可套用的句型模板和写作练习。"
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setImportOpen(true)}>
              <Upload size={15} />
              导入作文
            </button>
            <Link to="/essays/practice" className="btn btn-primary">
              <PenLine size={15} />
              写作训练
            </Link>
            <span className="rounded-full border border-line bg-paper/85 px-2.5 py-1 text-[11px] text-ink-soft backdrop-blur-sm">
              {levelLabel(settings.level)}
            </span>
          </>
        }
      />

      <div className="mb-5 flex items-center gap-1.5">
        <button
          type="button"
          onClick={() => setTab('essays')}
          className={cn('chip !px-4 !py-1.5', tab === 'essays' && 'chip-active')}
        >
          范文精读
          <span className="ml-1 text-[9px] opacity-60">{essayItems.length}</span>
        </button>
        <button
          type="button"
          onClick={() => setTab('templates')}
          className={cn('chip !px-4 !py-1.5', tab === 'templates' && 'chip-active')}
        >
          句型模板
          <span className="ml-1 text-[9px] opacity-60">{templates.data?.items.length ?? 40}</span>
        </button>
      </div>

      {tab === 'essays' ? (
        <>
          <div className="mb-4 flex flex-wrap gap-1.5">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setType(t.value)}
                className={cn('chip !py-1.5 !text-[11px]', type === t.value && 'chip-active')}
              >
                {t.label}
              </button>
            ))}
          </div>

          {essays.isLoading ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {[0, 1, 2, 3, 4, 5].map((i) => (
                <div key={i} className="h-56 skeleton rounded-2xl" />
              ))}
            </div>
          ) : essayItems.length ? (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {essayItems.map((essay: EssaySummary) => (
                <article
                  key={essay.id}
                  className="card group flex flex-col p-5 transition-colors hover:border-line-strong"
                >
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5">
                      <Badge variant={essay.level === 'cet6' ? 'amber' : 'forest'}>
                        {essay.level === 'cet6' ? 'CET-6' : 'CET-4'}
                      </Badge>
                      <span className="rounded-full border border-line px-2 py-0.5 text-[10px] text-muted">
                        {essayTypeLabel(essay.type)}
                      </span>
                      {essay.is_custom && (
                        <span className="rounded-full bg-amber-soft px-2 py-0.5 text-[9px] text-amber">
                          自定义
                        </span>
                      )}
                    </div>
                    <div className="flex items-center gap-1">
                      {essay.is_custom && (
                        <button
                          type="button"
                          onClick={() => {
                            if (window.confirm(`删除自定义作文「${essay.title_cn}」？`)) {
                              removeEssay.mutate(essay.id)
                            }
                          }}
                          className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-danger"
                          aria-label="删除作文"
                        >
                          <Trash2 size={13} />
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => favorite.mutate(essay.id)}
                        className={cn(
                          'grid h-7 w-7 place-items-center rounded-full transition-colors',
                          essay.favorite ? 'text-amber' : 'text-muted hover:bg-surface-2',
                        )}
                        aria-label="收藏"
                      >
                        <Star size={14} fill={essay.favorite ? 'currentColor' : 'none'} />
                      </button>
                    </div>
                  </div>
                  <Link to={`/essays/${essay.id}`} className="mt-3 block">
                    <h2 className="serif text-[21px] leading-snug transition-colors group-hover:text-forest">
                      {essay.title_cn}
                    </h2>
                    <p className="mt-1 line-clamp-1 text-[11px] text-muted">{essay.title_en}</p>
                    <p className="mt-3 line-clamp-3 text-[12px] leading-relaxed text-ink-soft">
                      {essay.excerpt}
                    </p>
                  </Link>
                  <div className="mt-auto flex items-center justify-between border-t border-line/60 pt-3 text-[10px] text-muted">
                    <span>{essay.word_count} 词</span>
                    <div className="flex items-center gap-1.5">
                      <SpeakButton text={essay.firstParagraph} size={13} />
                      <Link
                        to={`/essays/${essay.id}`}
                        className="inline-flex items-center gap-1 text-forest hover:underline"
                      >
                        精读
                        <ArrowRight size={11} />
                      </Link>
                    </div>
                  </div>
                </article>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<PenLine size={22} />}
              title="这个级别还没有范文"
              description="切换四六级，或看看其他类型。"
              action={
                <button type="button" className="btn btn-ghost" onClick={() => setType('all')}>
                  查看全部类型
                </button>
              }
            />
          )}
        </>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-1.5">
            {TYPES.map((t) => (
              <button
                key={t.value}
                type="button"
                onClick={() => setTemplateType(t.value)}
                className={cn('chip !py-1.5 !text-[11px]', templateType === t.value && 'chip-active')}
              >
                {t.label}
              </button>
            ))}
          </div>
          <div className="mb-5 flex flex-wrap items-center gap-1.5">
            <span className="mr-1 text-[10px] text-muted">用途</span>
            {USAGES.map((u) => (
              <button
                key={u.value}
                type="button"
                onClick={() => setUsage(u.value)}
                className={cn('chip !py-1 !text-[10px]', usage === u.value && 'chip-active')}
              >
                {u.label}
              </button>
            ))}
          </div>

          {grouped.length ? (
            <div className="space-y-7">
              {grouped.map(([group, list]) => (
                <section key={group}>
                  <div className="mb-3 flex items-center gap-3">
                    <h2 className="serif text-lg">{group}</h2>
                    <span className="h-px flex-1 bg-line" />
                    <span className="text-[10px] text-muted">{list.length} 条</span>
                  </div>
                  <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                    {list.map((t) => (
                      <div key={t.id} className="card flex flex-col p-4">
                        <div className="flex items-center justify-between">
                          <span className="text-[10px] text-muted">{essayTypeLabel(t.type)}</span>
                          <div className="flex items-center gap-1">
                            <SpeakButton text={t.text_en} size={12} />
                            <button
                              type="button"
                              onClick={() => copy(t.text_en)}
                              className="grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
                              aria-label="复制"
                            >
                              <Copy size={12} />
                            </button>
                          </div>
                        </div>
                        <p className="mt-2 serif text-[15px] leading-relaxed text-ink">{t.text_en}</p>
                        <p className="mt-2 text-[11px] leading-relaxed text-muted">{t.text_cn}</p>
                        <div className="mt-3 flex flex-wrap gap-1">
                          {t.tags.map((tag) => (
                            <span key={tag} className="rounded-full bg-surface-2 px-2 py-0.5 text-[9px] text-muted">
                              {tag}
                            </span>
                          ))}
                        </div>
                      </div>
                    ))}
                  </div>
                </section>
              ))}
            </div>
          ) : (
            <EmptyState
              icon={<Quote size={22} />}
              title="没有符合条件的模板"
              description="换个类型或用途试试。"
            />
          )}
        </>
      )}
      <EssayImportModal open={importOpen} onClose={() => setImportOpen(false)} />
    </div>
  )
}
