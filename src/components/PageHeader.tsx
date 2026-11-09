import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ArrowLeft } from 'lucide-react'
import { cn } from '@/lib/utils'

export function PageHeader({
  eyebrow,
  title,
  description,
  actions,
  back,
  className,
}: {
  eyebrow?: string
  title: ReactNode
  description?: ReactNode
  actions?: ReactNode
  back?: { to: string; label: string }
  className?: string
}) {
  return (
    <div className={cn('mb-6 flex flex-col gap-4 sm:mb-8 sm:flex-row sm:items-end sm:justify-between', className)}>
      <div className="min-w-0 max-w-full self-start">
        {back && (
          <Link
            to={back.to}
            className="mb-3 inline-flex items-center gap-1 text-xs text-ink-soft transition-colors hover:text-ink"
          >
            <ArrowLeft size={13} />
            {back.label}
          </Link>
        )}
        {eyebrow && <p className="eyebrow mb-2 text-ink-soft">{eyebrow}</p>}
        <h1 className="serif text-balance text-3xl leading-tight sm:text-[38px]">{title}</h1>
        {description && (
          <p className="mt-2 max-w-2xl text-sm leading-relaxed text-ink-soft">{description}</p>
        )}
      </div>
      {actions && <div className="page-actions flex flex-wrap items-center gap-2 self-start sm:self-end">{actions}</div>}
    </div>
  )
}
