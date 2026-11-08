import { useState } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  ArrowRight,
  BookOpen,
  Flame,
  PenLine,
  Quote,
  Sparkles,
  Upload,
  Volume2,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useSettings } from '@/lib/hooks'
import { Heatmap } from '@/components/Heatmap'
import { ProgressRing } from '@/components/ProgressRing'
import { SpeakButton } from '@/components/SpeakButton'
import { Badge } from '@/components/Badge'
import { ClickableText } from '@/components/ClickableText'
import { toast } from '@/store/ui'
import {
  cn,
  formatMinutes,
  greeting,
  levelLabel,
  pct,
  todayLabel,
  BOOK_COLORS,
  sentenceByline,
} from '@/lib/utils'
import { useUpdateSettings } from '@/lib/hooks'

export default function Home() {
  const { settings } = useSettings()
  const update = useUpdateSettings()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [showCn, setShowCn] = useState(false)
  const stats = useQuery({ queryKey: ['stats', 'overview'], queryFn: api.stats })
  const daily = useQuery({
    queryKey: ['daily-sentence', settings.level],
    queryFn: () => api.dailySentence(settings.level),
  })
  const heatmap = useQuery({ queryKey: ['stats', 'heatmap'], queryFn: () => api.heatmap(140) })
  const books = useQuery({ queryKey: ['books'], queryFn: api.books })
  const favorite = useMutation({
    mutationFn: () => api.toggleFavorite('sentence', daily.data!.sentence!.id),
    onSuccess: (res) => {
      toast(res.favorited ? '已收藏这句' : '已取消收藏')
      queryClient.invalidateQueries({ queryKey: ['daily-sentence'] })
      queryClient.invalidateQueries({ queryKey: ['favorites'] })
    },
  })

  const s = stats.data
  const newGoal = s?.goals.dailyNew ?? settings.dailyNew
  const reviewGoal = s?.goals.dailyReview ?? settings.dailyReview
  const newToday = s?.today.newWords ?? 0
  const reviewsToday = s?.today.reviews ?? 0
  const due = s?.due ?? 0
  const totalLearned = s?.learned ?? 0
  const totalWords = s?.totalWords ?? 0
  const sentence = daily.data?.sentence
  const relevantBooks = (books.data?.items ?? []).filter(
    (b) => b.kind === 'system' && (settings.level === 'all' || b.level === settings.level),
  )

  return (
    <div className="space-y-5 sm:space-y-6">
      <section className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <p className="eyebrow mb-2">{todayLabel()}</p>
          <h1 className="serif text-balance text-[32px] leading-tight sm:text-[42px]">
            {greeting()}，今天也读一点。
          </h1>
          <p className="mt-2 text-sm text-muted">
            今天已经复习 {reviewsToday} 张卡片
            {s?.streak ? `，连续学习第 ${s.streak} 天。` : '，从一张卡片开始就好。'}
          </p>
        </div>
        <div className="flex items-center gap-2 self-start rounded-2xl border border-line bg-surface px-4 py-3 sm:self-auto">
          <Flame size={20} className={s?.streak ? 'text-amber' : 'text-muted/40'} />
          <div>
            <div className="serif text-xl leading-none">{s?.streak ?? 0} 天</div>
            <div className="mt-1 text-[10px] text-muted">连续打卡</div>
          </div>
          <div className="ml-3 h-8 w-px bg-line" />
          <div>
            <div className="serif text-xl leading-none">{s?.mastered ?? 0}</div>
            <div className="mt-1 text-[10px] text-muted">已掌握</div>
          </div>
        </div>
      </section>

      <div className="grid gap-4 lg:grid-cols-3">
        <section className="card relative overflow-hidden p-5 sm:p-6 lg:col-span-2">
          <div className="paper-grain pointer-events-none absolute inset-0 opacity-50" />
          <div className="relative">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="eyebrow">今日任务</p>
                <h2 className="mt-1.5 serif text-2xl">按自己的节奏来</h2>
              </div>
              <Badge variant="forest">{levelLabel(settings.level)}</Badge>
            </div>

            <div className="mt-6 flex flex-wrap items-center gap-6 sm:gap-10">
              <div className="flex items-center gap-3">
                <ProgressRing value={newToday} max={newGoal} size={78} stroke={6}>
                  <div className="text-center">
                    <div className="serif text-xl leading-none">{newToday}</div>
                    <div className="mt-1 text-[9px] text-muted">/ {newGoal}</div>
                  </div>
                </ProgressRing>
                <div>
                  <div className="text-sm font-medium">新学</div>
                  <div className="mt-1 text-[11px] text-muted">第一次见面的词</div>
                </div>
              </div>
              <div className="flex items-center gap-3">
                <ProgressRing
                  value={Math.min(due, reviewGoal)}
                  max={reviewGoal}
                  size={78}
                  stroke={6}
                  color="var(--c-amber)"
                >
                  <div className="text-center">
                    <div className="serif text-xl leading-none">{due}</div>
                    <div className="mt-1 text-[9px] text-muted">到期</div>
                  </div>
                </ProgressRing>
                <div>
                  <div className="text-sm font-medium">复习</div>
                  <div className="mt-1 text-[11px] text-muted">等待回访的卡片</div>
                </div>
              </div>
            </div>

            <div className="mt-6 flex flex-wrap gap-2">
              {due > 0 ? (
                <Link to="/words/review" className="btn btn-primary">
                  开始复习 · {due} 个到期
                  <ArrowRight size={15} />
                </Link>
              ) : (
                <Link to="/words/learn" className="btn btn-primary">
                  开始学新词
                  <ArrowRight size={15} />
                </Link>
              )}
              {due > 0 && (
                <Link to="/words/learn" className="btn btn-ghost">
                  学新词
                </Link>
              )}
              <Link to="/words/quiz" className="btn btn-ghost">
                小测验
              </Link>
            </div>

            <div className="mt-5 flex items-center gap-3 text-[11px] text-muted">
              <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-surface-2">
                <div
                  className="h-full rounded-full bg-forest/70 transition-all"
                  style={{ width: `${totalWords ? pct(totalLearned, totalWords) : 0}%` }}
                />
              </div>
              <span className="tabular-nums">
                {totalLearned} / {totalWords} 词
              </span>
            </div>
          </div>
        </section>

        <section className="card flex flex-col p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <p className="eyebrow">每日一句</p>
            <div className="flex items-center gap-0.5">
              {sentence && <SpeakButton text={sentence.text_en} size={16} />}
              <button
                type="button"
                onClick={() => favorite.mutate()}
                className={cn(
                  'grid h-8 w-8 place-items-center rounded-full transition-colors',
                  sentence?.favorite ? 'text-amber' : 'text-muted hover:bg-surface-2',
                )}
                aria-label="收藏"
              >
                <Sparkles size={16} />
              </button>
            </div>
          </div>
          {sentence ? (
            <>
              <blockquote className="mt-4 flex-1">
                <p className="serif text-[19px] leading-relaxed text-ink">
                  “<ClickableText text={sentence.text_en} hint={false} />”
                </p>
                {showCn && <p className="mt-3 text-sm leading-relaxed text-muted">{sentence.text_cn}</p>}
                {sentence.note && (
                  <p className="mt-3 line-clamp-2 border-l-2 border-line/80 pl-3 text-[11px] leading-relaxed text-muted/90">
                    {sentence.note}
                  </p>
                )}
              </blockquote>
              <div className="mt-4 flex items-center justify-between border-t border-line pt-3">
                <div className="min-w-0 text-[11px] text-muted">
                  <span className="block truncate">{sentenceByline(sentence)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setShowCn((v) => !v)}
                  className="shrink-0 text-[11px] font-medium text-forest hover:underline"
                >
                  {showCn ? '收起译文' : '查看译文'}
                </button>
              </div>
            </>
          ) : (
            <div className="flex flex-1 items-center justify-center py-8 text-sm text-muted">
              正在挑选今天的句子…
            </div>
          )}
        </section>
      </div>

      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {[
          {
            to: '/words/import',
            icon: Upload,
            title: '导入单词',
            desc: '文件、截图 OCR 都能收',
          },
          {
            to: '/sentences',
            icon: Quote,
            title: '句子库',
            desc: '写作句型、名著与名言',
          },
          {
            to: '/essays/practice',
            icon: PenLine,
            title: '写作训练',
            desc: '计时、字数、草稿自动保存',
          },
          {
            to: '/stats',
            icon: BookOpen,
            title: '学习统计',
            desc: '热力图与复习预测',
          },
        ].map((item) => {
          const Icon = item.icon
          return (
            <Link
              key={item.to}
              to={item.to}
              className="group card flex items-center gap-3 p-4 transition-colors hover:border-line-strong"
            >
              <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-forest-soft text-forest">
                <Icon size={17} />
              </span>
              <span className="min-w-0">
                <span className="block text-sm font-medium">{item.title}</span>
                <span className="mt-0.5 block truncate text-[11px] text-muted">{item.desc}</span>
              </span>
              <ArrowRight
                size={14}
                className="ml-auto text-muted/50 transition-transform group-hover:translate-x-0.5"
              />
            </Link>
          )
        })}
      </section>

      <div className="grid gap-4 lg:grid-cols-[1.55fr_1fr]">
        <section className="card p-5 sm:p-6">
          <div className="mb-5 flex items-end justify-between">
            <div>
              <p className="eyebrow">坚持</p>
              <h2 className="mt-1 serif text-xl">学习热力图</h2>
            </div>
            <Link to="/stats" className="text-[11px] text-muted hover:text-ink">
              查看统计 →
            </Link>
          </div>
          {heatmap.data ? (
            <Heatmap items={heatmap.data.items} />
          ) : (
            <div className="h-28 skeleton rounded-xl" />
          )}
          <div className="mt-5 grid grid-cols-3 divide-x divide-line border-t border-line pt-4 text-center">
            <div>
              <div className="serif text-lg">{formatMinutes(s?.durationMs ?? 0)}</div>
              <div className="mt-1 text-[10px] text-muted">累计学习</div>
            </div>
            <div>
              <div className="serif text-lg">{s?.accuracy ?? 0}%</div>
              <div className="mt-1 text-[10px] text-muted">平均正确率</div>
            </div>
            <div>
              <div className="serif text-lg">{s?.learned ?? 0}</div>
              <div className="mt-1 text-[10px] text-muted">已学单词</div>
            </div>
          </div>
        </section>

        <section className="card p-5 sm:p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="eyebrow">词书</p>
              <h2 className="mt-1 serif text-xl">进行中的进度</h2>
            </div>
            <Link to="/words" className="text-[11px] text-muted hover:text-ink">
              全部 →
            </Link>
          </div>
          <div className="mt-4 space-y-4">
            {relevantBooks.map((book) => {
              const done = Math.max(0, book.total - book.new_count)
              const ratio = book.total ? pct(done, book.total) : 0
              return (
                <Link key={book.id} to={`/words/books/${book.id}`} className="block group">
                  <div className="flex items-center justify-between text-[13px]">
                    <span className="flex items-center gap-2">
                      <span
                        className="h-2 w-2 rounded-full"
                        style={{ background: BOOK_COLORS[book.color] || 'var(--c-forest)' }}
                      />
                      {book.name}
                    </span>
                    <span className="text-[11px] tabular-nums text-muted">
                      {done}/{book.total}
                    </span>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface-2">
                    <div
                      className="h-full rounded-full bg-forest/70 transition-all group-hover:bg-forest"
                      style={{ width: `${ratio}%` }}
                    />
                  </div>
                  <div className="mt-1.5 flex justify-between text-[10px] text-muted">
                    <span>{book.mastered_count} 已掌握</span>
                    <span>{book.due_count} 待复习</span>
                  </div>
                </Link>
              )
            })}
            {!relevantBooks.length && <p className="py-6 text-center text-sm text-muted">暂无词书</p>}
          </div>
          <Link
            to="/words"
            className="mt-5 flex items-center justify-center gap-1 rounded-xl border border-dashed border-line py-2.5 text-[11px] text-muted hover:border-line-strong hover:text-ink"
          >
            管理我的词书
            <ArrowRight size={12} />
          </Link>
        </section>
      </div>

      {!totalLearned && (
        <section className="card flex flex-col items-start gap-3 border-forest/20 bg-forest-soft/40 p-5 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-9 w-9 place-items-center rounded-full bg-forest text-paper">
              <Volume2 size={16} />
            </span>
            <div>
              <div className="text-sm font-medium">第一次来？先认识 10 个词</div>
              <div className="mt-1 text-[11px] text-muted">
                每个词都能听发音、看例句，答完会按遗忘曲线安排复习。
              </div>
            </div>
          </div>
          <button
            type="button"
            onClick={() => {
              update.mutate({ dailyNew: 10 })
              navigate('/words/learn')
            }}
            className="btn btn-primary"
          >
            从 10 个开始
          </button>
        </section>
      )}
    </div>
  )
}
