import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import {
  Check,
  Copy,
  Languages,
  Loader2,
  MessageSquare,
  Send,
  Sparkles,
  X,
} from 'lucide-react'
import type { AiChatMessage } from '@shared/types'
import { api } from '@/lib/api'
import { useUIStore, toast } from '@/store/ui'
import { cn } from '@/lib/utils'

type SelectionState = {
  text: string
  left: number
  top: number
  rect: { left: number; top: number; bottom: number; width: number; height: number }
}

type PopoverState = {
  text: string
  left: number
  top: number
}

type Session = {
  text: string
  translation: string
  messages: AiChatMessage[]
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value))
}

export function AITranslate() {
  const panelOpen = useUIStore((s) => s.aiPanelOpen)
  const setPanelOpen = useUIStore((s) => s.setAiPanelOpen)
  const [selection, setSelection] = useState<SelectionState | null>(null)
  const [popover, setPopover] = useState<PopoverState | null>(null)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [translation, setTranslation] = useState('')
  const [copied, setCopied] = useState(false)
  const requestId = useRef(0)

  const [session, setSession] = useState<Session | null>(null)
  const [input, setInput] = useState('')
  const [sending, setSending] = useState(false)
  const [panelError, setPanelError] = useState('')
  const scrollRef = useRef<HTMLDivElement>(null)

  const syncSelection = () => {
    const sel = window.getSelection()
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) {
      setSelection(null)
      return
    }
    const text = sel.toString().replace(/\s+/g, ' ').trim()
    if (!text || text.length > 1000) {
      setSelection(null)
      return
    }
    const node = sel.anchorNode
    const element = node instanceof Element ? node : node?.parentElement
    if (
      element?.closest(
        '[data-ai-translate], input, textarea, select, [contenteditable="true"]',
      )
    ) {
      setSelection(null)
      return
    }
    const range = sel.getRangeAt(0)
    const rect = range.getBoundingClientRect()
    if (!rect.width || !rect.height) {
      setSelection(null)
      return
    }
    const buttonWidth = 112
    const buttonHeight = 34
    const left = clamp(
      rect.left + rect.width / 2 - buttonWidth / 2,
      8,
      Math.max(8, window.innerWidth - buttonWidth - 8),
    )
    const above = rect.top - buttonHeight - 8
    const top =
      above >= 8
        ? above
        : Math.min(window.innerHeight - buttonHeight - 8, rect.bottom + 8)
    setSelection({
      text,
      left,
      top,
      rect: {
        left: rect.left,
        top: rect.top,
        bottom: rect.bottom,
        width: rect.width,
        height: rect.height,
      },
    })
  }

  useEffect(() => {
    const onMouseUp = () => window.setTimeout(syncSelection, 0)
    const onKeyUp = (event: KeyboardEvent) => {
      if (event.shiftKey || event.key.startsWith('Arrow')) syncSelection()
    }
    const onTouchEnd = () => window.setTimeout(syncSelection, 80)
    const onScroll = () => setSelection(null)
    const onResize = () => setSelection(null)
    document.addEventListener('mouseup', onMouseUp)
    document.addEventListener('keyup', onKeyUp)
    document.addEventListener('touchend', onTouchEnd)
    window.addEventListener('scroll', onScroll, true)
    window.addEventListener('resize', onResize)
    return () => {
      document.removeEventListener('mouseup', onMouseUp)
      document.removeEventListener('keyup', onKeyUp)
      document.removeEventListener('touchend', onTouchEnd)
      window.removeEventListener('scroll', onScroll, true)
      window.removeEventListener('resize', onResize)
    }
  }, [])

  useEffect(() => {
    if (!popover) return
    const onDown = (event: MouseEvent) => {
      const target = event.target
      if (target instanceof Element && target.closest('[data-ai-translate]')) return
      setPopover(null)
    }
    document.addEventListener('mousedown', onDown)
    return () => document.removeEventListener('mousedown', onDown)
  }, [popover])

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return
      setPopover(null)
      setSelection(null)
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [])

  useEffect(() => {
    if (!panelOpen) return
    const node = scrollRef.current
    if (node) node.scrollTop = node.scrollHeight
  }, [panelOpen, session?.messages.length, sending])

  const openTranslation = async () => {
    if (!selection) return
    const text = selection.text
    const width = Math.min(380, window.innerWidth - 16)
    const left = clamp(selection.rect.left, 8, Math.max(8, window.innerWidth - width - 8))
    let top = selection.rect.bottom + 10
    if (top + 390 > window.innerHeight) {
      top = Math.max(8, selection.rect.top - 400)
    }
    setPopover({ text, left, top })
    setSelection(null)
    setTranslation('')
    setError('')
    setCopied(false)
    setLoading(true)
    window.getSelection()?.removeAllRanges()
    const current = ++requestId.current
    try {
      const result = await api.aiTranslate({ text })
      if (current !== requestId.current) return
      setTranslation(result.reply)
    } catch (err) {
      if (current !== requestId.current) return
      setError((err as Error).message)
    } finally {
      if (current === requestId.current) setLoading(false)
    }
  }

  const copyTranslation = async () => {
    if (!translation) return
    try {
      await navigator.clipboard.writeText(translation)
      setCopied(true)
      toast('译文已复制')
      window.setTimeout(() => setCopied(false), 1500)
    } catch {
      toast('复制失败，请手动选中文本', 'error')
    }
  }

  const startChat = () => {
    if (!popover || !translation) return
    setSession({
      text: popover.text,
      translation,
      messages: [{ role: 'assistant', content: translation }],
    })
    setPanelOpen(true)
    setPopover(null)
    setInput('')
    setPanelError('')
  }

  const sendMessage = async () => {
    const question = input.trim()
    if (!question || !session || sending) return
    const activeText = session.text
    const history = session.messages.slice(1)
    const userMessage: AiChatMessage = { role: 'user', content: question }
    setSession((prev) =>
      prev ? { ...prev, messages: [...prev.messages, userMessage] } : prev,
    )
    setInput('')
    setPanelError('')
    setSending(true)
    try {
      const result = await api.aiTranslate({
        text: activeText,
        question,
        translation: session.translation,
        history,
      })
      setSession((prev) => {
        if (!prev || prev.text !== activeText) return prev
        return {
          ...prev,
          messages: [...prev.messages, { role: 'assistant', content: result.reply }],
        }
      })
    } catch (err) {
      setPanelError((err as Error).message)
    } finally {
      setSending(false)
    }
  }

  return (
    <>
      {selection && !popover && (
        <button
          type="button"
          data-ai-translate
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => void openTranslation()}
          className="fixed z-[70] inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-1.5 text-[11px] font-medium text-forest shadow-[var(--shadow-float)] transition-colors hover:bg-forest-soft"
          style={{ left: selection.left, top: selection.top }}
        >
          <Languages size={13} />
          AI 翻译
        </button>
      )}

      {popover && (
        <div
          data-ai-translate
          className="fixed z-[70] w-[min(380px,calc(100vw-16px))] overflow-hidden rounded-2xl border border-line bg-surface shadow-[var(--shadow-float)]"
          style={{ left: popover.left, top: popover.top }}
        >
          <div className="flex items-center justify-between border-b border-line px-4 py-3">
            <div className="flex items-center gap-2">
              <span className="grid h-7 w-7 place-items-center rounded-full bg-forest-soft text-forest">
                <Languages size={14} />
              </span>
              <div>
                <div className="text-[12px] font-medium">AI 翻译</div>
                <div className="text-[9px] text-muted">选中文本 · 可继续追问</div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setPopover(null)}
              className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
              aria-label="关闭翻译"
            >
              <X size={14} />
            </button>
          </div>

          <div className="max-h-[64vh] overflow-y-auto px-4 py-3">
            <div className="rounded-xl bg-surface-2/60 px-3 py-2 text-[11px] leading-relaxed text-muted">
              <span className="mr-1 text-[9px] uppercase tracking-[0.12em]">原文</span>
              <span className="text-ink-soft">{popover.text}</span>
            </div>

            {loading ? (
              <div className="flex items-center justify-center gap-2 py-8 text-[11px] text-muted">
                <Loader2 size={14} className="animate-spin" />
                正在翻译…
              </div>
            ) : error ? (
              <div className="py-4">
                <p className="text-[11px] leading-relaxed text-danger">{error}</p>
                <Link
                  to="/settings"
                  className="mt-2 inline-block text-[10px] text-forest hover:underline"
                  onClick={() => setPopover(null)}
                >
                  打开「设置 → AI 翻译」配置 →
                </Link>
              </div>
            ) : (
              <div className="mt-3 whitespace-pre-wrap text-[13px] leading-relaxed text-ink">
                {translation}
              </div>
            )}
          </div>

          <div className="flex items-center justify-between gap-2 border-t border-line px-4 py-3">
            <button
              type="button"
              className="inline-flex items-center gap-1 text-[10px] text-muted hover:text-ink disabled:opacity-40"
              onClick={() => void copyTranslation()}
              disabled={!translation}
            >
              {copied ? <Check size={12} /> : <Copy size={12} />}
              {copied ? '已复制' : '复制译文'}
            </button>
            <button
              type="button"
              className="btn btn-primary !py-1.5 !text-xs"
              onClick={startChat}
              disabled={!translation}
            >
              <Sparkles size={13} />
              继续追问
            </button>
          </div>
        </div>
      )}

      {session && !panelOpen && (
        <button
          type="button"
          data-ai-translate
          onClick={() => setPanelOpen(true)}
          className="fixed bottom-20 right-4 z-[45] inline-flex items-center gap-1.5 rounded-full border border-line bg-surface px-3 py-2 text-[11px] font-medium text-forest shadow-[var(--shadow-float)] hover:bg-forest-soft xl:bottom-6 xl:right-6"
        >
          <MessageSquare size={14} />
          AI 对话
        </button>
      )}

      {panelOpen && session && (
        <>
          <div
            className="fixed inset-0 z-40 bg-ink/20 backdrop-blur-[1px] xl:hidden"
            onClick={() => setPanelOpen(false)}
            aria-hidden="true"
          />
          <aside
            data-ai-translate
            aria-label="AI 翻译对话"
            className="fixed inset-y-0 right-0 z-50 flex w-[min(360px,92vw)] flex-col border-l border-line bg-paper/95 shadow-[var(--shadow-float)] backdrop-blur-xl xl:w-[360px]"
          >
            <header className="flex h-16 shrink-0 items-center justify-between border-b border-line px-4">
              <div className="flex items-center gap-2.5">
                <span className="grid h-8 w-8 place-items-center rounded-full bg-forest-soft text-forest">
                  <Languages size={15} />
                </span>
                <div>
                  <div className="text-[13px] font-medium">AI 翻译 · 对话</div>
                  <div className="mt-0.5 text-[9px] text-muted">围绕选中文本继续提问</div>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setPanelOpen(false)}
                className="grid h-8 w-8 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
                aria-label="收起对话"
              >
                <X size={15} />
              </button>
            </header>

            <div className="shrink-0 border-b border-line px-4 py-3">
              <div className="flex items-center justify-between">
                <span className="eyebrow">原文</span>
                <button
                  type="button"
                  onClick={async () => {
                    try {
                      await navigator.clipboard.writeText(session.text)
                      toast('原文已复制')
                    } catch {
                      toast('复制失败', 'error')
                    }
                  }}
                  className="text-[9px] text-muted hover:text-ink"
                >
                  复制
                </button>
              </div>
              <p className="mt-1.5 max-h-24 overflow-y-auto whitespace-pre-wrap text-[11px] leading-relaxed text-ink-soft">
                {session.text}
              </p>
            </div>

            <div ref={scrollRef} className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
              {session.messages.map((message, index) => (
                <div
                  key={`${message.role}-${index}`}
                  className={cn(
                    'rounded-2xl px-3 py-2.5 text-[12px] leading-relaxed',
                    message.role === 'user'
                      ? 'ml-7 bg-forest-soft text-ink'
                      : 'mr-3 border border-line bg-surface text-ink-soft',
                  )}
                >
                  <div className="mb-1 text-[9px] uppercase tracking-[0.12em] text-muted">
                    {message.role === 'user' ? '你' : index === 0 ? '译文' : 'AI'}
                  </div>
                  <div className="whitespace-pre-wrap">{message.content}</div>
                </div>
              ))}
              {sending && (
                <div className="mr-3 flex items-center gap-2 rounded-2xl border border-line bg-surface px-3 py-2.5 text-[11px] text-muted">
                  <Loader2 size={13} className="animate-spin" />
                  正在回答…
                </div>
              )}
              {panelError && (
                <div className="rounded-xl bg-danger-soft px-3 py-2 text-[10px] leading-relaxed text-danger">
                  {panelError}
                </div>
              )}
            </div>

            <form
              className="shrink-0 border-t border-line p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))]"
              onSubmit={(event) => {
                event.preventDefault()
                void sendMessage()
              }}
            >
              <textarea
                value={input}
                onChange={(event) => setInput(event.target.value)}
                onKeyDown={(event) => {
                  if (
                    event.key === 'Enter' &&
                    !event.shiftKey &&
                    !event.nativeEvent.isComposing
                  ) {
                    event.preventDefault()
                    void sendMessage()
                  }
                }}
                maxLength={1000}
                rows={2}
                placeholder="继续问：语法、搭配、为什么这样翻译…"
                className="field min-h-[66px] resize-none !text-xs"
              />
              <div className="mt-2 flex items-center justify-between gap-2">
                <span className="text-[9px] text-muted">Enter 发送 · Shift+Enter 换行</span>
                <button
                  type="submit"
                  className="btn btn-primary !px-3 !py-1.5 !text-xs"
                  disabled={sending || !input.trim()}
                >
                  {sending ? <Loader2 size={13} className="animate-spin" /> : <Send size={13} />}
                  发送
                </button>
              </div>
            </form>
          </aside>
        </>
      )}
    </>
  )
}
