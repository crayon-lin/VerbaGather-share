import type { ReactNode } from 'react'
import { cn } from '@/lib/utils'

const styles: Record<string, string> = {
  neutral: 'border-line bg-surface-2 text-muted',
  forest: 'border-transparent bg-forest-soft text-forest',
  amber: 'border-transparent bg-amber-soft text-amber',
  danger: 'border-transparent bg-danger-soft text-danger',
  outline: 'border-line bg-transparent text-muted',
}

export function Badge({
  children,
  variant = 'neutral',
  className,
}: {
  children: ReactNode
  variant?: keyof typeof styles
  className?: string
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center gap-1 rounded-full border px-2 py-0.5 text-[11px] leading-5',
        styles[variant],
        className,
      )}
    >
      {children}
    </span>
  )
}

export function StateBadge({ state }: { state: string }) {
  if (state === 'mastered') return <Badge variant="forest">已掌握</Badge>
  if (state === 'review') return <Badge variant="amber">待复习</Badge>
  if (state === 'learning') return <Badge variant="danger">学习中</Badge>
  return <Badge variant="outline">新词</Badge>
}
