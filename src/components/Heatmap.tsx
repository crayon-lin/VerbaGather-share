import { useMemo } from 'react'
import type { HeatCell } from '@shared/types'
import { cn } from '@/lib/utils'

const WEEKDAYS = ['日', '一', '二', '三', '四', '五', '六']
const CELL = 14
const GAP = 4

function level(count: number) {
  if (count <= 0) return 0
  if (count < 5) return 1
  if (count < 10) return 2
  if (count < 20) return 3
  return 4
}

const COLORS = [
  'color-mix(in srgb, var(--c-line) 45%, var(--c-surface))',
  'color-mix(in srgb, var(--c-forest) 24%, var(--c-surface-2))',
  'color-mix(in srgb, var(--c-forest) 45%, var(--c-surface-2))',
  'color-mix(in srgb, var(--c-forest) 68%, var(--c-surface-2))',
  'var(--c-forest)',
]

function longestStreak(items: HeatCell[]) {
  let best = 0
  let current = 0
  for (const item of items) {
    if (item.count > 0) {
      current += 1
      best = Math.max(best, current)
    } else {
      current = 0
    }
  }
  return best
}

export function Heatmap({ items, className }: { items: HeatCell[]; className?: string }) {
  const weeks = useMemo(() => {
    if (!items.length) return [] as Array<Array<HeatCell | null>>
    const start = new Date(`${items[0].day}T00:00:00`)
    const pad = start.getDay()
    const padded: Array<HeatCell | null> = [...Array(pad).fill(null), ...items]
    const out: Array<Array<HeatCell | null>> = []
    for (let i = 0; i < padded.length; i += 7) out.push(padded.slice(i, i + 7))
    return out
  }, [items])

  const months = useMemo(() => {
    const labels: Array<{ index: number; label: string }> = []
    let last = ''
    weeks.forEach((week, i) => {
      const first = week.find(Boolean)
      if (!first) return
      const label = `${new Date(`${first.day}T00:00:00`).getMonth() + 1}月`
      if (label !== last) {
        labels.push({ index: i, label })
        last = label
      }
    })
    return labels
  }, [weeks])

  const summary = useMemo(() => {
    const active = items.filter((item) => item.count > 0)
    const total = items.reduce((sum, item) => sum + item.count, 0)
    const best = items.reduce((max, item) => Math.max(max, item.count), 0)
    return {
      activeDays: active.length,
      total,
      best,
      streak: longestStreak(items),
    }
  }, [items])

  if (!items.length) return null

  return (
    <div className={cn('flex flex-col gap-6 lg:flex-row lg:items-end', className)}>
      <div className="min-w-0 flex-1 overflow-x-auto pb-1">
        <div className="inline-flex gap-2">
          <div
            className="grid shrink-0 text-[9px] text-muted"
            style={{ gridTemplateRows: `repeat(7, ${CELL}px)`, rowGap: GAP, paddingTop: 22 }}
          >
            {WEEKDAYS.map((day, index) => (
              <span key={day} className="flex items-center" style={{ height: CELL }}>
                {index % 2 === 1 ? day : ''}
              </span>
            ))}
          </div>
          <div>
            <div className="relative mb-1.5 h-4">
              {months.map((month) => (
                <span
                  key={`${month.index}-${month.label}`}
                  className="absolute text-[9px] text-muted"
                  style={{ left: month.index * (CELL + GAP) }}
                >
                  {month.label}
                </span>
              ))}
            </div>
            <div
              className="grid grid-flow-col"
              style={{
                gridTemplateRows: `repeat(7, ${CELL}px)`,
                gridAutoColumns: `${CELL}px`,
                gap: GAP,
              }}
            >
              {weeks.map((week, weekIndex) =>
                week.map((cell, dayIndex) => {
                  if (!cell) {
                    return (
                      <span
                        key={`${weekIndex}-${dayIndex}`}
                        style={{ width: CELL, height: CELL }}
                      />
                    )
                  }
                  const cellLevel = level(cell.count)
                  return (
                    <span
                      key={cell.day}
                      title={`${cell.day} · ${cell.count} 次学习`}
                      className="rounded-[3px] border border-line/60 transition-transform duration-150 hover:scale-125 hover:border-forest/50"
                      style={{
                        width: CELL,
                        height: CELL,
                        background: COLORS[cellLevel],
                      }}
                    />
                  )
                }),
              )}
            </div>
          </div>
        </div>
        <div className="mt-3 flex items-center gap-1.5 pl-[26px] text-[9px] text-muted">
          <span>少</span>
          {COLORS.map((color, index) => (
            <span
              key={index}
              className="rounded-[3px] border border-line/60"
              style={{ width: 12, height: 12, background: color }}
            />
          ))}
          <span>多</span>
        </div>
      </div>

      <div className="grid shrink-0 grid-cols-2 gap-2 sm:grid-cols-4 lg:w-[300px] lg:grid-cols-2">
        {[
          { label: '有学习的天数', value: summary.activeDays, suffix: '天' },
          { label: '累计学习次数', value: summary.total, suffix: '次' },
          { label: '最长连续学习', value: summary.streak, suffix: '天' },
          { label: '单日最高', value: summary.best, suffix: '次' },
        ].map((stat) => (
          <div key={stat.label} className="rounded-xl bg-surface-2/45 px-3 py-2.5">
            <div className="serif text-lg leading-none">
              {stat.value}
              <span className="ml-1 font-sans text-[9px] text-muted">{stat.suffix}</span>
            </div>
            <div className="mt-1 text-[9px] text-muted">{stat.label}</div>
          </div>
        ))}
      </div>
    </div>
  )
}
