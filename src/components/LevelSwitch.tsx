import { useSettings, useUpdateSettings } from '@/lib/hooks'
import { cn } from '@/lib/utils'
import type { Level } from '@shared/types'

const OPTIONS: Array<{ value: Level; label: string }> = [
  { value: 'cet4', label: 'CET-4' },
  { value: 'cet6', label: 'CET-6' },
  { value: 'all', label: '全部' },
]

export function LevelSwitch({ className }: { className?: string }) {
  const { settings } = useSettings()
  const update = useUpdateSettings()
  return (
    <div
      className={cn(
        'inline-flex items-center rounded-full border border-line bg-surface/80 p-0.5 text-[11px]',
        className,
      )}
      role="group"
      aria-label="切换四六级"
    >
      {OPTIONS.map((opt) => {
        const active = settings.level === opt.value
        return (
          <button
            key={opt.value}
            type="button"
            onClick={() => {
              if (!active) update.mutate({ level: opt.value })
            }}
            className={cn(
              'rounded-full px-2.5 py-1 font-medium tracking-wide transition-colors sm:px-3',
              active ? 'bg-ink text-paper shadow-sm' : 'text-muted hover:text-ink',
            )}
            aria-pressed={active}
          >
            {opt.label}
          </button>
        )
      })}
    </div>
  )
}
