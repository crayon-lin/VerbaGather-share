import { CheckCircle2, AlertCircle, Info, X } from 'lucide-react'
import { useUIStore } from '@/store/ui'
import { cn } from '@/lib/utils'

export function ToastHost() {
  const toasts = useUIStore((s) => s.toasts)
  const remove = useUIStore((s) => s.removeToast)
  if (!toasts.length) return null
  return (
    <div className="fixed bottom-24 right-4 z-[90] flex w-[calc(100%-2rem)] max-w-sm flex-col gap-2 sm:bottom-6">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={cn(
            'flex items-start gap-2.5 rounded-xl border bg-surface px-3.5 py-3 text-sm shadow-[var(--shadow-float)] animate-fade-up',
            t.type === 'error' ? 'border-danger/40' : 'border-line',
          )}
        >
          {t.type === 'error' ? (
            <AlertCircle size={18} className="mt-0.5 shrink-0 text-danger" />
          ) : t.type === 'info' ? (
            <Info size={18} className="mt-0.5 shrink-0 text-forest" />
          ) : (
            <CheckCircle2 size={18} className="mt-0.5 shrink-0 text-forest" />
          )}
          <span className="flex-1 leading-relaxed text-ink-soft">{t.message}</span>
          <button
            type="button"
            onClick={() => remove(t.id)}
            className="text-muted hover:text-ink"
            aria-label="关闭提示"
          >
            <X size={14} />
          </button>
        </div>
      ))}
    </div>
  )
}
