import { useEffect, useState } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  BookPlus,
  ChevronLeft,
  ChevronRight,
  Pencil,
  Plus,
  Search,
  Star,
  Trash2,
  Upload,
} from 'lucide-react'
import { api } from '@/lib/api'
import { PageHeader } from '@/components/PageHeader'
import { Modal } from '@/components/Modal'
import { SpeakButton } from '@/components/SpeakButton'
import { StateBadge } from '@/components/Badge'
import { EmptyState } from '@/components/EmptyState'
import { useDebounced } from '@/lib/useDebounced'
import { toast } from '@/store/ui'
import {
  BOOK_COLORS,
  cn,
  essayTypeLabel,
  firstLine,
  levelLabel,
  pct,
  relativeDue,
  wordStateLabel,
} from '@/lib/utils'
import type { Book, Word } from '@shared/types'

const STATES = [
  { value: 'all', label: '全部' },
  { value: 'new', label: '新词' },
  { value: 'learning', label: '学习中' },
  { value: 'review', label: '待复习' },
  { value: 'due', label: '已到期' },
  { value: 'mastered', label: '已掌握' },
]

const SORTS = [
  { value: 'rank', label: '词频优先' },
  { value: 'alpha', label: '字母顺序' },
  { value: 'due', label: '复习时间' },
  { value: 'newest', label: '最近加入' },
]

