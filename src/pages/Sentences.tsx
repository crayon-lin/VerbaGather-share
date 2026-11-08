import { useEffect, useMemo, useState } from 'react'
import { useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Copy, Pencil, Quote, Search, Sparkles, Star, Trash2, Upload } from 'lucide-react'
import { api } from '@/lib/api'
import { useSettings } from '@/lib/hooks'
import { PageHeader } from '@/components/PageHeader'
import { Modal } from '@/components/Modal'
import { SpeakButton } from '@/components/SpeakButton'
import { ClickableText } from '@/components/ClickableText'
import { EmptyState } from '@/components/EmptyState'
import { SentenceImportModal } from '@/components/SentenceImportModal'
import { useDebounced } from '@/lib/useDebounced'
import { toast } from '@/store/ui'
import {
  categoryLabel,
  cn,
  firstLine,
  levelLabel,
  sentenceByline,
  subcategoryLabel,
} from '@/lib/utils'
import type { Sentence } from '@shared/types'

const CATEGORIES = [
  { value: 'all', label: '全部' },
  { value: 'writing', label: '写作句型' },
  { value: 'motivational', label: '励志名言' },
  { value: 'literature', label: '名著摘抄' },
  { value: 'exam', label: '高频表达' },
  { value: 'custom', label: '我的句子' },
]

const SUBS = [
  { value: 'all', label: '全部' },
  { value: 'opening', label: '开头' },
  { value: 'transition', label: '过渡' },
  { value: 'argument', label: '论证' },
  { value: 'chart', label: '图表' },
  { value: 'ending', label: '结尾' },
]

