import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ClipboardPaste, FileText, Image as ImageIcon, Loader2, Trash2, UploadCloud } from 'lucide-react'
import { api } from '@/lib/api'
import { useSettings } from '@/lib/hooks'
import { Modal } from '@/components/Modal'
import { toast } from '@/store/ui'
import { cn } from '@/lib/utils'
import {
  extractSentencePairs,
  ocrSentencePairs,
  parseSentenceText,
  type ParsedSentence,
} from '@/lib/sentenceImport'

type Tab = 'file' | 'image' | 'paste'

interface Row extends ParsedSentence {
  key: string
  checked: boolean
}

const TABS: Array<{ value: Tab; label: string; icon: typeof FileText }> = [
  { value: 'file', label: '文件导入', icon: FileText },
  { value: 'image', label: '图片识别', icon: ImageIcon },
  { value: 'paste', label: '粘贴文本', icon: ClipboardPaste },
]

const CATEGORIES = [
  { value: 'custom', label: '我的句子' },
  { value: 'writing', label: '写作句型' },
  { value: 'motivational', label: '励志名言' },
  { value: 'literature', label: '名著摘抄' },
  { value: 'exam', label: '高频表达' },
]

export function SentenceImportModal({
  open,
  onClose,
}: {
  open: boolean
  onClose: () => void
}) {
  const { settings } = useSettings()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<Tab>('file')
  const [rows, setRows] = useState<Row[]>([])
  const [pasted, setPasted] = useState('')
  const [category, setCategory] = useState('custom')
  const [level, setLevel] = useState(settings.level === 'all' ? 'all' : settings.level)
  const [source, setSource] = useState('我的句子')
  const [busy, setBusy] = useState('')
  const [progress, setProgress] = useState(0)
  const fileRef = useRef<HTMLInputElement>(null)
  const imageRef = useRef<HTMLInputElement>(null)

  const selected = rows.filter((r) => r.checked && r.text_en.trim())

  const addRows = (items: ParsedSentence[]) => {
    const seen = new Set(rows.map((r) => r.text_en.trim().toLowerCase()))
    const next: Row[] = []
    for (const item of items) {
      const en = item.text_en.trim()
      if (!en || seen.has(en.toLowerCase())) continue
      seen.add(en.toLowerCase())
      next.push({
        key: `${Date.now()}-${next.length}-${en.slice(0, 12)}`,
        text_en: en,
        text_cn: item.text_cn || '',
        checked: true,
      })
      if (next.length + rows.length >= 200) break
    }
    if (!next.length) {
      toast('没有解析到新的英文句子', 'error')
      return
    }
    setRows((prev) => [...prev, ...next])
    toast(`识别到 ${next.length} 条句子，确认后导入`)
  }

  const handleFiles = async (files: FileList | File[]) => {
    const list = Array.from(files)
    if (!list.length) return
    setBusy('正在解析文件…')
    try {
      const all: ParsedSentence[] = []
      for (const file of list) {
        if (file.size > 20 * 1024 * 1024) {
          toast(`${file.name} 超过 20 MB，已跳过`, 'error')
          continue
        }
        all.push(...(await extractSentencePairs(file)))
      }
      addRows(all)
    } catch (err) {
      toast(`解析失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy('')
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const handleImage = async (file: File) => {
    setBusy('正在识别图片…')
    setProgress(0)
    try {
      const items = await ocrSentencePairs(file, setProgress)
      addRows(items)
    } catch (err) {
      toast(`识别失败：${(err as Error).message}`, 'error')
    } finally {
      setBusy('')
      setProgress(0)
      if (imageRef.current) imageRef.current.value = ''
    }
  }

  const save = useMutation({
    mutationFn: () =>
      api.importSentences(
        selected.map((r) => ({
          text_en: r.text_en.trim(),
          text_cn: r.text_cn.trim(),
          category,
          level: level as 'cet4' | 'cet6' | 'all',
          source: source.trim() || '我的句子',
          subcategory: category === 'writing' ? 'opening' : 'user',
          note: '',
          tags: category === 'custom' ? ['自定义'] : [],
          difficulty: 2,
        })),
      ),
    onSuccess: (res) => {
      toast(`导入完成：新增 ${res.created} 条，重复跳过 ${res.skipped} 条`)
      queryClient.invalidateQueries({ queryKey: ['sentences'] })
      queryClient.invalidateQueries({ queryKey: ['favorites'] })
      setRows([])
      setPasted('')
      onClose()
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  const close = () => {
    if (save.isPending) return
    onClose()
  }

  return (
    <Modal
      open={open}
      onClose={close}
      title="导入句子"
      size="xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="text-[11px] text-muted">
            已选 <span className="font-medium text-forest">{selected.length}</span> 条 · 共 {rows.length} 条
          </div>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={close}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!selected.length || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? '导入中…' : `导入 ${selected.length} 条`}
            </button>
          </div>
        </div>
      }
    >
      <div className="grid gap-4 p-5 lg:grid-cols-[1.5fr_1fr]">
        <div className="min-w-0">
          <div className="flex flex-wrap gap-1.5">
            {TABS.map((t) => {
              const Icon = t.icon
              return (
                <button
                  key={t.value}
                  type="button"
                  onClick={() => setTab(t.value)}
                  className={cn('chip !px-3 !py-1.5', tab === t.value && 'chip-active')}
                >
                  <Icon size={13} />
                  {t.label}
                </button>
              )
            })}
          </div>

          <div className="mt-3">
            {tab === 'file' && (
              <div
                className="flex min-h-[160px] flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface-2/30 px-5 py-6 text-center"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  handleFiles(e.dataTransfer.files)
                }}
              >
                <UploadCloud size={24} className="text-forest" />
                <p className="mt-3 text-sm font-medium">拖入文件，或点击选择</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  支持 .pdf / .docx / .csv / .txt / .md / .json
                  <br />
                  一行英文一行中文会自动配对；也可以导入后手改译文
                </p>
                <button
                  type="button"
                  className="btn btn-primary mt-3 !py-1.5 !text-xs"
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
            )}

            {tab === 'image' && (
              <div
                className="flex min-h-[160px] flex-col items-center justify-center rounded-2xl border border-dashed border-line bg-surface-2/30 px-5 py-6 text-center"
                onDragOver={(e) => e.preventDefault()}
                onDrop={(e) => {
                  e.preventDefault()
                  const file = e.dataTransfer.files?.[0]
                  if (file) handleImage(file)
                }}
              >
                <ImageIcon size={24} className="text-forest" />
                <p className="mt-3 text-sm font-medium">上传句子截图</p>
                <p className="mt-1 text-[11px] leading-relaxed text-muted">
                  本地英文 OCR，仅识别英文；中文译文需要手动补
                </p>
                <button
                  type="button"
                  className="btn btn-primary mt-3 !py-1.5 !text-xs"
                  onClick={() => imageRef.current?.click()}
                  disabled={Boolean(busy)}
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
            )}

            {tab === 'paste' && (
              <div>
                <textarea
                  value={pasted}
                  onChange={(e) => setPasted(e.target.value)}
                  placeholder={'Learning is a treasure that will follow its owner everywhere.\n学习是一笔财富，走到哪里都跟随着它的主人。'}
                  className="field min-h-[150px] font-mono !text-[12px] leading-relaxed"
                />
                <div className="mt-2 flex justify-end">
                  <button
                    type="button"
                    className="btn btn-soft !py-1.5 !text-xs"
                    disabled={!pasted.trim()}
                    onClick={() => addRows(parseSentenceText(pasted))}
                  >
                    解析文本
                  </button>
                </div>
              </div>
            )}

            {busy && (
              <div className="mt-3 rounded-xl border border-line bg-surface-2/40 px-4 py-3">
                <div className="flex items-center gap-2 text-[12px] text-ink-soft">
                  <Loader2 size={14} className="animate-spin text-forest" />
                  {busy}
                  {progress > 0 && (
                    <span className="ml-auto font-mono text-[10px]">{Math.round(progress * 100)}%</span>
                  )}
                </div>
                {progress > 0 && (
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-surface">
                    <div className="h-full rounded-full bg-forest" style={{ width: `${progress * 100}%` }} />
                  </div>
                )}
              </div>
            )}
          </div>

          {rows.length > 0 && (
            <div className="mt-4 overflow-hidden rounded-xl border border-line">
              <div className="flex items-center justify-between border-b border-line bg-surface-2/40 px-3 py-2">
                <span className="text-[11px] text-muted">
                  共 {rows.length} 条 · 将导入 {selected.length} 条
                </span>
                <div className="flex items-center gap-2 text-[10px] text-muted">
                  <label className="flex cursor-pointer items-center gap-1">
                    <input
                      type="checkbox"
                      className="h-3 w-3 accent-[var(--c-forest)]"
                      checked={rows.every((r) => r.checked)}
                      onChange={(e) => setRows((prev) => prev.map((r) => ({ ...r, checked: e.target.checked })))}
                    />
                    全选
                  </label>
                  <button type="button" onClick={() => setRows([])} className="hover:text-ink">
                    清空
                  </button>
                </div>
              </div>
              <div className="max-h-[280px] overflow-y-auto">
                <table className="w-full text-left text-[11px]">
                  <thead className="sticky top-0 bg-surface text-[9px] text-muted">
                    <tr>
                      <th className="w-7 px-2 py-1.5" />
                      <th className="px-1 py-1.5 font-normal">英文</th>
                      <th className="px-1 py-1.5 font-normal">译文（可手改）</th>
                      <th className="w-6 px-1 py-1.5" />
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-line">
                    {rows.map((row, i) => (
                      <tr key={row.key}>
                        <td className="px-2 py-1">
                          <input
                            type="checkbox"
                            className="h-3 w-3 accent-[var(--c-forest)]"
                            checked={row.checked}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((r, idx) => (idx === i ? { ...r, checked: e.target.checked } : r)),
                              )
                            }
                          />
                        </td>
                        <td className="px-1 py-1">
                          <textarea
                            value={row.text_en}
                            rows={2}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((r, idx) => (idx === i ? { ...r, text_en: e.target.value } : r)),
                              )
                            }
                            className="w-full resize-y rounded border border-transparent bg-transparent px-1 py-0.5 leading-relaxed focus:border-line focus:bg-surface"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <textarea
                            value={row.text_cn}
                            rows={2}
                            onChange={(e) =>
                              setRows((prev) =>
                                prev.map((r, idx) => (idx === i ? { ...r, text_cn: e.target.value } : r)),
                              )
                            }
                            className="w-full resize-y rounded border border-transparent bg-transparent px-1 py-0.5 leading-relaxed text-muted focus:border-line focus:bg-surface"
                          />
                        </td>
                        <td className="px-1 py-1">
                          <button
                            type="button"
                            className="text-muted hover:text-danger"
                            onClick={() => setRows((prev) => prev.filter((_, idx) => idx !== i))}
                            aria-label="删除"
                          >
                            <Trash2 size={12} />
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

        <aside className="space-y-3">
          <div className="rounded-xl border border-line bg-surface-2/30 p-3">
            <label className="label" htmlFor="sentence-category">
              归类
            </label>
            <select
              id="sentence-category"
              className="field !py-1.5 !text-xs"
              value={category}
              onChange={(e) => {
                setCategory(e.target.value)
                if (e.target.value === 'custom') setSource('我的句子')
              }}
            >
              {CATEGORIES.map((c) => (
                <option key={c.value} value={c.value}>
                  {c.label}
                </option>
              ))}
            </select>
            <label className="label mt-3" htmlFor="sentence-level">
              级别
            </label>
            <select
              id="sentence-level"
              className="field !py-1.5 !text-xs"
              value={level}
              onChange={(e) => setLevel(e.target.value)}
            >
              <option value="all">不限</option>
              <option value="cet4">四级</option>
              <option value="cet6">六级</option>
            </select>
            <label className="label mt-3" htmlFor="sentence-source">
              来源
            </label>
            <input
              id="sentence-source"
              className="field !py-1.5 !text-xs"
              value={source}
              onChange={(e) => setSource(e.target.value)}
              placeholder="我的句子"
            />
          </div>

          <div className="rounded-xl border border-line p-3 text-[10px] leading-relaxed text-muted">
            <p className="font-medium text-ink-soft">配对规则</p>
            <p className="mt-1">· 一行英文一行中文，会自动合并成一条。</p>
            <p>· 用 Tab、| 或破折号分隔的英中对照也可以。</p>
            <p>· 纯英文按句号/问号/感叹号拆句。</p>
            <p>· 图片 OCR 只识别英文，中文留空后再补。</p>
            <p>· 导入的句子可以在详情里继续编辑或删除。</p>
          </div>
        </aside>
      </div>
    </Modal>
  )
}