export default function BookDetail() {
  const { id = '' } = useParams()
  const [searchParams] = useSearchParams()
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [q, setQ] = useState(searchParams.get('q') || '')
  const [state, setState] = useState('all')
  const [sort, setSort] = useState('rank')
  const [page, setPage] = useState(1)
  const debouncedQ = useDebounced(q, 250)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [adding, setAdding] = useState(false)
  const [editingBook, setEditingBook] = useState(false)

  const query = useQuery({
    queryKey: ['book', id, { q: debouncedQ, state, sort, page }],
    queryFn: () => api.bookWords(id, { q: debouncedQ, state, sort, page, pageSize: 50 }),
  })

  useEffect(() => {
    setPage(1)
  }, [debouncedQ, state, sort])

  const book = query.data?.book
  const stats = query.data?.stats
  const items = query.data?.items ?? []
  const totalPages = Math.max(1, Math.ceil((query.data?.total ?? 0) / (query.data?.pageSize ?? 50)))

  const deleteBook = useMutation({
    mutationFn: () => api.deleteBook(id),
    onSuccess: () => {
      toast('词书已删除')
      queryClient.invalidateQueries({ queryKey: ['books'] })
      navigate('/words')
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  const favorite = useMutation({
    mutationFn: (wordId: string) => api.toggleFavorite('word', wordId),
    onSuccess: (res) => {
      toast(res.favorited ? '已收藏单词' : '已取消收藏')
      queryClient.invalidateQueries({ queryKey: ['book', id] })
      queryClient.invalidateQueries({ queryKey: ['favorites'] })
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  if (query.isLoading) {
    return <div className="h-64 skeleton rounded-2xl" />
  }
  if (!book) {
    return (
      <EmptyState
        title="词书不存在"
        description="它可能已经被删除。"
        action={
          <Link to="/words" className="btn btn-primary">
            返回单词本
          </Link>
        }
      />
    )
  }

  return (
    <div>
      <PageHeader
        back={{ to: '/words', label: '单词本' }}
        eyebrow={`${levelLabel(book.level)} · ${stats?.total ?? book.total ?? 0} 词`}
        title={book.name}
        description={book.description}
        actions={
          <>
            <Link to={`/words/learn?book=${book.id}`} className="btn btn-primary">
              学新词
            </Link>
            <Link to={`/words/review?book=${book.id}`} className="btn btn-ghost">
              复习
            </Link>
            <Link to={`/words/quiz?book=${book.id}`} className="btn btn-ghost">
              测验
            </Link>
            <Link to={`/words/import?book=${book.id}`} className="btn btn-ghost">
              <Upload size={14} />
              导入
            </Link>
            {book.kind === 'custom' && (
              <button type="button" className="btn btn-ghost" onClick={() => setEditingBook(true)}>
                <Pencil size={14} />
              </button>
            )}
          </>
        }
      />

      <div className="mb-4 grid grid-cols-2 divide-line rounded-2xl border border-line bg-surface text-center sm:grid-cols-5 sm:divide-x">
        {[
          { label: '词条', value: stats?.total ?? book.total, color: '' },
          { label: '新词', value: stats?.new_count ?? 0, color: '' },
          { label: '学习中', value: stats?.learning_count ?? 0, color: 'text-danger' },
          { label: '待复习', value: stats?.review_count ?? 0, color: 'text-amber' },
          { label: '已掌握', value: stats?.mastered_count ?? 0, color: 'text-forest' },
        ].map((s, i) => (
          <div key={s.label} className={cn('px-3 py-4', i >= 2 && 'border-t border-line sm:border-t-0')}>
            <div className={cn('serif text-xl', s.color)}>{s.value}</div>
            <div className="mt-1 text-[10px] text-muted">{s.label}</div>
          </div>
        ))}
      </div>

      <div className="mb-4 flex flex-col gap-3 rounded-2xl border border-line bg-surface p-3 sm:flex-row sm:items-center">
        <div className="relative flex-1">
          <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="搜索单词或释义"
            className="field !w-full !border-0 !bg-surface-2 !pl-9"
          />
        </div>
        <div className="flex flex-wrap items-center gap-1.5">
          {STATES.map((s) => (
            <button
              key={s.value}
              type="button"
              onClick={() => setState(s.value)}
              className={cn('chip !py-1 !text-[11px]', state === s.value && 'chip-active')}
            >
              {s.label}
            </button>
          ))}
        </div>
        <div className="flex items-center gap-2 sm:ml-auto">
          <select
            value={sort}
            onChange={(e) => setSort(e.target.value)}
            className="field !w-auto !py-1.5 !text-[11px]"
            aria-label="排序"
          >
            {SORTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <button type="button" className="btn btn-soft !py-1.5 !text-xs" onClick={() => setAdding(true)}>
            <Plus size={14} />
            添加
          </button>
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-line bg-surface">
        {items.length ? (
          <table className="w-full text-left text-sm">
            <thead className="hidden border-b border-line text-[10px] uppercase tracking-[0.1em] text-muted sm:table-header-group">
              <tr>
                <th className="px-4 py-3 font-normal">单词</th>
                <th className="px-4 py-3 font-normal">释义</th>
                <th className="px-4 py-3 font-normal">状态</th>
                <th className="hidden px-4 py-3 font-normal md:table-cell">复习</th>
                <th className="px-4 py-3 text-right font-normal">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {items.map((word) => (
                <tr
                  key={word.id}
                  className="group cursor-pointer align-top transition-colors hover:bg-surface-2/60"
                  onClick={() => setSelectedId(word.id)}
                >
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-1">
                      <span className="serif text-[17px]">{word.term}</span>
                      <SpeakButton text={word.term} size={14} className="opacity-60 group-hover:opacity-100" />
                    </div>
                    <div className="mt-0.5 font-mono text-[10px] text-muted">{word.phonetic}</div>
                  </td>
                  <td className="px-4 py-3">
                    <div className="line-clamp-1 text-[12.5px] leading-relaxed text-ink-soft">
                      {firstLine(word.meaning_cn, 120) || '—'}
                    </div>
                  </td>
                  <td className="px-4 py-3">
                    <StateBadge state={word.state} />
                  </td>
                  <td className="hidden px-4 py-3 text-[11px] text-muted md:table-cell">
                    {relativeDue(word.due_at)}
                  </td>
                  <td className="px-4 py-3">
                    <div className="flex items-center justify-end gap-1">
                      <button
                        type="button"
                        className={cn(
                          'grid h-7 w-7 place-items-center rounded-full transition-colors',
                          word.favorite
                            ? 'text-amber'
                            : 'text-muted hover:bg-surface-2 hover:text-amber',
                        )}
                        onClick={(e) => {
                          e.stopPropagation()
                          favorite.mutate(word.id)
                        }}
                        aria-label={word.favorite ? '取消收藏' : '收藏单词'}
                      >
                        <Star size={13} fill={word.favorite ? 'currentColor' : 'none'} />
                      </button>
                      <button
                        type="button"
                        className="grid h-7 w-7 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-ink"
                        onClick={(e) => {
                          e.stopPropagation()
                          setSelectedId(word.id)
                        }}
                        aria-label="编辑"
                      >
                        <Pencil size={13} />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        ) : (
          <EmptyState
            icon={<BookPlus size={22} />}
            title={q ? '没有匹配的单词' : '这本词书还是空的'}
            description={q ? '换个关键词试试。' : '可以手动添加，也可以从文件或截图里批量导入。'}
            action={
              <>
                <button type="button" className="btn btn-primary" onClick={() => setAdding(true)}>
                  手动添加
                </button>
                <Link to={`/words/import?book=${book.id}`} className="btn btn-ghost">
                  导入单词
                </Link>
              </>
            }
          />
        )}
      </div>

      {query.data && query.data.total > 0 && (
        <div className="mt-4 flex items-center justify-between text-xs text-muted">
          <span>
            共 {query.data.total} 条 · 第 {page} / {totalPages} 页
          </span>
          <div className="flex items-center gap-2">
            <button
              type="button"
              className="btn btn-ghost !py-1.5 !text-xs"
              disabled={page <= 1}
              onClick={() => setPage((p) => Math.max(1, p - 1))}
            >
              <ChevronLeft size={14} /> 上一页
            </button>
            <button
              type="button"
              className="btn btn-ghost !py-1.5 !text-xs"
              disabled={page >= totalPages}
              onClick={() => setPage((p) => p + 1)}
            >
              下一页 <ChevronRight size={14} />
            </button>
          </div>
        </div>
      )}

      <AddWordModal
        open={adding}
        onClose={() => setAdding(false)}
        bookId={book.id}
        bookName={book.name}
      />
      <WordDetailModal
        wordId={selectedId}
        bookId={book.id}
        onClose={() => setSelectedId(null)}
      />
      <EditBookModal
        open={editingBook}
        book={book}
        onClose={() => setEditingBook(false)}
        onDeleted={() => setEditingBook(false)}
      />
    </div>
  )
}

function AddWordModal({
  open,
  onClose,
  bookId,
  bookName,
}: {
  open: boolean
  onClose: () => void
  bookId: string
  bookName: string
}) {
  const queryClient = useQueryClient()
  const [term, setTerm] = useState('')
  const [meaning, setMeaning] = useState('')
  const [phonetic, setPhonetic] = useState('')
  const create = useMutation({
    mutationFn: () =>
      api.createWord({ term: term.trim(), meaning_cn: meaning.trim(), phonetic, bookId }),
    onSuccess: (res) => {
      toast(res.created ? '单词已添加' : '已加入这本词书')
      setTerm('')
      setMeaning('')
      setPhonetic('')
      queryClient.invalidateQueries({ queryKey: ['book', bookId] })
      queryClient.invalidateQueries({ queryKey: ['books'] })
      onClose()
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`添加到「${bookName}」`}
      size="sm"
      footer={
        <div className="flex justify-end gap-2">
          <button type="button" className="btn btn-ghost" onClick={onClose}>
            取消
          </button>
          <button
            type="button"
            className="btn btn-primary"
            disabled={!term.trim() || create.isPending}
            onClick={() => create.mutate()}
          >
            添加
          </button>
        </div>
      }
    >
      <div className="space-y-4 p-5">
        <div>
          <label className="label" htmlFor="new-term">
            单词
          </label>
          <input
            id="new-term"
            className="field"
            autoFocus
            placeholder="例如 serendipity"
            value={term}
            onChange={(e) => setTerm(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="new-meaning">
            释义（留空自动从本地词典补全）
          </label>
          <input
            id="new-meaning"
            className="field"
            placeholder="n. 意外发现珍奇事物的本领"
            value={meaning}
            onChange={(e) => setMeaning(e.target.value)}
          />
        </div>
        <div>
          <label className="label" htmlFor="new-phonetic">
            音标（可选）
          </label>
          <input
            id="new-phonetic"
            className="field"
            placeholder="/ˌserənˈdɪpəti/"
            value={phonetic}
            onChange={(e) => setPhonetic(e.target.value)}
          />
        </div>
      </div>
    </Modal>
  )
}

function WordDetailModal({
  wordId,
  bookId,
  onClose,
}: {
  wordId: string | null
  bookId: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const detail = useQuery({
    queryKey: ['word', wordId],
    queryFn: () => api.word(wordId!),
    enabled: Boolean(wordId),
  })
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState({ term: '', phonetic: '', meaning_cn: '', example_en: '', example_cn: '' })
  const word = detail.data?.word

  useEffect(() => {
    if (word) {
      setDraft({
        term: word.term,
        phonetic: word.phonetic,
        meaning_cn: word.meaning_cn,
        example_en: word.example_en,
        example_cn: word.example_cn,
      })
      setEditing(false)
    }
  }, [word])

  const invalidate = () => {
    queryClient.invalidateQueries({ queryKey: ['word', wordId] })
    queryClient.invalidateQueries({ queryKey: ['book', bookId] })
    queryClient.invalidateQueries({ queryKey: ['books'] })
    queryClient.invalidateQueries({ queryKey: ['stats'] })
  }
  const save = useMutation({
    mutationFn: () => api.updateWord(word!.id, draft),
    onSuccess: () => {
      toast('已保存')
      setEditing(false)
      invalidate()
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })
  const master = useMutation({
    mutationFn: () => api.markMastered(word!.id),
    onSuccess: () => {
      toast('已标记为掌握')
      invalidate()
      onClose()
    },
  })
  const addNew = useMutation({
    mutationFn: () => api.createWord({ term: word!.term, bookId: 'b_newwords' }),
    onSuccess: () => {
      toast('已收进生词本')
      invalidate()
    },
  })
  const favorite = useMutation({
    mutationFn: () => api.toggleFavorite('word', word!.id),
    onSuccess: (res) => {
      toast(res.favorited ? '已收藏单词' : '已取消收藏')
      queryClient.invalidateQueries({ queryKey: ['word', wordId] })
      queryClient.invalidateQueries({ queryKey: ['book', bookId] })
      queryClient.invalidateQueries({ queryKey: ['favorites'] })
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })
  const remove = useMutation({
    mutationFn: () => api.deleteWord(word!.id, bookId),
    onSuccess: () => {
      toast('已从词书移除')
      invalidate()
      onClose()
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  return (
    <Modal
      open={Boolean(wordId)}
      onClose={onClose}
      title={word ? word.term : '单词详情'}
      size="lg"
      footer={
        word ? (
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex gap-2">
              <button
                type="button"
                className="btn btn-ghost !py-1.5 !text-xs"
                onClick={() => {
                  if (window.confirm(`从当前词书移除「${word.term}」？`)) remove.mutate()
                }}
              >
                <Trash2 size={13} />
                移除
              </button>
              <button type="button" className="btn btn-ghost !py-1.5 !text-xs" onClick={() => addNew.mutate()}>
                <BookPlus size={13} />
                收进生词本
              </button>
            </div>
            <div className="flex gap-2">
              {word.state !== 'mastered' && (
                <button type="button" className="btn btn-ghost !py-1.5 !text-xs" onClick={() => master.mutate()}>
                  标记掌握
                </button>
              )}
              {editing ? (
                <>
                  <button type="button" className="btn btn-ghost !py-1.5 !text-xs" onClick={() => setEditing(false)}>
                    取消
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary !py-1.5 !text-xs"
                    disabled={save.isPending}
                    onClick={() => save.mutate()}
                  >
                    保存
                  </button>
                </>
              ) : (
                <button type="button" className="btn btn-soft !py-1.5 !text-xs" onClick={() => setEditing(true)}>
                  <Pencil size={13} />
                  编辑
                </button>
              )}
            </div>
          </div>
        ) : undefined
      }
    >
      {detail.isLoading || !word ? (
        <div className="p-6">
          <div className="h-24 skeleton rounded-xl" />
        </div>
      ) : editing ? (
        <div className="space-y-4 p-5">
          {[
            { key: 'term', label: '单词' },
            { key: 'phonetic', label: '音标' },
            { key: 'meaning_cn', label: '中文释义' },
            { key: 'example_en', label: '英文例句' },
            { key: 'example_cn', label: '例句译文' },
          ].map((field) => (
            <div key={field.key}>
              <label className="label" htmlFor={`edit-${field.key}`}>
                {field.label}
              </label>
              {field.key === 'meaning_cn' || field.key.startsWith('example') ? (
                <textarea
                  id={`edit-${field.key}`}
                  className="field min-h-[72px]"
                  value={draft[field.key as keyof typeof draft]}
                  onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
                />
              ) : (
                <input
                  id={`edit-${field.key}`}
                  className="field"
                  value={draft[field.key as keyof typeof draft]}
                  onChange={(e) => setDraft({ ...draft, [field.key]: e.target.value })}
                />
              )}
            </div>
          ))}
        </div>
      ) : (
        <div className="p-5">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <span className="serif text-4xl">{word.term}</span>
                <SpeakButton text={word.term} size={20} />
                <button
                  type="button"
                  onClick={() => favorite.mutate()}
                  className={cn(
                    'grid h-8 w-8 place-items-center rounded-full transition-colors',
                    word.favorite ? 'text-amber' : 'text-muted hover:bg-surface-2 hover:text-amber',
                  )}
                  aria-label={word.favorite ? '取消收藏' : '收藏单词'}
                >
                  <Star size={17} fill={word.favorite ? 'currentColor' : 'none'} />
                </button>
              </div>
              <div className="mt-2 font-mono text-xs text-muted">{word.phonetic || '暂无音标'}</div>
            </div>
            <div className="flex flex-col items-end gap-1.5">
              <StateBadge state={word.state} />
              <span className="text-[10px] text-muted">
                {word.reps ? `复习 ${word.reps} 次 · 正确 ${word.correct}` : '还未开始学习'}
              </span>
            </div>
          </div>

          <div className="mt-5 rounded-xl bg-surface-2/60 p-4">
            <div className="whitespace-pre-line text-[15px] leading-relaxed text-ink">
              {word.meaning_cn || '暂无释义'}
            </div>
            {word.pos && <div className="mt-2 text-[11px] text-muted">{word.pos}</div>}
          </div>

          {word.meaning_en && (
            <div className="mt-4">
              <p className="eyebrow mb-1.5">English definition</p>
              <p className="text-sm leading-relaxed text-ink-soft">{word.meaning_en}</p>
            </div>
          )}

          {word.example_en && (
            <div className="mt-4 rounded-xl border border-line p-4">
              <p className="eyebrow mb-1.5">Example</p>
              <p className="serif text-[16px] leading-relaxed">{word.example_en}</p>
              {word.example_cn && <p className="mt-1.5 text-sm text-muted">{word.example_cn}</p>}
            </div>
          )}

          <dl className="mt-5 grid grid-cols-2 gap-3 border-t border-line pt-4 text-[11px] sm:grid-cols-4">
            <div>
              <dt className="text-muted">词形变化</dt>
              <dd className="mt-1 leading-relaxed text-ink-soft">{word.exchange || '—'}</dd>
            </div>
            <div>
              <dt className="text-muted">下次复习</dt>
              <dd className="mt-1 text-ink-soft">{relativeDue(word.due_at)}</dd>
            </div>
            <div>
              <dt className="text-muted">间隔</dt>
              <dd className="mt-1 text-ink-soft">
                {word.interval_days ? `${Math.round(word.interval_days * 10) / 10} 天` : '—'}
              </dd>
            </div>
            <div>
              <dt className="text-muted">来源</dt>
              <dd className="mt-1 text-ink-soft">{word.source === 'ECDICT' ? 'ECDICT' : '自定义'}</dd>
            </div>
          </dl>
          <div className="mt-4 flex flex-wrap gap-1.5">
            {word.levels.map((l) => (
              <span key={l} className="chip !text-[10px]">
                {levelLabel(l)}
              </span>
            ))}
            {word.is_core && <span className="chip !text-[10px]">精讲例句</span>}
          </div>
        </div>
      )}
    </Modal>
  )
}

function EditBookModal({
  open,
  book,
  onClose,
}: {
  open: boolean
  book: Book
  onClose: () => void
  onDeleted?: () => void
}) {
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [name, setName] = useState(book.name)
  const [description, setDescription] = useState(book.description)
  const [level, setLevel] = useState(book.level)
  const [color, setColor] = useState(book.color)

  useEffect(() => {
    if (open) {
      setName(book.name)
      setDescription(book.description)
      setLevel(book.level)
      setColor(book.color)
    }
  }, [open, book])

  const save = useMutation({
    mutationFn: () => api.updateBook(book.id, { name, description, level, color }),
    onSuccess: () => {
      toast('词书已更新')
      queryClient.invalidateQueries({ queryKey: ['books'] })
      queryClient.invalidateQueries({ queryKey: ['book', book.id] })
      onClose()
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })
  const remove = useMutation({
    mutationFn: () => api.deleteBook(book.id),
    onSuccess: () => {
      toast('词书已删除')
      queryClient.invalidateQueries({ queryKey: ['books'] })
      navigate('/words')
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="编辑词书"
      size="sm"
      footer={
        <div className="flex items-center justify-between">
          <button
            type="button"
            className="text-[11px] text-danger hover:underline"
            onClick={() => {
              if (window.confirm(`确定删除「${book.name}」？词条会从这本词书移除。`)) remove.mutate()
            }}
          >
            删除词书
          </button>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={onClose}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!name.trim() || save.isPending}
              onClick={() => save.mutate()}
            >
              保存
            </button>
          </div>
        </div>
      }
    >
      <div className="space-y-4 p-5">
        <div>
          <label className="label" htmlFor="eb-name">
            名称
          </label>
          <input id="eb-name" className="field" value={name} onChange={(e) => setName(e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="eb-desc">
            简介
          </label>
          <input
            id="eb-desc"
            className="field"
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="eb-level">
              级别
            </label>
            <select
              id="eb-level"
              className="field"
              value={level}
              onChange={(e) => setLevel(e.target.value as Book['level'])}
            >
              <option value="all">不限</option>
              <option value="cet4">四级</option>
              <option value="cet6">六级</option>
            </select>
          </div>
          <div>
            <span className="label">颜色</span>
            <div className="flex flex-wrap gap-2 pt-1.5">
              {Object.keys(BOOK_COLORS).map((c) => (
                <button
                  key={c}
                  type="button"
                  aria-label={c}
                  onClick={() => setColor(c)}
                  className={cn(
                    'h-6 w-6 rounded-full border-2',
                    color === c ? 'border-ink' : 'border-transparent',
                  )}
                  style={{ background: BOOK_COLORS[c] }}
                />
              ))}
            </div>
          </div>
        </div>
        <p className="text-[10px] text-muted">
          当前进度：{pct(book.total - book.new_count, book.total)}% · {book.total} 词
        </p>
      </div>
    </Modal>
  )
}
