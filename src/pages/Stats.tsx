import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts'
import { BookOpen, Clock, Flame, Target, TrendingUp } from 'lucide-react'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { Heatmap } from '@/components/Heatmap'
import { formatMinutes, levelLabel, pct } from '@/lib/utils'

const TOOLTIP_STYLE = {
  background: 'var(--c-surface)',
  border: '1px solid var(--c-line)',
  borderRadius: 10,
  fontSize: 11,
  color: 'var(--c-ink)',
  boxShadow: 'var(--shadow-card)',
}

export default function Stats() {
  const overview = useQuery({ queryKey: ['stats', 'overview'], queryFn: api.stats })
  const heatmap = useQuery({ queryKey: ['stats', 'heatmap'], queryFn: () => api.heatmap(140) })
  const forecast = useQuery({ queryKey: ['stats', 'forecast'], queryFn: () => api.forecast(7) })
  const trend = useQuery({ queryKey: ['stats', 'trend'], queryFn: () => api.trend(30) })
  const books = useQuery({ queryKey: ['stats', 'books'], queryFn: api.bookStats })
  const s = overview.data

  return (
    <div>
      <PageHeader
        eyebrow="Progress"
        title="学习统计"
        description="所有数据都来自本机记录。看的不是“学了多少”，而是记住了多少、什么时候该回来。"
      />

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        {[
          { icon: Flame, label: '连续打卡', value: `${s?.streak ?? 0} 天`, hint: '今天也算' },
          { icon: BookOpen, label: '已学单词', value: s?.learned ?? 0, hint: `共 ${s?.totalWords ?? 0} 词` },
          { icon: Target, label: '已掌握', value: s?.mastered ?? 0, hint: '间隔 ≥ 60 天' },
          { icon: TrendingUp, label: '平均正确率', value: `${s?.accuracy ?? 0}%`, hint: '全部作答' },
          { icon: Clock, label: '累计学习', value: formatMinutes(s?.durationMs ?? 0), hint: '有效作答时长' },
        ].map((item) => {
          const Icon = item.icon
          return (
            <div key={item.label} className="card p-4">
              <div className="flex items-center gap-2 text-muted">
                <Icon size={15} />
                <span className="text-[10px]">{item.label}</span>
              </div>
              <div className="mt-2 serif text-2xl leading-none">{item.value}</div>
              <div className="mt-1.5 text-[9px] text-muted/80">{item.hint}</div>
            </div>
          )
        })}
      </div>

      <div className="mt-5 card p-5 sm:p-6">
        <div className="mb-4 flex flex-wrap items-end justify-between gap-2">
          <div>
            <p className="eyebrow">Consistency</p>
            <h2 className="mt-1 serif text-xl">学习热力图</h2>
          </div>
          <div className="text-[10px] text-muted">近 20 周 · 每格为一天</div>
        </div>
        {heatmap.data ? (
          <Heatmap items={heatmap.data.items} />
        ) : (
          <div className="h-32 skeleton rounded-xl" />
        )}
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <div className="card p-5">
          <div className="mb-1 flex items-end justify-between">
            <div>
              <p className="eyebrow">Forecast</p>
              <h2 className="mt-1 serif text-xl">未来 7 天复习量</h2>
            </div>
            <span className="text-[10px] text-muted">到期词数</span>
          </div>
          <p className="mb-4 text-[11px] text-muted">逾期未复习的卡片会累计到今天。</p>
          <div className="h-[190px]">
            {forecast.data ? (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={forecast.data.items.map((d) => ({ ...d, label: d.day.slice(5) }))}
                  margin={{ top: 8, right: 4, left: -18, bottom: 0 }}
                >
                  <CartesianGrid vertical={false} stroke="var(--c-line)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 10, fill: 'var(--c-muted)' }}
                    axisLine={false}
                    tickLine={false}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: 'var(--c-muted)' }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip contentStyle={TOOLTIP_STYLE} cursor={{ fill: 'var(--c-surface-2)' }} />
                  <Bar dataKey="count" name="到期" fill="var(--c-forest)" radius={[4, 4, 0, 0]} isAnimationActive={false} />
                </BarChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full skeleton rounded-xl" />
            )}
          </div>
        </div>

        <div className="card p-5">
          <div className="mb-1 flex items-end justify-between">
            <div>
              <p className="eyebrow">Activity</p>
              <h2 className="mt-1 serif text-xl">近 30 天节奏</h2>
            </div>
            <span className="text-[10px] text-muted">复习 / 新学</span>
          </div>
          <p className="mb-4 text-[11px] text-muted">两条线交替出现，说明学与复习都在推进。</p>
          <div className="h-[190px]">
            {trend.data ? (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart
                  data={trend.data.items.map((d) => ({ ...d, label: d.day.slice(5) }))}
                  margin={{ top: 8, right: 4, left: -18, bottom: 0 }}
                >
                  <defs>
                    <linearGradient id="reviews" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--c-forest)" stopOpacity={0.3} />
                      <stop offset="100%" stopColor="var(--c-forest)" stopOpacity={0} />
                    </linearGradient>
                    <linearGradient id="newWords" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--c-amber)" stopOpacity={0.25} />
                      <stop offset="100%" stopColor="var(--c-amber)" stopOpacity={0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid vertical={false} stroke="var(--c-line)" strokeDasharray="3 3" />
                  <XAxis
                    dataKey="label"
                    tick={{ fontSize: 9, fill: 'var(--c-muted)' }}
                    axisLine={false}
                    tickLine={false}
                    interval={4}
                  />
                  <YAxis
                    allowDecimals={false}
                    tick={{ fontSize: 10, fill: 'var(--c-muted)' }}
                    axisLine={false}
                    tickLine={false}
                    width={40}
                  />
                  <Tooltip contentStyle={TOOLTIP_STYLE} />
                  <Area
                    type="monotone"
                    dataKey="reviews"
                    name="复习"
                    stroke="var(--c-forest)"
                    strokeWidth={1.5}
                    fill="url(#reviews)"
                    isAnimationActive={false}
                  />
                  <Area
                    type="monotone"
                    dataKey="newWords"
                    name="新学"
                    stroke="var(--c-amber)"
                    strokeWidth={1.5}
                    fill="url(#newWords)"
                    isAnimationActive={false}
                  />
                </AreaChart>
              </ResponsiveContainer>
            ) : (
              <div className="h-full skeleton rounded-xl" />
            )}
          </div>
        </div>
      </div>

      <div className="mt-4 card p-5 sm:p-6">
        <div className="mb-4 flex items-end justify-between">
          <div>
            <p className="eyebrow">Books</p>
            <h2 className="mt-1 serif text-xl">各词书进度</h2>
          </div>
          <Link to="/words" className="text-[11px] text-muted hover:text-ink">
            管理词书 →
          </Link>
        </div>
        <div className="space-y-4">
          {(books.data?.items ?? []).map((book) => {
            const ratio = book.total ? pct(book.learned, book.total) : 0
            return (
              <Link key={book.id} to={`/words/books/${book.id}`} className="block">
                <div className="flex items-center justify-between text-[12.5px]">
                  <span className="flex items-center gap-2">
                    {book.name}
                    <span className="text-[9px] text-muted">
                      {book.kind === 'system' ? levelLabel(book.level) : '自定义'}
                    </span>
                  </span>
                  <span className="text-[10px] tabular-nums text-muted">
                    {book.learned}/{book.total} · {ratio}%
                  </span>
                </div>
                <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-surface-2">
                  <div className="h-full rounded-full bg-forest/70" style={{ width: `${ratio}%` }} />
                </div>
                {book.due > 0 && (
                  <div className="mt-1 text-[10px] text-amber">{book.due} 个待复习</div>
                )}
              </Link>
            )
          })}
          {!books.data?.items.length && <p className="py-6 text-center text-sm text-muted">暂无词书</p>}
        </div>
      </div>
    </div>
  )
}