export default function Sentences() {
  const { settings } = useSettings()
  const queryClient = useQueryClient()
  const [params, setParams] = useSearchParams()
  const [category, setCategory] = useState('all')
  const [sub, setSub] = useState('all')
  const [q, setQ] = useState('')
  const [onlyFav, setOnlyFav] = useState(false)
  const [selected, setSelected] = useState<Sentence | null>(null)
  const [showCn, setShowCn] = useState(false)
  const [importOpen, setImportOpen] = useState(false)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({
    text_en: '',
    text_cn: '',
    note: '',
    source: '',
    level: 'all',
    category: 'custom',
  })
  const debouncedQ = useDebounced(q, 250)

  const list = useQuery({
    queryKey: ['sentences', settings.level, category, debouncedQ, onlyFav],
    queryFn: () =>
      api.sentences({
        category,
        level: settings.level,
        q: debouncedQ,
        favorite: onlyFav,
      }),
  })
  const daily = useQuery({
    queryKey: ['daily-sentence', settings.level],
    queryFn: () => api.dailySentence(settings.level),
  })
  const favorite = useMutation({
    mutationFn: (id: string) => api.toggleFavorite('sentence', id),
    onSuccess: (res, id) => {
      toast(res.favorited ? '已收藏' : '已取消收藏')
      queryClient.invalidateQueries({ queryKey: ['sentences'] })
      queryClient.invalidateQueries({ queryKey: ['daily-sentence'] })
      queryClient.invalidateQueries({ queryKey: ['favorites'] })
      setSelected((prev) => (prev && prev.id === id ? { ...prev, favorite: res.favorited } : prev))
    },
  })
  const updateSentence = useMutation({
    mutationFn: () =>
      api.updateSentence(selected!.id, {
        ...draft,
        level: draft.level as Sentence['level'],
      }),
    onSuccess: () => {
      toast('句子已保存')
      if (selected) {
        setSelected({
          ...selected,
          ...draft,
          category: draft.category as Sentence['category'],
          level: draft.level as Sentence['level'],
        })
      }
      setEditing(false)
      queryClient.invalidateQueries({ queryKey: ['sentences'] })
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })
  const deleteSentence = useMutation({
    mutationFn: () => api.deleteSentence(selected!.id),
    onSuccess: () => {
      toast('句子已删除')
      setSelected(null)
      queryClient.invalidateQueries({ queryKey: ['sentences'] })
      queryClient.invalidateQueries({ queryKey: ['favorites'] })
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  useEffect(() => {
    if (!selected) return
    setDraft({
      text_en: selected.text_en,
      text_cn: selected.text_cn,
      note: selected.note,
      source: selected.source,
      level: selected.level,
      category: selected.category,
    })
    setEditing(false)
  }, [selected?.id])

  const items = list.data?.items ?? []
  const counts = list.data?.counts ?? {}
  const total = Object.values(counts).reduce((a, b) => a + b, 0)
  const visible = useMemo(
    () => (sub === 'all' ? items : items.filter((s) => s.subcategory === sub)),
    [items, sub],
  )
  const sentence = daily.data?.sentence

  useEffect(() => {
    const focus = params.get('focus')
    if (!focus) return
    const hit = items.find((s) => s.id === focus)
    if (hit) {
      setSelected(hit)
      params.delete('focus')
      setParams(params, { replace: true })
    }
  }, [items, params, setParams])

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text)
      toast('已复制')
    } catch {
      toast('复制失败，请手动选择文本', 'error')
    }
  }

  return (
    <div>
      <PageHeader
        eyebrow="Sentences"
        title="句子库"
        description="写作句型、励志名言、公版名著摘抄与四六级高频表达。点句子里的任意单词可以查义、听发音。"
        actions={
          <div className="flex items-center gap-2">
            <span className="hidden rounded-full border border-line bg-paper/85 px-2.5 py-1 text-[11px] text-ink-soft backdrop-blur-sm sm:inline">
              当前级别 · {levelLabel(settings.level)}
            </span>
            <button type="button" className="btn btn-primary" onClick={() => setImportOpen(true)}>
              <Upload size={14} />
              导入句子
            </button>
          </div>
        }
      />

      {sentence && (
        <section className="card relative mb-6 overflow-hidden">
          <div className="paper-grain absolute inset-0 opacity-40" />
          <div className="relative grid gap-6 p-6 sm:p-8 lg:grid-cols-[1.6fr_1fr]">
            <div>
              <div className="flex items-center gap-2">
                <span className="eyebrow">每日一句</span>
                <span className="h-px w-6 bg-line" />
                <span className="text-[10px] text-muted">{sentence.source || '佚名'}</span>
              </div>
              <blockquote className="mt-4">
                <p className="serif text-[26px] leading-[1.45] text-ink sm:text-[32px]">
                  “<ClickableText text={sentence.text_en} hint={false} />”
                </p>
                {showCn && (
                  <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted animate-fade-up">
                    {sentence.text_cn}
                  </p>
                )}
              </blockquote>
              <div className="mt-5 flex flex-wrap items-center gap-2">
                <SpeakButton text={sentence.text_en} size={18} />
                <button
                  type="button"
                  onClick={() => setShowCn((v) => !v)}
                  className="text-[11px] font-medium text-forest hover:underline"
                >
                  {showCn ? '收起译文' : '查看译文'}
                </button>
                <button
                  type="button"
                  onClick={() => favorite.mutate(sentence.id)}
                  className={cn(
                    'ml-1 inline-flex items-center gap-1 text-[11px]',
                    sentence.favorite ? 'text-amber' : 'text-muted hover:text-ink',
                  )}
                >
                  <Star size={13} fill={sentence.favorite ? 'currentColor' : 'none'} />
                  {sentence.favorite ? '已收藏' : '收藏'}
                </button>
              </div>
            </div>
            <div className="flex flex-col justify-between rounded-2xl border border-line/70 bg-surface-2/40 p-4">
              <div>
                <p className="eyebrow">今日提示</p>
                <p className="mt-2 text-[12px] leading-relaxed text-ink-soft">
                  {sentence.note}
                </p>
              </div>
              <div className="mt-4 flex flex-wrap gap-1.5">
                {sentence.tags.map((t) => (
                  <span key={t} className="chip !text-[10px]">
                    {t}
                  </span>
                ))}
              </div>
            </div>
          </div>
        </section>
      )}

      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center">
        <div className="flex flex-wrap gap-1.5">
          {CATEGORIES.map((c) => (
            <button
              key={c.value}
              type="button"
              onClick={() => {
                setCategory(c.value)
                setSub('all')
              }}
              className={cn('chip !px-3 !py-1.5', category === c.value && 'chip-active')}
            >
              {c.label}
              {c.value === 'all' ? (
                <span className="ml-1 text-[9px] opacity-60">{total}</span>
              ) : counts[c.value] ? (
                <span className="ml-1 text-[9px] opacity-60">{counts[c.value]}</span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="relative sm:ml-auto sm:w-64">
          <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索英文或译文"
            className="field !py-1.5 !pl-8 !text-xs"
          />
        </div>
        <button
          type="button"
          onClick={() => setOnlyFav((v) => !v)}
          className={cn('chip !py-1.5', onlyFav && 'chip-active')}
        >
          <Star size={12} fill={onlyFav ? 'currentColor' : 'none'} />
          收藏
        </button>
      </div>

      {category === 'writing' && (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {SUBS.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setSub(s.value)}
              className={cn('chip !py-1 !text-[10px]', sub === s.value && 'chip-active')}
            >
              {s.label}
            </button>
          ))}
        </div>
      )}

      {list.isLoading ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {[0, 1, 2, 3, 4, 5].map((i) => (
            <div key={i} className="h-48 skeleton rounded-2xl" />
          ))}
        </div>
      ) : visible.length ? (
        <div className="columns-1 gap-4 sm:columns-2 xl:columns-3">
          {visible.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSelected(s)}
              className="card mb-4 block w-full break-inside-avoid p-5 text-left transition-colors hover:border-line-strong"
            >
              <div className="flex items-start justify-between gap-2">
                <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted">
                  {categoryLabel(s.category)}
                  {s.category === 'writing' ? ` · ${subcategoryLabel(s.subcategory)}` : ''}
                </span>
                <span className="flex items-center gap-0.5">
                  {[1, 2, 3].map((d) => (
                    <span
                      key={d}
                      className={cn(
                        'h-1 w-1 rounded-full',
                        d <= s.difficulty ? 'bg-amber' : 'bg-line-strong/40',
                      )}
                    />
                  ))}
                </span>
              </div>
              <p className="mt-3 serif text-[17px] leading-relaxed text-ink">
                {firstLine(s.text_en, 180)}
              </p>
              <p className="mt-2 line-clamp-2 text-[11px] leading-relaxed text-muted">{s.text_cn}</p>
              <div className="mt-3 flex items-center justify-between border-t border-line/60 pt-2.5 text-[10px] text-muted">
                <span className="truncate">{sentenceByline(s)}</span>
                <span className="flex items-center gap-1.5">
                  {s.favorite && <Star size={11} className="text-amber" fill="currentColor" />}
                  <SpeakButton text={s.text_en} size={12} />
                </span>
              </div>
            </button>
          ))}
        </div>
      ) : (
        <EmptyState
          icon={<Quote size={22} />}
          title="没有找到符合条件的句子"
          description="试试换个分类，或者清空搜索。"
          action={
            <button
              type="button"
              className="btn btn-ghost"
              onClick={() => {
                setQ('')
                setCategory('all')
                setSub('all')
                setOnlyFav(false)
              }}
            >
              清空筛选
            </button>
          }
        />
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        size="lg"
        title={
          selected ? (
            <span className="flex items-center gap-2 text-sm">
              <span className="rounded-full bg-surface-2 px-2 py-0.5 text-[10px] text-muted">
                {categoryLabel(selected.category)}
              </span>
              {selected.is_custom ? '自定义' : selected.source || '佚名'}
            </span>
          ) : (
            ''
          )
        }
        footer={
          selected ? (
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="flex gap-1.5">
                {selected.tags.map((t) => (
                  <span key={t} className="chip !text-[10px]">
                    {t}
                  </span>
                ))}
              </div>
              <div className="flex items-center gap-2">
                {selected.is_custom && !editing && (
                  <button
                    type="button"
                    className="btn btn-ghost !py-1.5 !text-xs"
                    onClick={() => setEditing(true)}
                  >
                    <Pencil size={13} />
                    编辑
                  </button>
                )}
                {selected.is_custom && (
                  <button
                    type="button"
                    className="btn btn-ghost !py-1.5 !text-xs !text-danger"
                    disabled={deleteSentence.isPending}
                    onClick={() => {
                      if (window.confirm('删除这条自定义句子？收藏也会一并移除。')) deleteSentence.mutate()
                    }}
                  >
                    <Trash2 size={13} />
                    删除
                  </button>
                )}
                <button
                  type="button"
                  className="btn btn-ghost !py-1.5 !text-xs"
                  onClick={() => copy(`“${selected.text_en}”\n${selected.text_cn}\n— ${sentenceByline(selected)}`)}
                >
                  <Copy size={13} />
                  复制
                </button>
                <button
                  type="button"
                  className={cn(
                    'btn !py-1.5 !text-xs',
                    selected.favorite ? 'btn-soft' : 'btn-ghost',
                  )}
                  onClick={() => favorite.mutate(selected.id)}
                >
                  <Star size={13} fill={selected.favorite ? 'currentColor' : 'none'} />
                  {selected.favorite ? '已收藏' : '收藏'}
                </button>
              </div>
            </div>
          ) : undefined
        }
      >
        {selected && (
          <div className="p-6">
            {editing ? (
              <div className="space-y-4">
                <div>
                  <label className="label" htmlFor="edit-sentence-en">英文</label>
                  <textarea
                    id="edit-sentence-en"
                    className="field min-h-[96px] serif !text-[18px] leading-relaxed"
                    value={draft.text_en}
                    onChange={(e) => setDraft({ ...draft, text_en: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="edit-sentence-cn">译文</label>
                  <textarea
                    id="edit-sentence-cn"
                    className="field min-h-[72px]"
                    value={draft.text_cn}
                    onChange={(e) => setDraft({ ...draft, text_cn: e.target.value })}
                  />
                </div>
                <div className="grid gap-3 sm:grid-cols-2">
                  <div>
                    <label className="label" htmlFor="edit-sentence-cat">分类</label>
                    <select
                      id="edit-sentence-cat"
                      className="field"
                      value={draft.category}
                      onChange={(e) => setDraft({ ...draft, category: e.target.value })}
                    >
                      {CATEGORIES.filter((c) => c.value !== 'all').map((c) => (
                        <option key={c.value} value={c.value}>{c.label}</option>
                      ))}
                    </select>
                  </div>
                  <div>
                    <label className="label" htmlFor="edit-sentence-level">级别</label>
                    <select
                      id="edit-sentence-level"
                      className="field"
                      value={draft.level}
                      onChange={(e) => setDraft({ ...draft, level: e.target.value })}
                    >
                      <option value="all">不限</option>
                      <option value="cet4">四级</option>
                      <option value="cet6">六级</option>
                    </select>
                  </div>
                </div>
                <div>
                  <label className="label" htmlFor="edit-sentence-source">来源</label>
                  <input
                    id="edit-sentence-source"
                    className="field"
                    value={draft.source}
                    onChange={(e) => setDraft({ ...draft, source: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="edit-sentence-note">备注 / 亮点</label>
                  <textarea
                    id="edit-sentence-note"
                    className="field min-h-[64px]"
                    value={draft.note}
                    onChange={(e) => setDraft({ ...draft, note: e.target.value })}
                  />
                </div>
                <div className="flex justify-end gap-2">
                  <button type="button" className="btn btn-ghost" onClick={() => setEditing(false)}>
                    取消
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!draft.text_en.trim() || updateSentence.isPending}
                    onClick={() => updateSentence.mutate()}
                  >
                    保存
                  </button>
                </div>
              </div>
            ) : (
              <>
                <div className="flex items-start gap-2">
                  <span className="serif text-2xl text-amber">“</span>
                  <div className="flex-1">
                    <ClickableText
                      text={selected.text_en}
                      className="serif text-[24px] leading-[1.55] text-ink"
                      hint={false}
                    />
                  </div>
                  <SpeakButton text={selected.text_en} size={18} className="shrink-0" />
                </div>
                <div className="mt-5 rounded-xl bg-surface-2/50 p-4">
                  <p className="eyebrow mb-1.5">译文</p>
                  <p className="text-[14px] leading-relaxed text-ink-soft">{selected.text_cn || '暂无译文'}</p>
                </div>
                <div className="mt-5">
                  <p className="eyebrow mb-1.5">亮点</p>
                  <p className="text-[13px] leading-relaxed text-muted">{selected.note || '可以点编辑补充讲解。'}</p>
                </div>
                <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-line pt-4 text-[11px] text-muted">
                  <span>{sentenceByline(selected)}</span>
                  <span className="flex items-center gap-1">
                    {[1, 2, 3].map((d) => (
                      <span
                        key={d}
                        className={cn('h-1.5 w-1.5 rounded-full', d <= selected.difficulty ? 'bg-amber' : 'bg-line')}
                      />
                    ))}
                    <span className="ml-1">{'★'.repeat(selected.difficulty)}</span>
                  </span>
                </div>
              </>
            )}
          </div>
        )}
      </Modal>

      <SentenceImportModal open={importOpen} onClose={() => setImportOpen(false)} />


      <div className="mt-8 flex items-center justify-center gap-2 text-[10px] text-muted">
        <Sparkles size={12} />
        点开句子后，点击英文单词即可查义、听发音
      </div>
    </div>
  )
}
