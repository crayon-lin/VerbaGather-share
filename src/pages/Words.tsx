import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, BookOpen, BookPlus, Plus, Star, Upload } from 'lucide-react'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { Modal } from '@/components/Modal'
import { toast } from '@/store/ui'
import { useSettings, useUpdateSettings } from '@/lib/hooks'
import { BOOK_COLORS, cn, levelLabel, pct } from '@/lib/utils'
import type { Book } from '@shared/types'

const KIND_LABEL: Record<string, string> = {
  system: '系统词书',
  custom: '自定义',
  newwords: '自动收集',
  mistakes: '自动收集',
}

const COLORS = ['forest', 'amber', 'ink', 'danger', 'plum', 'sky']

export default function Words() {
  const queryClient = useQueryClient()
  const { settings } = useSettings()
  const update = useUpdateSettings()
  const books = useQuery({ queryKey: ['books'], queryFn: api.books })
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ name: '', description: '', level: 'all', color: 'forest' })
  const create = useMutation({
    mutationFn: api.createBook,
    onSuccess: () => {
      toast('词书已创建')
      setCreating(false)
      setForm({ name: '', description: '', level: 'all', color: 'forest' })
      queryClient.invalidateQueries({ queryKey: ['books'] })
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  const items = books.data?.items ?? []
  const system = items.filter((b) => b.kind === 'system')
  const custom = items.filter((b) => b.kind !== 'system')
  const defaultBook = items.find((b) => b.id === settings.defaultBookId)
  const canBeDefault = (b: Book) => b.kind === 'custom' || b.kind === 'newwords'

  return (
    <div>
      <PageHeader
        eyebrow="Vocabulary"
        title="单词本"
        description="四六级核心词按词频排列，也可以把任意文章、截图里的生词收进来，按遗忘曲线复习。"
        actions={
          <>
            <button type="button" className="btn btn-ghost" onClick={() => setCreating(true)}>
              <Plus size={15} />
              新建词书
            </button>
            <Link to="/words/import" className="btn btn-primary">
              <Upload size={15} />
              导入单词
            </Link>
          </>
        }
      />

      <div className="mb-5 flex flex-wrap items-center gap-2 rounded-xl border border-line bg-surface px-3.5 py-2.5 text-[11px] text-muted">
        <Star size={13} className="text-amber" fill="currentColor" />
        默认生词本：
        <span className="font-medium text-ink">{defaultBook?.name || '我的生词本'}</span>
        <span className="text-muted/70">· 学习中标记「不认识 / 模糊」或点词收词时进入</span>
        <Link to="/settings" className="ml-auto whitespace-nowrap text-forest hover:underline">
          修改
        </Link>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
        {system.map((book) => (
          <BookCard
            key={book.id}
            book={book}
            isDefault={book.id === settings.defaultBookId}
            canDefault={canBeDefault(book)}
            onDefault={() => update.mutate({ defaultBookId: book.id })}
          />
        ))}
      </div>

      <div className="mb-4 mt-10 flex items-end justify-between">
        <div className="w-fit rounded-2xl bg-paper/85 px-3 py-2 backdrop-blur-sm">
          <p className="eyebrow">自定义</p>
          <h2 className="mt-1.5 serif text-2xl">我的词书</h2>
        </div>
        <Link to="/words/import" className="text-[11px] text-muted hover:text-ink">
          从文件或图片导入 →
        </Link>
      </div>

      {custom.length ? (
        <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {custom.map((book) => (
            <BookCard
              key={book.id}
              book={book}
              isDefault={book.id === settings.defaultBookId}
              canDefault={canBeDefault(book)}
              onDefault={() => update.mutate({ defaultBookId: book.id })}
            />
          ))}
        </div>
      ) : (
        <div className="card flex flex-col items-start gap-4 p-6 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-3">
            <span className="grid h-10 w-10 place-items-center rounded-xl bg-surface-2 text-muted">
              <BookPlus size={18} />
            </span>
            <div>
              <div className="text-sm font-medium">还没有自定义词书</div>
              <p className="mt-1 max-w-md text-[11px] leading-relaxed text-muted">
                按考试、专业课或某本书建一本自己的词书；导入 PDF / Word / 截图时直接选它。
              </p>
            </div>
          </div>
          <button type="button" className="btn btn-soft" onClick={() => setCreating(true)}>
            建一本
          </button>
        </div>
      )}

      <div className="mt-8 grid gap-3 sm:grid-cols-3">
        {[
          { icon: BookOpen, title: '5,700+ 个四六级词', desc: '含音标、释义、词形与词频' },
          { icon: Upload, title: '文件与截图导入', desc: 'PDF / Word / CSV / 图片 OCR' },
          { icon: BookPlus, title: '生词自动收集', desc: '不认识、做错的词自动归档' },
        ].map((f) => {
          const Icon = f.icon
          return (
            <div key={f.title} className="flex items-start gap-3 rounded-xl border border-line/70 bg-paper/85 p-4 backdrop-blur-sm">
              <Icon size={16} className="mt-0.5 text-forest" />
              <div>
                <div className="text-[13px] font-medium">{f.title}</div>
                <div className="mt-0.5 text-[11px] text-muted">{f.desc}</div>
              </div>
            </div>
          )
        })}
      </div>

      <Modal
        open={creating}
        onClose={() => setCreating(false)}
        title="新建词书"
        size="sm"
        footer={
          <div className="flex justify-end gap-2">
            <button type="button" className="btn btn-ghost" onClick={() => setCreating(false)}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!form.name.trim() || create.isPending}
              onClick={() => create.mutate(form)}
            >
              创建
            </button>
          </div>
        }
      >
        <div className="space-y-4 p-5">
          <div>
            <label className="label" htmlFor="book-name">
              名称
            </label>
            <input
              id="book-name"
              className="field"
              maxLength={30}
              placeholder="例如：考研核心词、专业八级"
              value={form.name}
              onChange={(e) => setForm({ ...form, name: e.target.value })}
            />
          </div>
          <div>
            <label className="label" htmlFor="book-desc">
              简介（可选）
            </label>
            <input
              id="book-desc"
              className="field"
              maxLength={160}
              placeholder="这本书用来做什么"
              value={form.description}
              onChange={(e) => setForm({ ...form, description: e.target.value })}
            />
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="label" htmlFor="book-level">
                适用级别
              </label>
              <select
                id="book-level"
                className="field"
                value={form.level}
                onChange={(e) => setForm({ ...form, level: e.target.value })}
              >
                <option value="all">不限</option>
                <option value="cet4">四级</option>
                <option value="cet6">六级</option>
              </select>
            </div>
            <div>
              <span className="label">标记色</span>
              <div className="flex flex-wrap gap-2 pt-1.5">
                {COLORS.map((c) => (
                  <button
                    key={c}
                    type="button"
                    aria-label={c}
                    onClick={() => setForm({ ...form, color: c })}
                    className={cn(
                      'h-6 w-6 rounded-full border-2 transition-transform',
                      form.color === c ? 'scale-110 border-ink' : 'border-transparent',
                    )}
                    style={{ background: BOOK_COLORS[c] }}
                  />
                ))}
              </div>
            </div>
          </div>
        </div>
      </Modal>
    </div>
  )
}

function BookCard({
  book,
  isDefault,
  canDefault,
  onDefault,
}: {
  book: Book
  isDefault: boolean
  canDefault: boolean
  onDefault: () => void
}) {
  const done = Math.max(0, book.total - book.new_count)
  const ratio = book.total ? pct(done, book.total) : 0
  return (
    <div className="card group relative overflow-hidden p-5">
      <div
        className="absolute inset-x-0 top-0 h-1"
        style={{ background: BOOK_COLORS[book.color] || 'var(--c-forest)' }}
      />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <Link to={`/words/books/${book.id}`} className="serif text-[22px] leading-tight hover:underline">
            {book.name}
          </Link>
          <p className="mt-1.5 line-clamp-2 text-[11px] leading-relaxed text-muted">
            {book.description || '自定义词书'}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1">
          <span className="rounded-full border border-line px-2 py-0.5 text-[10px] text-muted">
            {book.kind === 'system' ? levelLabel(book.level) : KIND_LABEL[book.kind]}
          </span>
          {isDefault ? (
            <span className="text-[9px] text-forest">默认收集本</span>
          ) : canDefault ? (
            <button
              type="button"
              onClick={onDefault}
              className="text-[9px] text-muted hover:text-forest hover:underline"
            >
              设为默认
            </button>
          ) : null}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2 text-center">
        <div>
          <div className="serif text-lg leading-none">{book.total}</div>
          <div className="mt-1 text-[9px] text-muted">词条</div>
        </div>
        <div>
          <div className="serif text-lg leading-none">{book.mastered_count}</div>
          <div className="mt-1 text-[9px] text-muted">已掌握</div>
        </div>
        <div>
          <div className={cn('serif text-lg leading-none', book.due_count > 0 && 'text-amber')}>
            {book.due_count}
          </div>
          <div className="mt-1 text-[9px] text-muted">待复习</div>
        </div>
      </div>

      <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-surface-2">
        <div
          className="h-full rounded-full bg-forest/70 transition-all"
          style={{ width: `${ratio}%` }}
        />
      </div>
      <div className="mt-1.5 flex justify-between text-[10px] text-muted">
        <span>已学 {ratio}%</span>
        <span>{book.new_count} 个新词</span>
      </div>

      <div className="mt-4 flex items-center gap-2">
        {book.total > 0 && (
          <>
            <Link to={`/words/learn?book=${book.id}`} className="btn btn-soft !py-1.5 !text-xs">
              学新词
            </Link>
            <Link to={`/words/review?book=${book.id}`} className="btn btn-ghost !py-1.5 !text-xs">
              复习
            </Link>
          </>
        )}
        <Link
          to={`/words/books/${book.id}`}
          className="ml-auto inline-flex items-center gap-1 text-[11px] text-muted hover:text-ink"
        >
          详情
          <ArrowRight size={12} />
        </Link>
      </div>
    </div>
  )
}
