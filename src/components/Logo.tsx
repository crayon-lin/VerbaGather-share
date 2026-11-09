import { Link } from 'react-router-dom'
import { cn } from '@/lib/utils'

export function Logo({ compact = false, className }: { compact?: boolean; className?: string }) {
  return (
    <Link to="/" className={cn('group flex items-center gap-2.5', className)} aria-label="拾词首页">
      <span className="relative grid h-9 w-9 place-items-center rounded-[12px] border border-line bg-surface shadow-[var(--shadow-card)]">
        <svg viewBox="0 0 24 24" className="h-5 w-5" aria-hidden>
          <path
            d="M12 3.5c2.6 3.2 6.2 6.3 6.2 10.1A6.2 6.2 0 0 1 12 19.8a6.2 6.2 0 0 1-6.2-6.2C5.8 9.8 9.4 6.7 12 3.5Z"
            fill="var(--c-forest)"
            opacity="0.9"
          />
          <path
            d="M12 8.2c1.4 1.8 3.3 3.5 3.3 5.5a3.3 3.3 0 1 1-6.6 0c0-2 1.9-3.7 3.3-5.5Z"
            fill="var(--c-paper)"
            opacity="0.55"
          />
        </svg>
      </span>
      {!compact && (
        <span className="flex flex-col leading-none">
          <span className="serif text-[19px] tracking-wide">拾词</span>
          <span className="mt-1 text-[9px] tracking-[0.24em] text-muted">INKLING</span>
        </span>
      )}
    </Link>
  )
}
