import { useState, type ReactNode } from 'react'
import { createPortal } from 'react-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BookPlus, Loader2, Volume2 } from 'lucide-react'
import { api } from '@/lib/api'
import { toast } from '@/store/ui'
import { cn, clamp } from '@/lib/utils'
import { speak } from '@/lib/tts'
import { useSettings } from '@/lib/hooks'

const TOKEN = /(\b[A-Za-z][A-Za-z'’-]{1,}\b)/g

export function ClickableText({
  text,
  className,
  hint = false,
}: {
  text: string
  className?: string
  hint?: boolean
}) {
  const [pop, setPop] = useState<{ term: string; x: number; y: number } | null>(null)
  const queryClient = useQueryClient()
  const { settings } = useSettings()
  const dict = useQuery({
    queryKey: ['dict', pop?.term],
    queryFn: () => api.dict(pop!.term),
    enabled: Boolean(pop),
    staleTime: 5 * 60_000,
  })
  const add = useMutation({
    mutationFn: (term: string) => api.createWord({ term, bookId: 'b_newwords' }),
    onSuccess: (data) => {
      toast(data.created ? `已把 ${data.word.term} 收进生词本` : `${data.word.term} 已在生词本中`)
      queryClient.invalidateQueries({ queryKey: ['books'] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
      queryClient.invalidateQueries({ queryKey: ['dict'] })
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  const parts = text.split(TOKEN)
  const openAt = (term: string, el: HTMLElement) => {
    const selection = window.getSelection()
    // 正在选词/选句时，把空间留给 AI 翻译按钮，不弹查词卡。
    if (selection && !selection.isCollapsed && selection.toString().trim()) return
    const rect = el.getBoundingClientRect()
    setPop({ term, x: rect.left, y: rect.bottom })
  }

  return (
    <>
      <span className={cn(className)}>
        {parts.map((part, i) =>
          /^[A-Za-z][A-Za-z'’-]+$/.test(part) ? (
            <span
              key={`${part}-${i}`}
              role="button"
              tabIndex={0}
              onClick={(e) => openAt(part, e.currentTarget)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault()
                  openAt(part, e.currentTarget)
                }
              }}
              className="cursor-pointer rounded-[3px] transition-colors hover:bg-forest-soft hover:text-forest focus-visible:bg-forest-soft"
              title="点击查词"
            >
              {part}
            </span>
          ) : (
            <span key={i}>{part}</span>
          ),
        )}
      </span>
      {hint && text.length > 24 && (
        <span className="ml-1 align-middle text-[10px] text-muted/70 select-none">点词查义</span>
      )}

      {pop &&
        createPortal(
          <div className="fixed inset-0 z-[75]" onMouseDown={() => setPop(null)}>
            <div
              className="fixed z-[76] w-[300px] max-w-[calc(100vw-24px)] rounded-2xl border border-line bg-surface p-4 shadow-[var(--shadow-float)] animate-scale-in"
              style={{
                left: clamp(pop.x - 20, 12, window.innerWidth - 312),
                top:
                  pop.y + 232 > window.innerHeight
                    ? Math.max(12, pop.y - 240)
                    : pop.y + 12,
              }}
              onMouseDown={(e) => e.stopPropagation()}
            >
              {dict.isLoading ? (
                <div className="flex items-center gap-2 py-4 text-sm text-muted">
                  <Loader2 size={16} className="animate-spin" /> 查词中…
                </div>
              ) : dict.data?.found ? (
                <>
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <div className="serif text-2xl leading-none">{dict.data.term}</div>
                      <div className="mt-1.5 flex items-center gap-1.5 font-mono text-[11px] text-muted">
                        {dict.data.phonetic}
                        {dict.data.lemma && (
                          <span className="rounded-full bg-surface-2 px-1.5 py-0.5 font-sans text-[9px]">
                            原形
                          </span>
                        )}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        speak(dict.data!.term, { accent: settings.ttsAccent, rate: settings.ttsRate })
                      }
                      className="grid h-8 w-8 place-items-center rounded-full text-forest hover:bg-forest-soft"
                      aria-label="朗读"
                    >
                      <Volume2 size={16} />
                    </button>
                  </div>
                  <div className="mt-2.5 max-h-40 overflow-y-auto whitespace-pre-line text-sm leading-relaxed text-ink-soft">
                    {dict.data.translation || '暂无释义'}
                  </div>
                  <div className="mt-3 flex items-center justify-between border-t border-line pt-2.5">
                    <span className="text-[10px] text-muted">{dict.data.pos || '本地词典'}</span>
                    <button
                      type="button"
                      disabled={add.isPending || dict.data.inWordBook}
                      onClick={() => add.mutate(dict.data!.term)}
                      className="inline-flex items-center gap-1 text-[11px] font-medium text-forest disabled:opacity-50"
                    >
                      <BookPlus size={13} />
                      {dict.data.inWordBook ? '已在生词本' : '收进生词本'}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <div className="serif text-lg">{dict.data?.term}</div>
                  <p className="mt-2 text-sm text-muted">本地词典暂未收录这个词。</p>
                  {Boolean(dict.data?.suggestions?.length) && (
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {dict.data!.suggestions!.map((s) => (
                        <button
                          key={s}
                          type="button"
                          className="chip"
                          onClick={() => setPop({ ...pop, term: s, x: pop.x, y: pop.y })}
                        >
                          {s}
                        </button>
                      ))}
                    </div>
                  )}
                </>
              )}
            </div>
          </div>,
          document.body,
        )}
    </>
  )
}

export function WordHint({ children }: { children: ReactNode }) {
  return <span className="text-[10px] text-muted">{children}</span>
}
