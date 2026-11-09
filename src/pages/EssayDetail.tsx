import { useEffect, useMemo, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowLeft,
  Copy,
  Pause,
  Play,
  Printer,
  Star,
  Volume2,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useSettings } from '@/lib/hooks'
import { SpeakButton } from '@/components/SpeakButton'
import { ClickableText } from '@/components/ClickableText'
import { Badge } from '@/components/Badge'
import { EmptyState } from '@/components/EmptyState'
import { toast } from '@/store/ui'
import { categoryLabel, cn, essayTypeLabel } from '@/lib/utils'
import { speak, stopSpeaking } from '@/lib/tts'
import type { EssayParagraph } from '@shared/types'

function splitSentences(text: string): string[] {
  return (
    text
      .match(/[^.!?]+[.!?]+["'”]?|[^.!?]+$/g)
      ?.map((s) => s.trim())
      .filter(Boolean) ?? [text]
  )
}

export default function EssayDetail() {
  const { id = '' } = useParams()
  const { settings } = useSettings()
  const queryClient = useQueryClient()
  const [showCn, setShowCn] = useState(true)
  const [reading, setReading] = useState(false)
  const [active, setActive] = useState<{ p: number; s: number } | null>(null)
  const essayQuery = useQuery({ queryKey: ['essay', id], queryFn: () => api.essay(id) })
  const essay = essayQuery.data?.essay

  const favorite = useMutation({
    mutationFn: () => api.toggleFavorite('essay', id),
    onSuccess: (res) => {
      toast(res.favorited ? '已收藏' : '已取消收藏')
      queryClient.invalidateQueries({ queryKey: ['essay', id] })
      queryClient.invalidateQueries({ queryKey: ['essays'] })
      queryClient.invalidateQueries({ queryKey: ['favorites'] })
    },
  })

  const sentences = useMemo(() => {
    if (!essay) return [] as Array<{ text: string; p: number; s: number }>
    return essay.paragraphs.flatMap((para: EssayParagraph, p: number) =>
      splitSentences(para.en).map((text, s) => ({ text, p, s })),
    )
  }, [essay])

  useEffect(() => {
    return () => stopSpeaking()
  }, [])

  const readAll = () => {
    if (reading) {
      stopSpeaking()
      setReading(false)
      setActive(null)
      return
    }
    if (!sentences.length) return
    setReading(true)
    let i = 0
    const next = () => {
      if (i >= sentences.length) {
        setReading(false)
        setActive(null)
        return
      }
      const cur = sentences[i]
      setActive({ p: cur.p, s: cur.s })
      i += 1
      speak(cur.text, {
        accent: settings.ttsAccent,
        rate: settings.ttsRate,
        onEnd: next,
        onError: () => {
          setReading(false)
          setActive(null)
        },
      })
    }
    next()
  }

  const copy = async () => {
    if (!essay) return
    const text = [
      essay.title_cn,
      essay.title_en,
      '',
      ...essay.paragraphs.map((p) => p.en),
      '',
      `— ${essay.word_count} 词 · 拾词 Inkling`,
    ].join('\n')
    try {
      await navigator.clipboard.writeText(text)
      toast('范文已复制')
    } catch {
      toast('复制失败', 'error')
    }
  }

  if (essayQuery.isLoading) {
    return (
      <div className="mx-auto max-w-4xl">
        <div className="h-24 skeleton rounded-2xl" />
      </div>
    )
  }
  if (!essay) {
    return (
      <EmptyState
        title="作文不存在"
        description="它可能已被移除。"
        action={
          <Link to="/essays" className="btn btn-primary">
            返回作文库
          </Link>
        }
      />
    )
  }

  return (
    <div className="mx-auto max-w-6xl">
      <div className="no-print mb-5 flex flex-wrap items-center justify-between gap-2">
        <Link
          to="/essays"
          className="inline-flex items-center gap-1 text-xs text-muted transition-colors hover:text-ink"
        >
          <ArrowLeft size={14} />
          作文库
        </Link>
        <div className="flex items-center gap-1.5">
          <button
            type="button"
            onClick={readAll}
            className={cn('btn btn-ghost !py-1.5 !text-xs', reading && '!border-forest !text-forest')}
          >
            {reading ? <Pause size={13} /> : <Play size={13} />}
            {reading ? '停止朗读' : '朗读全文'}
          </button>
          <button type="button" onClick={copy} className="btn btn-ghost !py-1.5 !text-xs">
            <Copy size={13} />
            复制
          </button>
          <button type="button" onClick={() => window.print()} className="btn btn-ghost !py-1.5 !text-xs">
            <Printer size={13} />
            打印
          </button>
          <button
            type="button"
            onClick={() => favorite.mutate()}
            className={cn(
              'btn !py-1.5 !text-xs',
              essay.favorite ? 'btn-soft' : 'btn-ghost',
            )}
          >
            <Star size={13} fill={essay.favorite ? 'currentColor' : 'none'} />
            {essay.favorite ? '已收藏' : '收藏'}
          </button>
        </div>
      </div>

      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-1.5">
          <Badge variant={essay.level === 'cet6' ? 'amber' : 'forest'}>
            {essay.level === 'cet6' ? 'CET-6' : 'CET-4'}
          </Badge>
          <Badge variant="outline">{essayTypeLabel(essay.type)}</Badge>
          <span className="text-[10px] text-muted">{essay.word_count} 词</span>
        </div>
        <h1 className="mt-3 serif text-balance text-[34px] leading-tight sm:text-[42px]">
          {essay.title_cn}
        </h1>
        <p className="mt-1.5 text-sm text-muted">{essay.title_en}</p>
      </header>

      <div className="grid gap-6 lg:grid-cols-[1.65fr_1fr]">
        <div className="min-w-0">
          <details className="card mb-5 p-4" open>
            <summary className="cursor-pointer text-[11px] font-medium text-muted">
              题目要求 · Directions
            </summary>
            <p className="mt-3 whitespace-pre-line text-[12.5px] leading-relaxed text-ink-soft">
              {essay.prompt_cn}
            </p>
          </details>

          <div className="mb-4 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => setShowCn((v) => !v)}
                className={cn('chip !py-1.5 !text-[11px]', showCn && 'chip-active')}
              >
                {showCn ? '隐藏译文' : '对照译文'}
              </button>
              <span className="text-[10px] text-muted">点任意英文单词可查义</span>
            </div>
            <SpeakButton text={essay.paragraphs.map((p) => p.en).join(' ')} size={16} />
          </div>

          <article className="card p-5 sm:p-8">
            {essay.paragraphs.map((para, pi) => {
              const parts = splitSentences(para.en)
              return (
                <section key={pi} className={cn('mb-8 last:mb-0')}>
                  <div className="mb-2 flex items-center gap-2">
                    <span className="text-[10px] font-medium uppercase tracking-[0.12em] text-forest">
                      {para.role || `第 ${pi + 1} 段`}
                    </span>
                    <span className="h-px flex-1 bg-line/70" />
                    <span className="text-[9px] text-muted">{parts.length} 句</span>
                  </div>
                  <p className="serif text-[17px] leading-[1.9] text-ink sm:text-[18px]">
                    {parts.map((sentence, si) => (
                      <span
                        key={si}
                        className={cn(
                          'rounded px-0.5 transition-colors',
                          active?.p === pi && active?.s === si && 'bg-amber-soft/80',
                        )}
                      >
                        <ClickableText text={`${sentence} `} hint={false} />
                      </span>
                    ))}
                  </p>
                  {showCn && (
                    <p className="mt-2.5 border-l-2 border-line pl-3 text-[13px] leading-relaxed text-muted">
                      {para.cn}
                    </p>
                  )}
                </section>
              )
            })}
          </article>
        </div>

        <aside className="space-y-4">
          <div className="card p-5">
            <p className="eyebrow">结构提纲</p>
            <div className="mt-3 space-y-4">
              {essay.outline.map((part, i) => (
                <div key={i}>
                  <div className="flex items-center gap-2 text-[12px] font-medium">
                    <span className="grid h-5 w-5 place-items-center rounded-full bg-forest-soft text-[10px] text-forest">
                      {i + 1}
                    </span>
                    {part.part}
                  </div>
                  <ul className="mt-1.5 space-y-1 pl-7 text-[11px] leading-relaxed text-muted">
                    {part.points.map((point) => (
                      <li key={point}>· {point}</li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>

          <div className="card p-5">
            <p className="eyebrow">亮点词句</p>
            <div className="mt-3 space-y-3">
              {essay.highlights.map((h, i) => (
                <div key={i} className="rounded-xl bg-surface-2/50 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <p className="serif text-[13px] leading-relaxed text-ink">{h.text}</p>
                    <SpeakButton text={h.text} size={12} className="shrink-0" />
                  </div>
                  <div className="mt-1.5 flex items-center gap-1.5">
                    <span className="rounded-full bg-surface px-1.5 py-0.5 text-[9px] text-forest">
                      {h.type}
                    </span>
                    <p className="text-[10px] leading-relaxed text-muted">{h.note}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {essay.tips.length > 0 && (
            <div className="card p-5">
              <p className="eyebrow">评分要点</p>
              <ul className="mt-2 space-y-1.5 text-[11px] leading-relaxed text-muted">
                {essay.tips.map((tip) => (
                  <li key={tip}>· {tip}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="no-print flex items-center justify-between rounded-2xl border border-line bg-surface-2/40 px-4 py-3">
            <span className="text-[11px] text-muted">用这篇的题目练一次</span>
            <Link
              to={`/essays/practice?prompt=${encodeURIComponent(essay.title_cn)}`}
              className="text-[11px] font-medium text-forest hover:underline"
            >
              去写作 →
            </Link>
          </div>
        </aside>
      </div>
    </div>
  )
}
