import { useEffect, useMemo, useRef, useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Check,
  ClipboardPaste,
  Download,
  FileText,
  Image as ImageIcon,
  Keyboard,
  Loader2,
  Trash2,
  UploadCloud,
  X,
} from 'lucide-react'
import { api } from '@/lib/api'
import { useSettings } from '@/lib/hooks'
import { PageHeader } from '@/components/PageHeader'
import { toast } from '@/store/ui'
import { cn } from '@/lib/utils'
import {
  dedupeWords,
  extractFileWords,
  extractOcrTokens,
  ocrImage,
  parseWordText,
  type ParsedWord,
} from '@/lib/importers'

type Tab = 'file' | 'image' | 'paste' | 'manual'

interface PreviewRow {
  key: string
  term: string
  phonetic: string
  meaning: string
  exists: boolean
  checked: boolean
}

const TABS: Array<{ value: Tab; label: string; icon: typeof FileText }> = [
  { value: 'file', label: '文件导入', icon: FileText },
  { value: 'image', label: '图片识别', icon: ImageIcon },
  { value: 'paste', label: '粘贴文本', icon: ClipboardPaste },
  { value: 'manual', label: '手动添加', icon: Keyboard },
]

export default function Import() {
  const [params] = useSearchParams()
  const { settings } = useSettings()
  const queryClient = useQueryClient()
  const books = useQuery({ queryKey: ['books'], queryFn: api.books })
  const [tab, setTab] = useState<Tab>('file')
  const [targetBook, setTargetBook] = useState(params.get('book') || settings.defaultBookId || 'b_newwords')
  const [rows, setRows] = useState<PreviewRow[]>([])
  const [busy, setBusy] = useState('')
  const [progress, setProgress] = useState(0)
  const [pasted, setPasted] = useState('')
  const [manual, setManual] = useState({ term: '', meaning: '' })
  const [dragging, setDragging] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)

  const selected = rows.filter((r) => r.checked && r.term.trim() && !r.exists)

  useEffect(() => {
    if (!params.get('book') && settings.defaultBookId) {
      setTargetBook(settings.defaultBookId)
    }
  }, [settings.defaultBookId, params])

  const buildRows = async (parsed: ParsedWord[], dictionaryOnly = false) => {
    const clean = dedupeWords(parsed.filter((p) => p.term && p.term.length > 1)).slice(0, 800)
    if (!clean.length) {
      toast('没有解析到英文单词，换个文件或检查文本格式', 'error')
      return
    }
    const res = await api.dictBatch(
      clean.map((p) => p.term),
      targetBook,
    )
    const mapped: PreviewRow[] = []
    clean.forEach((p, i) => {
      const entry = res.items[i]
      if (!entry) return
      if (dictionaryOnly && !entry.found) return
      const meaning = (p.meaning || entry.meaning_cn || '').replace(/\n/g, '；')
      const exists = entry.existsInBook
      mapped.push({
        key: `${p.term}-${i}`,
        term: p.term,
        phonetic: entry.phonetic || '',
        meaning,
        exists,
        checked: !exists && Boolean(meaning || entry.found),
      })
    })
    if (!mapped.length) {
      toast(dictionaryOnly ? '图片里的单词都不在本地词典中，可换清晰截图' : '没有可导入的条目', 'error')
      return
    }
    setRows(mapped)
    toast(`解析到 ${mapped.length} 个词，确认后导入`)
  }

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (!list.length) return
    setBusy('正在解析文件…')
    setProgress(0)
    try {
      const all: ParsedWord[] = []
      for (const file of list) {
        if (file.size > 20 * 1024 * 1024) {
          toast(`${file.name} 超过 20 MB，已跳过`, 'error')
          continue
        }
        all.push(...(await extractFileWords(file)))
      }
      await buildRows(all)
    } catch (err) {
      toast(`解析失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy('')
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleImage = async (file: File) => {
    if (!file.type.startsWith('image/')) {
      toast('请选择 PNG / JPG / WebP 图片', 'error')
      return
    }
    setBusy('正在识别图片文字…')
    setProgress(0)
    try {
      const text = await ocrImage(file, setProgress)
      const tokens = extractOcrTokens(text)
      await buildRows(
        tokens.map((term) => ({ term, meaning: '' })),
        true,
      )
    } catch (err) {
      toast(`识别失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy('')
      setProgress(0)
      if (imageRef.current) imageRef.current.value = ''
    }
  }

  const commit = useMutation({
    mutationFn: () =>
      api.bulkWords(
        targetBook,
        selected.map((r) => ({
          term: r.term.trim(),
          phonetic: r.phonetic,
          meaning_cn: r.meaning,
        })),
      ),
    onSuccess: (res) => {
      toast(
        `导入完成：新增 ${res.created} 个，已有词 ${res.linked} 个，重复跳过 ${res.skipped} 个`,
      )
      setRows([])
      queryClient.invalidateQueries({ queryKey: ['books'] })
      queryClient.invalidateQueries({ queryKey: ['book', targetBook] })
      queryClient.invalidateQueries({ queryKey: ['stats'] })
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  const addManual = useMutation({
    mutationFn: () =>
      api.createWord({ term: manual.term.trim(), meaning_cn: manual.meaning.trim(), bookId: targetBook }),
    onSuccess: (res) => {
      toast(res.created ? '已添加' : '已加入词书')
      setManual({ term: '', meaning: '' })
      queryClient.invalidateQueries({ queryKey: ['books'] })
      queryClient.invalidateQueries({ queryKey: ['book', targetBook] })
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  const stats = useMemo(() => {
    const exists = rows.filter((r) => r.exists).length
    return { total: rows.length, exists, checked: selected.length }
  }, [rows, selected.length])

  const downloadTemplate = () => {
    const csv =
      'word,meaning\nabandon,vt. 放弃；抛弃\ndiligent,a. 勤奋的\ncompetence,n. 能力；胜任\n'
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'inkling-words-template.csv'
    a.click()
    URL.revokeObjectURL(url)
  }

  return (
    <div>
      <PageHeader
        eyebrow="Import"
        title="导入单词"
        description="文件在浏览器本地解析，只有确认后的单词会写入数据库；支持 PDF、Word、CSV、TXT、JSON 与截图 OCR。"
        actions={
          <Link to="/words" className="btn btn-ghost">
            返回单词本
          </Link>
        }
      />

      <div className="grid gap-5 lg:grid-cols-[1.55fr_1fr]">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5">
            {TABS.map((t) => {
              const Icon = t.icon
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTab(t.value)}
                  className={cn('chip !px-3.5 !py-2', tab === t.value && 'chip-active')}
                >
                  <Icon size={13} />
                  {t.label}
                </button>
              )
            })}
          </div>

          <div className="card mt-4 p-5">
            {tab === 'file' && (
              <>
                <div
                  onDragOver={(e) => {
                    e.preventDefault()
                    setDragging(true)
                  }}
                  onDragLeave={() => setDragging(false)}
                  onDrop={(e) => {
                    e.preventDefault()
                    setDragging(false)
                    handleFiles(e.dataTransfer.files)
                  }}
                  className={cn(
                    'flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed px-5 py-8 text-center transition-colors',
                    dragging ? 'border-forest bg-forest-soft/50' : 'border-line bg-surface-2/30',
                  )}
                >
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface text-forest shadow-[var(--shadow-card)]">
                    <UploadCloud size={22} />
                  </span>
                  <p className="mt-4 text-sm font-medium">把文件拖到这里，或点击选择</p>
                  <p className="mt-1 text-[11px] leading-relaxed text-muted">
                    支持 .pdf / .docx / .csv / .tsv / .txt / .md / .json
                    <br />
                    单文件最大 20 MB，一次最多 800 个词
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary mt-4"
                    onClick={() => fileRef.current?.click()}
                    disabled={Boolean(busy)}
                  >
                    选择文件
                  </button>
                  <input
                    ref={fileRef}
                    type="file"
                    multiple
                    accept=".pdf,.docx,.csv,.tsv,.txt,.md,.json"
                    className="hidden"
                    onChange={(e) => e.target.files && handleFiles(e.target.files)}
                  />
                </div>
                <div className="mt-4 flex flex-wrap items-center justify-between gap-2 text-[11px] text-muted">
                  <span>推荐格式：每行一个词，单词后跟释义，例如 “abandon vt. 放弃”。</span>
                  <button
                    type="button"
                    onClick={downloadTemplate}
                    className="inline-flex items-center gap-1 text-forest hover:underline"
                  >
                    <Download size={12} /> 下载 CSV 模板
                  </button>
                </div>
              </>
            )}

            {tab === 'image' && (
              <>
                <div
                  className="flex min-h-[220px] flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface-2/30 px-5 py-8 text-center"
                  onDragOver={(e) => e.preventDefault()}
                  onDrop={(e) => {
                    e.preventDefault()
                    const file = e.dataTransfer.files?.[0]
                    if (file) handleImage(file)
                  }}
                >
                  <span className="grid h-12 w-12 place-items-center rounded-2xl bg-surface text-forest shadow-[var(--shadow-card)]">
                    <ImageIcon size={22} />
                  </span>
                  <p className="mt-4 text-sm font-medium">上传单词表截图，自动识别英文单词</p>
                  <p className="mt-1 max-w-sm text-[11px] leading-relaxed text-muted">
                    OCR 使用本机内置英文语言包，首次识别需加载约 3 MB，不联网。
                  </p>
                  <button
                    type="button"
                    className="btn btn-primary mt-4"
                    disabled={Boolean(busy)}
                    onClick={() => imageRef.current?.click()}
                  >
                    选择图片
                  </button>
                  <input
                    ref={imageRef}
                    type="file"
                    accept="image/png,image/jpeg,image/webp"
                    className="hidden"
                    onChange={(e) => {
                      const file = e.target.files?.[0]
                      if (file) handleImage(file)
                    }}
                  />
                </div>
                <div className="mt-4 grid gap-2 text-[11px] text-muted sm:grid-cols-3">
                  <div className="rounded-lg bg-surface-2/50 px-3 py-2">正对屏幕截图，避免倾斜</div>
                  <div className="rounded-lg bg-surface-2/50 px-3 py-2">字号清晰，少用手写体</div>
                  <div className="rounded-lg bg-surface-2/50 px-3 py-2">识别后需要人工核对</div>
                </div>
              </>
            )}

            {tab === 'paste' && (
              <>
                <label className="label" htmlFor="paste-area">
                  粘贴文本
                </label>
                <textarea
                  id="paste-area"
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  placeholder={'abandon  vt. 放弃；抛弃\nbenefit  n. 益处；v. 有益于\nserendipity - 意外发现珍奇事物的本领'}
                  className="field min-h-[220px] font-mono !text-[12px] leading-relaxed"
                />
                <div className="mt-3 flex items-center justify-between">
                  <span className="text-[11px] text-muted">每行一个单词，释义可留空，稍后由本地词典补全。</span>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!pasted.trim()}
                    onClick={() => buildRows(parseWordText(pasted))}
                  >
                    解析
                  </button>
                </div>
              </>
            )}

            {tab === 'manual' && (
              <>
                <div className="space-y-4">
                  <div>
                    <label className="label" htmlFor="manual-term">
                      单词
                    </label>
                    <input
                      id="manual-term"
                      className="field"
                      value={manual.term}
                      onChange={(e) => setManual({ ...manual, term: e.target.value })}
                      placeholder="serendipity"
                    />
                  </div>
                  <div>
                    <label className="label" htmlFor="manual-meaning">
                      释义（可留空，自动从本地词典补全）
                    </label>
                    <input
                      id="manual-meaning"
                      className="field"
                      value={manual.meaning}
                      onChange={(e) => setManual({ ...manual, meaning: e.target.value })}
                      placeholder="n. 意外发现珍奇事物的本领"
                    />
                  </div>
                  <button
                    type="button"
                    className="btn btn-primary"
                    disabled={!manual.term.trim() || addManual.isPending}
                    onClick={() => addManual.mutate()}
                  >
                    加入词书
                  </button>
                </div>
                <p className="mt-4 text-[11px] text-muted">
                  如果要连续添加多个词，用「粘贴文本」会更快。
                </p>
              </>
            )}

            {busy && (
              <div className="mt-4 rounded-xl border border-line bg-surface-2/40 px-4 py-3">
                <div className="flex items-center gap-2 text-[12px] text-ink-soft">
                  <Loader2 size={14} className="animate-spin text-forest" />
                  {busy}
                  {progress > 0 && <span className="ml-auto font-mono text-[10px]">{Math.round(progress * 100)}%</span>}
                </div>
                {progress > 0 && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
                    <div
                      className="h-full rounded-full bg-forest transition-all"
                      style={{ width: `${progress * 100}%` }}
                    />
                  </div>
                )}
              </div>
            )}
          </div>

          {rows.length > 0 && (
            <div className="card mt-5 overflow-hidden">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-4 py-3">
                <div>
                  <p className="text-sm font-medium">导入预览</p>
                  <p className="mt-0.5 text-[10px] text-muted">
                    共 {stats.total} 行 · 已存在 {stats.exists} · 将导入 {stats.checked}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <label className="flex cursor-pointer items-center gap-1.5 text-[11px] text-muted">
                    <input
                      type="checkbox"
                      className="h-3.5 w-3.5 accent-[var(--c-forest)]"
                      checked={rows.every((r) => r.exists || r.checked)}
                      onChange={(e) =>
                        setRows((prev) =>
                          prev.map((r) => ({ ...r, checked: r.exists ? false : e.target.checked })),
                        )
                      }
                    />
                    全选
                  </label>
                  <button
                    type="button"
                    className="text-[11px] text-muted hover:text-ink"
                    onClick={() => setRows([])}
                  >
                    清空
                  </button>
                  <button
                    type="button"
                    className="btn btn-primary !py-1.5 !text-xs"
                    disabled={!stats.checked || commit.isPending}
                    onClick={() => commit.mutate()}
                  >
                    导入 {stats.checked} 个词
                  </button>
                </div>
              </div>
              <div className="max-h-[460px] overflow-auto">
                <table className="w-full min-w-[620px] text-left text-xs">
                  <thead className="sticky top-0 z-10 border-b border-line bg-surface text-[10px] text-muted">
                    <tr>
                      <th className="w-8 px-3 py-2" />
                      <th className="px-2 py-2 font-normal">单词</th>
                      <th className="px-2 py-2 font-normal">音标</th>
                      <th className="px-2 py-2 font-normal">释义</th>
                      <th className="w-16 px-2 py-2 font-normal">状态</th>
                      <th className="w-8 px-2 py-2" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((row, i) => (
                      <tr key={row.key} className={cn(row.exists && 'bg-surface-2/30')}>
                        <td className="px-3 py-1.5">
                          <input
                            type="checkbox"
                            className="h-3.5 w-3.5 accent-[var(--c-forest)]"
                            checked={row.checked}
                            disabled={row.exists}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((r, idx) =>
                                  idx === i ? { ...r, checked: e.target.checked } : r,
                                ),
                              )
                            }
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={row.term}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((r, idx) => (idx === i ? { ...r, term: e.target.value } : r)),
                              )
                            }
                            className="w-full min-w-[90px] rounded border border-transparent bg-transparent px-1 py-0.5 font-medium focus:border-line focus:bg-surface"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={row.phonetic}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((r, idx) => (idx === i ? { ...r, phonetic: e.target.value } : r)),
                              )
                            }
                            className="w-full min-w-[100px] rounded border border-transparent bg-transparent px-1 py-0.5 font-mono text-[10px] text-muted focus:border-line focus:bg-surface"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          <input
                            value={row.meaning}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((r, idx) => (idx === i ? { ...r, meaning: e.target.value } : r)),
                              )
                            }
                            className="w-full min-w-[180px] rounded border border-transparent bg-transparent px-1 py-0.5 text-ink-soft focus:border-line focus:bg-surface"
                          />
                        </td>
                        <td className="px-2 py-1.5">
                          {row.exists ? (
                            <span className="text-[10px] text-muted">已存在</span>
                          ) : row.meaning ? (
                            <span className="inline-flex items-center gap-0.5 text-[10px] text-forest">
                              <Check size={11} /> 待导入
                            </span>
                          ) : (
                            <span className="text-[10px] text-amber">缺释义</span>
                          )}
                        </td>
                        <td className="px-2 py-1.5">
                          <button
                            type="button"
                            className="text-muted hover:text-danger"
                            onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                            aria-label="删除这一行"
                          >
                            <X size={13} />
                          </button>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}
        </div>

        <aside className="space-y-4">
          <div className="card p-5">
            <p className="eyebrow">导入到</p>
            <select
              className="field mt-2"
              value={targetBook}
              onChange={(e) => setTargetBook(e.target.value)}
            >
              {(books.data?.items ?? []).map((b) => (
                <option key={b.id} value={b.id}>
                  {b.name}
                </option>
              ))}
            </select>
            <div className="mt-4 space-y-2 border-t border-line pt-4 text-[11px]">
              <div className="flex justify-between">
                <span className="text-muted">解析行数</span>
                <span className="tabular-nums">{stats.total}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">已存在</span>
                <span className="tabular-nums">{stats.exists}</span>
              </div>
              <div className="flex justify-between">
                <span className="text-muted">待导入</span>
                <span className="font-medium tabular-nums text-forest">{stats.checked}</span>
              </div>
            </div>
            {stats.total > 0 && stats.checked === 0 && (
              <p className="mt-2 rounded-lg bg-surface-2/60 px-2.5 py-2 text-[10px] leading-relaxed text-muted">
                这些词已全部在目标词书中，无需重复导入。
              </p>
            )}
            <button
              type="button"
              className="btn btn-primary mt-4 w-full"
              disabled={!stats.checked || commit.isPending}
              onClick={() => commit.mutate()}
            >
              确认导入
            </button>
            {commit.isSuccess && (
              <p className="mt-2 text-center text-[10px] text-forest">已写入词书</p>
            )}
          </div>

          <div className="card p-5">
            <p className="eyebrow">说明</p>
            <ul className="mt-2 space-y-2 text-[11px] leading-relaxed text-muted">
              <li>· 文件只在浏览器里解析，不上传服务器。</li>
              <li>· 自动从本地 4.5 万词词典补全音标与释义。</li>
              <li>· 已存在的词会跳过，不会覆盖学习进度。</li>
              <li>· 扫描版 PDF 如果没有文本层，请截图后用图片识别。</li>
              <li>· OCR 对拍照与手写体准确率有限，预览里可直接改。</li>
            </ul>
          </div>

          {rows.length === 0 && (
            <div className="card flex items-start gap-3 p-4">
              <Trash2 size={15} className="mt-0.5 text-muted" />
              <p className="text-[11px] leading-relaxed text-muted">
                导入完成后可以随时在词书里编辑、删除或标记掌握。
              </p>
            </div>
          )}
        </aside>
      </div>
    </div>
  )
}
