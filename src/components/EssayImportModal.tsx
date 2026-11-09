import { useRef, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { ClipboardPaste, FileJson, Loader2, Trash2, Upload } from 'lucide-react'
import { api } from '@/lib/api'
import { useSettings } from '@/lib/hooks'
import { docxToText, pdfToText } from '@/lib/importers'
import { Modal } from '@/components/Modal'
import { toast } from '@/store/ui'
import { cn, wordCount } from '@/lib/utils'

interface ImportedEssay {
  key: string
  title_en: string
  title_cn: string
  prompt_cn: string
  prompt_en: string
  type: string
  level: 'cet4' | 'cet6'
  paragraphs: Array<{ en: string; cn: string; role: string }>
  outline: unknown[]
  highlights: unknown[]
  tips: string[]
}

const EXAMPLE = `[
  {
    "title_en": "My View on Online Learning",
    "title_cn": "我对线上学习的看法",
    "prompt_cn": "写一篇短文，谈谈线上学习的利与弊。",
    "type": "argument",
    "level": "cet4",
    "paragraphs": [
      { "en": "Online learning has become ...", "cn": "线上学习已经……" },
      { "en": "However, it also has ...", "cn": "然而，它也有……" }
    ],
    "tips": ["结构清楚", "注意衔接"]
  }
]`

function parseEssays(text: string, fallbackLevel: 'cet4' | 'cet6'): ImportedEssay[] {
  const payload = JSON.parse(text)
  const list = Array.isArray(payload) ? payload : Array.isArray(payload?.essays) ? payload.essays : [payload]
  const out: ImportedEssay[] = []
  for (const raw of list) {
    if (!raw || typeof raw !== 'object') continue
    const titleEn = String(raw.title_en || raw.titleEn || raw.title || '').trim()
    const titleCn = String(raw.title_cn || raw.titleCn || titleEn).trim()
    const paragraphsRaw = Array.isArray(raw.paragraphs) ? raw.paragraphs : []
    const paragraphs = paragraphsRaw
      .map((paragraph: unknown) => {
        if (typeof paragraph === 'string') return { en: paragraph.trim(), cn: '', role: '' }
        if (!paragraph || typeof paragraph !== 'object') return null
        const item = paragraph as { en?: string; text?: string; cn?: string; role?: string }
        return {
          en: String(item.en || item.text || '').trim(),
          cn: String(item.cn || '').trim(),
          role: String(item.role || '').trim(),
        }
      })
      .filter(
        (paragraph: { en: string; cn: string; role: string } | null): paragraph is { en: string; cn: string; role: string } =>
          Boolean(paragraph?.en),
      )
    if (!titleEn || !paragraphs.length) continue
    const level = raw.level === 'cet6' ? 'cet6' : raw.level === 'cet4' ? 'cet4' : fallbackLevel
    out.push({
      key: `${Date.now()}-${out.length}-${titleEn.slice(0, 12)}`,
      title_en: titleEn,
      title_cn: titleCn || titleEn,
      prompt_cn: String(raw.prompt_cn || raw.prompt || '').trim(),
      prompt_en: String(raw.prompt_en || '').trim(),
      type: String(raw.type || 'argument').trim() || 'argument',
      level,
      paragraphs,
      outline: Array.isArray(raw.outline) ? raw.outline : [],
      highlights: Array.isArray(raw.highlights) ? raw.highlights : [],
      tips: Array.isArray(raw.tips) ? raw.tips.map((tip: unknown) => String(tip)).filter(Boolean) : [],
    })
  }
  return out
}

function parsePlainEssays(text: string, fallbackLevel: 'cet4' | 'cet6'): ImportedEssay[] {
  const chunks = String(text)
    .split(/\n\s*---+\s*\n/g)
    .map((chunk) => chunk.trim())
    .filter(Boolean)
  const out: ImportedEssay[] = []
  for (const chunk of chunks) {
    const lines = chunk.split(/\r?\n/).map((line) => line.trim())
    const titleLine = lines.find(Boolean)
    if (!titleLine) continue
    const title = titleLine.replace(/^#{1,6}\s*/, '').replace(/^title\s*[:：]\s*/i, '').trim()
    const start = lines.indexOf(titleLine) + 1
    const bodyLines = lines.slice(start)
    const paragraphs: Array<{ en: string; cn: string; role: string }> = []
    let buffer: string[] = []
    const flush = () => {
      const text = buffer.join(' ').replace(/\s+/g, ' ').trim()
      buffer = []
      if (text.length >= 3) paragraphs.push({ en: text, cn: '', role: '' })
    }
    for (const line of bodyLines) {
      if (!line) {
        flush()
        continue
      }
      if (/^#{1,6}\s/.test(line) && buffer.length) flush()
      buffer.push(line.replace(/^#{1,6}\s*/, ''))
    }
    flush()
    if (!title || !paragraphs.length) continue
    out.push({
      key: `${Date.now()}-${out.length}-${title.slice(0, 12)}`,
      title_en: title,
      title_cn: title,
      prompt_cn: '',
      prompt_en: '',
      type: 'argument',
      level: fallbackLevel,
      paragraphs,
      outline: [],
      highlights: [],
      tips: [],
    })
  }
  return out
}

export function EssayImportModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { settings } = useSettings()
  const queryClient = useQueryClient()
  const [tab, setTab] = useState<'paste' | 'file'>('paste')
  const [text, setText] = useState('')
  const [rows, setRows] = useState<ImportedEssay[]>([])
  const fileRef = useRef<HTMLInputElement>(null)

  const addText = () => {
    try {
      const parsed = parseEssays(text, settings.level === 'cet6' ? 'cet6' : 'cet4')
      if (!parsed.length) {
        toast('没有解析到可用作文，请检查 title_en 和 paragraphs', 'error')
        return
      }
      setRows((prev) => [...prev, ...parsed])
      setText('')
      toast(`识别到 ${parsed.length} 篇作文，确认后导入`)
    } catch (err) {
      toast(`JSON 解析失败：${(err as Error).message}`, 'error')
    }
  }

  const handleFile = async (file: File) => {
    try {
      const name = file.name.toLowerCase()
      let parsed: ImportedEssay[] = []
      if (name.endsWith('.json')) {
        parsed = parseEssays(await file.text(), settings.level === 'cet6' ? 'cet6' : 'cet4')
      } else if (name.endsWith('.pdf')) {
        parsed = parsePlainEssays(
          await pdfToText(file),
          settings.level === 'cet6' ? 'cet6' : 'cet4',
        )
      } else if (name.endsWith('.docx') || name.endsWith('.doc')) {
        parsed = parsePlainEssays(
          await docxToText(file),
          settings.level === 'cet6' ? 'cet6' : 'cet4',
        )
      } else {
        parsed = parsePlainEssays(await file.text(), settings.level === 'cet6' ? 'cet6' : 'cet4')
      }
      if (!parsed.length) {
        toast('文件里没有可用的作文', 'error')
        return
      }
      setRows((prev) => [...prev, ...parsed])
      toast(`识别到 ${parsed.length} 篇作文`)
    } catch (err) {
      toast(`读取失败：${(err as Error).message}`, 'error')
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }

  const save = useMutation({
    mutationFn: () =>
      api.importEssays(
        rows.map((row) => ({
          title_en: row.title_en,
          title_cn: row.title_cn,
          prompt_cn: row.prompt_cn,
          prompt_en: row.prompt_en,
          type: row.type,
          level: row.level,
          paragraphs: row.paragraphs,
          outline: row.outline,
          highlights: row.highlights,
          tips: row.tips,
        })),
      ),
    onSuccess: (res) => {
      toast(`已导入 ${res.created} 篇作文`)
      queryClient.invalidateQueries({ queryKey: ['essays'] })
      queryClient.invalidateQueries({ queryKey: ['favorites'] })
      setRows([])
      setText('')
      onClose()
    },
    onError: (err: Error) => toast(err.message, 'error'),
  })

  return (
    <Modal
      open={open}
      onClose={() => {
        if (!save.isPending) onClose()
      }}
      title="导入作文"
      size="xl"
      footer={
        <div className="flex flex-wrap items-center justify-between gap-3">
          <span className="text-[11px] text-muted">已识别 {rows.length} 篇 · 支持 JSON 数组</span>
          <div className="flex gap-2">
            <button type="button" className="btn btn-ghost" onClick={onClose} disabled={save.isPending}>
              取消
            </button>
            <button
              type="button"
              className="btn btn-primary"
              disabled={!rows.length || save.isPending}
              onClick={() => save.mutate()}
            >
              {save.isPending ? <Loader2 size={14} className="animate-spin" /> : <Upload size={14} />}
              导入 {rows.length} 篇
            </button>
          </div>
        </div>
      }
    >
      <div className="grid gap-4 p-5 lg:grid-cols-[1.05fr_1fr]">
        <div className="min-w-0">
          <div className="flex gap-1.5">
            {[
              { value: 'paste' as const, label: '粘贴 JSON', icon: ClipboardPaste },
              { value: 'file' as const, label: '选择文件', icon: FileJson },
            ].map((item) => {
              const Icon = item.icon
              return (
                <button
                  key={item.value}
                  type="button"
                  onClick={() => setTab(item.value)}
                  className={cn(
                    'inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1.5 text-[11px]',
                    tab === item.value ? 'bg-forest-soft text-forest' : 'text-muted hover:bg-surface-2',
                  )}
                >
                  <Icon size={13} />
                  {item.label}
                </button>
              )
            })}
          </div>
          {tab === 'paste' ? (
            <>
              <textarea
                value={text}
                onChange={(event) => setText(event.target.value)}
                placeholder={EXAMPLE}
                className="mt-3 min-h-[340px] w-full resize-y rounded-xl border border-line bg-surface p-3 font-mono text-[11px] leading-relaxed text-ink outline-none focus:border-forest"
              />
              <button type="button" className="btn btn-soft mt-2 !py-1.5 !text-xs" onClick={addText} disabled={!text.trim()}>
                解析内容
              </button>
            </>
          ) : (
            <div className="mt-3 rounded-xl border border-dashed border-line p-6 text-center">
              <FileJson size={26} className="mx-auto text-muted" />
              <p className="mt-2 text-[11px] text-muted">支持 JSON / TXT / Markdown / PDF / Word；标题为第一行，空行分段，多篇用 --- 分隔</p>
              <button type="button" className="btn btn-soft mt-3 !py-1.5 !text-xs" onClick={() => fileRef.current?.click()}>
                选择文件
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json,.txt,.md,.pdf,.docx,.doc"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0]
                  if (file) void handleFile(file)
                }}
              />
            </div>
          )}
        </div>

        <div className="min-w-0 rounded-xl border border-line bg-surface-2/30 p-3">
          <p className="eyebrow mb-2">待导入</p>
          {rows.length ? (
            <div className="max-h-[390px] space-y-2 overflow-y-auto">
              {rows.map((row) => (
                <div key={row.key} className="flex items-start gap-2 rounded-lg bg-surface p-2.5">
                  <div className="min-w-0 flex-1">
                    <div className="truncate text-[12px] font-medium">{row.title_cn}</div>
                    <div className="truncate text-[10px] text-muted">{row.title_en}</div>
                    <div className="mt-1 text-[9px] text-muted">
                      {row.level.toUpperCase()} · {wordCount(row.paragraphs.map((p) => p.en).join(' '))} 词 · {row.paragraphs.length} 段
                    </div>
                  </div>
                  <button
                    type="button"
                    className="grid h-6 w-6 place-items-center rounded-full text-muted hover:bg-surface-2 hover:text-danger"
                    onClick={() => setRows((prev) => prev.filter((item) => item.key !== row.key))}
                    aria-label="移除"
                  >
                    <Trash2 size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : (
            <p className="py-10 text-center text-[11px] leading-relaxed text-muted">
              粘贴 JSON 或选择文件后，
              <br />
              这里会显示待导入的作文。
            </p>
          )}
        </div>
      </div>
    </Modal>
  )
}
