import { useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import {
  Database,
  Download,
  ImagePlus,
  Info,
  Keyboard,
  Languages,
  Laptop,
  Moon,
  Palette,
  PenLine,
  RotateCcw,
  Search,
  Sun,
  Trash2,
  Upload,
  Volume2,
} from 'lucide-react'
import type { Settings as SettingsType } from '@shared/types'
import { api, downloadBackup, importBackup } from '@/lib/api'
import { fileToBackgroundDataUrl } from '@/lib/backgroundImage'
import { useSettings, useUpdateSettings } from '@/lib/hooks'
import { PageHeader } from '@/components/PageHeader'
import { currentVoiceLabel, speak, speechSupported } from '@/lib/tts'
import { shortcutFromEvent, shortcutLabel } from '@/lib/shortcuts'
import { toast } from '@/store/ui'
import { cn } from '@/lib/utils'

type ShortcutField =
  | 'shortcutSearch'
  | 'shortcutFocus'
  | 'shortcutReveal'
  | 'shortcutNext'
  | 'shortcutSpeak'
  | 'shortcutOption1'
  | 'shortcutOption2'
  | 'shortcutOption3'
  | 'shortcutOption4'

export default function Settings() {
  const { settings } = useSettings()
  const update = useUpdateSettings()
  const queryClient = useQueryClient()
  const health = useQuery({ queryKey: ['health'], queryFn: api.health, staleTime: 60_000 })
  const books = useQuery({ queryKey: ['books'], queryFn: api.books, staleTime: 60_000 })
  const fileRef = useRef<HTMLInputElement>(null)
  const bgRef = useRef<HTMLInputElement>(null)
  const [importing, setImporting] = useState(false)
  const [bgBusy, setBgBusy] = useState(false)
  const [bgOpacityDraft, setBgOpacityDraft] = useState<number | null>(null)
  const [capturing, setCapturing] = useState<ShortcutField | null>(null)

  const set = (patch: Partial<SettingsType>) => update.mutate(patch)

  useEffect(() => {
    if (!capturing) return
    const onKey = (event: KeyboardEvent) => {
      event.preventDefault()
      event.stopPropagation()
      if (event.key === 'Escape' && !event.ctrlKey && !event.metaKey && !event.altKey) {
        setCapturing(null)
        return
      }
      if (event.repeat) return
      const value = shortcutFromEvent(event)
      if (!value) return
      update.mutate({ [capturing]: value } as Partial<SettingsType>)
      setCapturing(null)
    }
    window.addEventListener('keydown', onKey, true)
    return () => window.removeEventListener('keydown', onKey, true)
  }, [capturing, update])

  const handleBackgroundFile = async (file: File) => {
    setBgBusy(true)
    try {
      const bgImage = await fileToBackgroundDataUrl(file)
      update.mutate(
        { bgImage },
        {
          onSuccess: () => toast('背景图片已保存'),
          onError: (err: Error) => toast(err.message, 'error'),
        },
      )
      setBgOpacityDraft(null)
    } catch (err) {
      toast((err as Error).message, 'error')
    } finally {
      setBgBusy(false)
    }
  }

  const commitOpacity = (value?: number) => {
    const next = value ?? bgOpacityDraft
    setBgOpacityDraft(null)
    if (next === null || next === undefined) return
    if (Math.abs(next - settings.bgOpacity) < 0.001) return
    set({ bgOpacity: next })
  }

  const opacity = bgOpacityDraft ?? settings.bgOpacity

  const shortcutButton = (field: ShortcutField) => (
    <button
      type="button"
      onClick={() => setCapturing(field)}
      className={cn(
        'min-w-11 rounded-lg border px-2.5 py-1.5 font-mono text-[11px] transition-colors',
        capturing === field
          ? 'border-forest bg-forest-soft text-forest'
          : 'border-line bg-surface text-ink-soft hover:border-line-strong hover:text-ink',
      )}
    >
      {capturing === field ? '按下新键…' : shortcutLabel(settings[field])}
    </button>
  )

  return (
    <div className="mx-auto max-w-4xl">
      <PageHeader
        eyebrow="Preferences"
        title="设置"
        description="学习节奏、发音与外观都会自动保存；数据全部留在本机。"
        actions={
          <span className="text-[10px] text-muted">{update.isPending ? '保存中…' : '已自动保存'}</span>
        }
      />

      <div className="space-y-4">
        <section className="card p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-forest-soft text-forest">
              <Database size={15} />
            </span>
            <div>
              <h2 className="serif text-lg leading-none">学习节奏</h2>
              <p className="mt-1 text-[10px] text-muted">新词和复习的量，按你的时间调整</p>
            </div>
          </div>
          <div className="divide-y divide-line">
            <Row label="当前级别" desc="影响首页任务、词书、句子与作文的默认筛选">
              <select
                className="field !w-32 !py-1.5 !text-xs"
                value={settings.level}
                onChange={(e) => set({ level: e.target.value as SettingsType['level'] })}
              >
                <option value="cet4">CET-4</option>
                <option value="cet6">CET-6</option>
                <option value="all">全部</option>
              </select>
            </Row>
            <Row
              label="默认生词本"
              desc="点词收词、学习时标“不认识/模糊”会自动进入这里；可以自建多本词书，随时切换"
            >
              <div className="flex items-center gap-2">
                <select
                  className="field !w-36 !py-1.5 !text-xs"
                  value={settings.defaultBookId}
                  onChange={(e) => set({ defaultBookId: e.target.value })}
                >
                  {(books.data?.items ?? [])
                    .filter((b) => b.kind !== 'system' && b.kind !== 'mistakes')
                    .map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.name}
                      </option>
                    ))}
                </select>
                <Link to="/words" className="whitespace-nowrap text-[10px] text-forest hover:underline">
                  管理
                </Link>
              </div>
            </Row>
            <Row label="每日新词" desc="学完即停，避免一次塞太多">
              <select
                className="field !w-24 !py-1.5 !text-xs"
                value={settings.dailyNew}
                onChange={(e) => set({ dailyNew: Number(e.target.value) })}
              >
                {[10, 15, 20, 30, 50, 100, 150, 200].map((n) => (
                  <option key={n} value={n}>
                    {n} 个
                  </option>
                ))}
              </select>
            </Row>
            <Row label="每日复习上限" desc="到期队列的上限，通常不需要改">
              <select
                className="field !w-28 !py-1.5 !text-xs"
                value={settings.dailyReview}
                onChange={(e) => set({ dailyReview: Number(e.target.value) })}
              >
                {[50, 100, 200, 300, 500].map((n) => (
                  <option key={n} value={n}>
                    {n} 个
                  </option>
                ))}
              </select>
            </Row>
            <Row label="显示“太简单”评分" desc="复习时可直接把词跳到更远的间隔">
              <Toggle checked={settings.easyRating} onChange={(v) => set({ easyRating: v })} />
            </Row>
          </div>
        </section>

        <section className="card p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-amber-soft text-amber">
              <Volume2 size={15} />
            </span>
            <div>
              <h2 className="serif text-lg leading-none">朗读</h2>
              <p className="mt-1 text-[10px] text-muted">
                使用浏览器内置语音，不联网也能发音；音色取决于系统
              </p>
            </div>
          </div>
          <div className="divide-y divide-line">
            <Row label="发音口音" desc={`当前音色：${currentVoiceLabel(settings.ttsAccent)}`}>
              <select
                className="field !w-28 !py-1.5 !text-xs"
                value={settings.ttsAccent}
                onChange={(e) => set({ ttsAccent: e.target.value as SettingsType['ttsAccent'] })}
              >
                <option value="en-US">美式</option>
                <option value="en-GB">英式</option>
              </select>
            </Row>
            <Row label="语速" desc="0.6× 慢速精听，1.2× 快速泛听">
              <div className="flex items-center gap-2">
                <input
                  type="range"
                  min={0.6}
                  max={1.3}
                  step={0.05}
                  value={settings.ttsRate}
                  onChange={(e) => set({ ttsRate: Number(e.target.value) })}
                  className="w-28 accent-[var(--c-forest)]"
                />
                <span className="w-8 text-right font-mono text-[10px] text-muted">
                  {settings.ttsRate.toFixed(2)}×
                </span>
              </div>
            </Row>
            <Row label="卡片自动发音" desc="进入新词/复习卡片时自动读一遍">
              <Toggle checked={settings.autoSpeak} onChange={(v) => set({ autoSpeak: v })} />
            </Row>
            <Row label="小测提示音" desc="默认关闭；开启后小测答对/答错会播放不同提示音">
              <Toggle checked={settings.quizSound} onChange={(v) => set({ quizSound: v })} />
            </Row>
            <Row label="试听" desc="听一句示例，确认系统语音是否可用">
              <button
                type="button"
                className="btn btn-ghost !py-1.5 !text-xs"
                onClick={() => {
                  if (!speechSupported()) {
                    toast('当前浏览器不支持语音朗读', 'error')
                    return
                  }
                  speak('Reading is a quiet way to travel.', {
                    accent: settings.ttsAccent,
                    rate: settings.ttsRate,
                  })
                }}
              >
                播放示例
              </button>
            </Row>
          </div>
        </section>

        <section className="card p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-ink-soft">
              <Keyboard size={15} />
            </span>
            <div>
              <h2 className="serif text-lg leading-none">快捷键</h2>
              <p className="mt-1 text-[10px] text-muted">
                点击右侧按键后按下新键；Esc 取消。搜索与专注支持 Ctrl / ⌘ 组合键
              </p>
            </div>
          </div>
          <div className="divide-y divide-line">
            <Row label="搜索" desc="打开全局搜索；可直接录制组合键">
              {shortcutButton('shortcutSearch')}
            </Row>
            <Row label="专注模式" desc="隐藏侧栏、顶栏和其他菜单；再按一次或 Esc 退出">
              {shortcutButton('shortcutFocus')}
            </Row>
            <Row label="显示答案" desc="新学卡片翻面；小测中不会跳过作答">
              {shortcutButton('shortcutReveal')}
            </Row>
            <Row label="下一题" desc="学习卡片已显示答案后进入下一题；小测需先作答">
              {shortcutButton('shortcutNext')}
            </Row>
            <Row label="再读一次" desc="朗读当前单词；例句填空时朗读整个句子">
              {shortcutButton('shortcutSpeak')}
            </Row>
            <Row label="选项 A / B / C / D" desc="用于新学选义和复习、小测答题">
              <div className="grid grid-cols-4 gap-1.5">
                {shortcutButton('shortcutOption1')}
                {shortcutButton('shortcutOption2')}
                {shortcutButton('shortcutOption3')}
                {shortcutButton('shortcutOption4')}
              </div>
            </Row>
          </div>
        </section>

        <section className="card p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-ink-soft">
              <Palette size={15} />
            </span>
            <div>
              <h2 className="serif text-lg leading-none">外观</h2>
              <p className="mt-1 text-[10px] text-muted">纸张感、深色模式与自定义背景</p>
            </div>
          </div>
          <Row label="主题" desc="跟随系统时随操作系统自动切换">
            <div className="flex gap-1.5">
              {[
                { value: 'light', label: '浅色', icon: Sun },
                { value: 'dark', label: '深色', icon: Moon },
                { value: 'system', label: '自动', icon: Laptop },
              ].map((t) => {
                const Icon = t.icon
                return (
                  <button
                    key={t.value}
                    type="button"
                    onClick={() => set({ theme: t.value as SettingsType['theme'] })}
                    className={cn(
                      'inline-flex items-center gap-1 rounded-full border px-2.5 py-1.5 text-[11px]',
                      settings.theme === t.value
                        ? 'border-forest bg-forest-soft text-forest'
                        : 'border-line text-muted hover:text-ink',
                    )}
                  >
                    <Icon size={12} />
                    {t.label}
                  </button>
                )
              })}
            </div>
          </Row>
          <Row label="背景图片" desc="从本机选一张图片，会自动压缩；只保存在本机数据库与备份里">
            <div className="flex items-center gap-1.5">
              {settings.bgImage && (
                <img
                  src={settings.bgImage}
                  alt="当前背景预览"
                  className="hidden h-8 w-12 rounded-md border border-line object-cover sm:block"
                />
              )}
              <button
                type="button"
                className="btn btn-ghost !py-1.5 !text-xs"
                disabled={bgBusy}
                onClick={() => bgRef.current?.click()}
              >
                <ImagePlus size={13} />
                {bgBusy ? '处理中…' : settings.bgImage ? '更换' : '选择图片'}
              </button>
              {settings.bgImage && (
                <button
                  type="button"
                  className="btn btn-ghost !px-2 !py-1.5 !text-xs !text-danger"
                  aria-label="移除背景图片"
                  title="移除背景图片"
                  onClick={() => {
                    update.mutate(
                      { bgImage: '' },
                      { onSuccess: () => toast('已移除背景图片') },
                    )
                    setBgOpacityDraft(null)
                  }}
                >
                  <Trash2 size={13} />
                </button>
              )}
              <input
                ref={bgRef}
                type="file"
                accept="image/*"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  e.target.value = ''
                  if (file) await handleBackgroundFile(file)
                }}
              />
            </div>
          </Row>
          <Row label="背景不透明度" desc="0% 完全隐藏，100% 显示原图；松开滑块后保存">
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                step={1}
                value={Math.round(opacity * 100)}
                disabled={!settings.bgImage}
                aria-label="背景不透明度"
                onChange={(e) => setBgOpacityDraft(Number(e.target.value) / 100)}
                onPointerUp={(e) =>
                  commitOpacity(Number((e.currentTarget as HTMLInputElement).value) / 100)
                }
                onKeyUp={(e) =>
                  commitOpacity(Number((e.currentTarget as HTMLInputElement).value) / 100)
                }
                onBlur={(e) =>
                  commitOpacity(Number((e.currentTarget as HTMLInputElement).value) / 100)
                }
                className="w-28 accent-[var(--c-forest)]"
              />
              <span className="w-9 text-right font-mono text-[10px] text-muted">
                {Math.round(opacity * 100)}%
              </span>
            </div>
          </Row>
        </section>

        <section className="card p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-ink-soft">
              <Info size={15} />
            </span>
            <div>
              <h2 className="serif text-lg leading-none">AI 出题</h2>
              <p className="mt-1 text-[10px] text-muted">
                在小测页用模型实时生成题目；调用失败会自动回退到本地题库
              </p>
            </div>
          </div>
          <div className="divide-y divide-line">
            <Row label="启用 AI" desc="默认关闭；关闭时小测使用本地题库，不消耗 token">
              <Toggle checked={settings.aiEnabled} onChange={(v) => set({ aiEnabled: v })} />
            </Row>
            <div className={cn('space-y-3 pt-4', !settings.aiEnabled && 'pointer-events-none opacity-50')}>
              <div>
                <label className="label" htmlFor="ai-base">
                  Base URL（OpenAI 兼容）
                </label>
                <input
                  id="ai-base"
                  className="field"
                  placeholder="https://api.deepseek.com/v1"
                  value={settings.aiBaseUrl}
                  onChange={(e) => set({ aiBaseUrl: e.target.value })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="ai-model">
                    模型
                  </label>
                  <input
                    id="ai-model"
                    className="field"
                    placeholder="deepseek-chat"
                    value={settings.aiModel}
                    onChange={(e) => set({ aiModel: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="ai-key">
                    API Key
                  </label>
                  <input
                    id="ai-key"
                    type="password"
                    className="field"
                    placeholder="仅保存在本机数据库"
                    value={settings.aiApiKey}
                    onChange={(e) => set({ aiApiKey: e.target.value })}
                  />
                </div>
              </div>
              <p className="text-[10px] leading-relaxed text-muted">
                生成结果会累计到对应词书的做题本，并同步进入总题库；再次出题不会重复建本。
                也可以去 <Link to="/words/quiz" className="text-forest hover:underline">小测页</Link> 立即试一次。
              </p>
            </div>
          </div>
        </section>

        <section className="card p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-forest-soft text-forest">
              <Languages size={15} />
            </span>
            <div>
              <h2 className="serif text-lg leading-none">AI 翻译</h2>
              <p className="mt-1 text-[10px] text-muted">
                任意页面选中单词或句子 → 点「AI 翻译」；与 AI 出题使用独立的模型配置
              </p>
            </div>
          </div>
          <div className="divide-y divide-line">
            <Row label="启用 AI 翻译" desc="选中文字后显示翻译入口；关闭时不会调用翻译模型">
              <Toggle
                checked={settings.translateAiEnabled}
                onChange={(v) => set({ translateAiEnabled: v })}
              />
            </Row>
            <div
              className={cn(
                'space-y-3 pt-4',
                !settings.translateAiEnabled && 'pointer-events-none opacity-50',
              )}
            >
              <div>
                <label className="label" htmlFor="translate-ai-base">
                  Base URL（OpenAI 兼容）
                </label>
                <input
                  id="translate-ai-base"
                  className="field"
                  placeholder="https://api.deepseek.com/v1"
                  value={settings.translateAiBaseUrl}
                  onChange={(e) => set({ translateAiBaseUrl: e.target.value })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="translate-ai-model">
                    模型
                  </label>
                  <input
                    id="translate-ai-model"
                    className="field"
                    placeholder="deepseek-chat"
                    value={settings.translateAiModel}
                    onChange={(e) => set({ translateAiModel: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="translate-ai-key">
                    API Key
                  </label>
                  <input
                    id="translate-ai-key"
                    type="password"
                    className="field"
                    placeholder="仅保存在本机数据库"
                    value={settings.translateAiApiKey}
                    onChange={(e) => set({ translateAiApiKey: e.target.value })}
                  />
                </div>
              </div>
              <p className="text-[10px] leading-relaxed text-muted">
                选中的文字会发送到上面这个模型进行翻译；追问也在右侧对话栏中完成。翻译模型与「AI
                出题」的 Base URL、模型、Key 完全分开。
              </p>
            </div>
          </div>
        </section>

        <section className="card p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-ink-soft">
              <Search size={15} />
            </span>
            <div>
              <h2 className="serif text-lg leading-none">AI 搜索</h2>
              <p className="mt-1 text-[10px] text-muted">
                在搜索框里选择 AI 搜索，用独立模型回答单词、语法与写作问题
              </p>
            </div>
          </div>
          <div className="divide-y divide-line">
            <Row label="启用 AI 搜索" desc="关闭时搜索框只使用本地词典，不调用模型">
              <Toggle
                checked={settings.searchAiEnabled}
                onChange={(v) => set({ searchAiEnabled: v })}
              />
            </Row>
            <div
              className={cn(
                'space-y-3 pt-4',
                !settings.searchAiEnabled && 'pointer-events-none opacity-50',
              )}
            >
              <div>
                <label className="label" htmlFor="search-ai-base">
                  Base URL（OpenAI 兼容）
                </label>
                <input
                  id="search-ai-base"
                  className="field"
                  placeholder="https://api.deepseek.com/v1"
                  value={settings.searchAiBaseUrl}
                  onChange={(e) => set({ searchAiBaseUrl: e.target.value })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="search-ai-model">
                    模型
                  </label>
                  <input
                    id="search-ai-model"
                    className="field"
                    placeholder="deepseek-chat"
                    value={settings.searchAiModel}
                    onChange={(e) => set({ searchAiModel: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="search-ai-key">
                    API Key
                  </label>
                  <input
                    id="search-ai-key"
                    type="password"
                    className="field"
                    placeholder="仅保存在本机数据库"
                    value={settings.searchAiApiKey}
                    onChange={(e) => set({ searchAiApiKey: e.target.value })}
                  />
                </div>
              </div>
              <p className="text-[10px] leading-relaxed text-muted">
                AI 搜索结果会参考本地词典里的相关词条，但不会写入学习进度。搜索模型与「AI
                出题」「AI 翻译」完全独立，可单独填写。
              </p>
            </div>
          </div>
        </section>

        <section className="card p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-ink-soft">
              <PenLine size={15} />
            </span>
            <div>
              <h2 className="serif text-lg leading-none">AI 作文评分</h2>
              <p className="mt-1 text-[10px] text-muted">
                写作训练完成后，用独立模型按四六级标准给分和建议
              </p>
            </div>
          </div>
          <div className="divide-y divide-line">
            <Row label="启用 AI 作文评分" desc="关闭时写作训练只保留自检清单，不调用模型">
              <Toggle checked={settings.essayAiEnabled} onChange={(v) => set({ essayAiEnabled: v })} />
            </Row>
            <div
              className={cn(
                'space-y-3 pt-4',
                !settings.essayAiEnabled && 'pointer-events-none opacity-50',
              )}
            >
              <div>
                <label className="label" htmlFor="essay-ai-base">
                  Base URL（OpenAI 兼容）
                </label>
                <input
                  id="essay-ai-base"
                  className="field"
                  placeholder="https://api.deepseek.com/v1"
                  value={settings.essayAiBaseUrl}
                  onChange={(e) => set({ essayAiBaseUrl: e.target.value })}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className="label" htmlFor="essay-ai-model">
                    模型
                  </label>
                  <input
                    id="essay-ai-model"
                    className="field"
                    placeholder="deepseek-chat"
                    value={settings.essayAiModel}
                    onChange={(e) => set({ essayAiModel: e.target.value })}
                  />
                </div>
                <div>
                  <label className="label" htmlFor="essay-ai-key">
                    API Key
                  </label>
                  <input
                    id="essay-ai-key"
                    type="password"
                    className="field"
                    placeholder="仅保存在本机数据库"
                    value={settings.essayAiApiKey}
                    onChange={(e) => set({ essayAiApiKey: e.target.value })}
                  />
                </div>
              </div>
              <p className="text-[10px] leading-relaxed text-muted">
                AI 评分是练习参考，不是官方成绩。作文模型与「AI 出题」「AI 翻译」「AI 搜索」完全独立，可单独填写。
              </p>
            </div>
          </div>
        </section>

        <section className="card p-5 sm:p-6">
          <div className="mb-4 flex items-center gap-2">
            <span className="grid h-8 w-8 place-items-center rounded-lg bg-surface-2 text-ink-soft">
              <RotateCcw size={15} />
            </span>
            <div>
              <h2 className="serif text-lg leading-none">数据</h2>
              <p className="mt-1 text-[10px] text-muted">
                数据库在本机 data/app.db；备份文件可以带走进度与自定义词书
              </p>
            </div>
          </div>
          <div className="divide-y divide-line">
            <Row
              label="导出备份"
              desc={`当前 ${health.data?.counts.words ?? '—'} 词 · ${health.data?.counts.books ?? '—'} 本词书`}
            >
              <button
                type="button"
                className="btn btn-ghost !py-1.5 !text-xs"
                onClick={() => downloadBackup().catch((e) => toast(e.message, 'error'))}
              >
                <Download size={13} />
                下载 JSON
              </button>
            </Row>
            <Row label="恢复备份" desc="会替换当前全部词书、进度与设置">
              <button
                type="button"
                className="btn btn-ghost !py-1.5 !text-xs"
                onClick={() => fileRef.current?.click()}
                disabled={importing}
              >
                <Upload size={13} />
                选择文件
              </button>
              <input
                ref={fileRef}
                type="file"
                accept="application/json,.json"
                className="hidden"
                onChange={async (e) => {
                  const file = e.target.files?.[0]
                  if (!file) return
                  if (!window.confirm('恢复备份会覆盖当前所有词书与学习进度，继续？')) {
                    e.target.value = ''
                    return
                  }
                  setImporting(true)
                  try {
                    const res = await importBackup(file)
                    toast(`已恢复：${res.counts.words} 词 · ${res.counts.books} 本词书`)
                    queryClient.invalidateQueries()
                  } catch (err) {
                    toast((err as Error).message, 'error')
                  } finally {
                    setImporting(false)
                    e.target.value = ''
                  }
                }}
              />
            </Row>
            <Row label="重置学习进度" desc="清空复习记录、正确率与热力图；词书保留">
              <button
                type="button"
                className="btn btn-ghost !py-1.5 !text-xs !text-danger"
                onClick={async () => {
                  if (!window.confirm('确定清空全部学习进度？此操作不可恢复。')) return
                  await api.resetProgress()
                  toast('学习进度已重置')
                  queryClient.invalidateQueries()
                }}
              >
                重置
              </button>
            </Row>
          </div>
        </section>

        <section className="card p-5 sm:p-6">
          <h2 className="serif text-lg">关于拾词</h2>
          <p className="mt-2 text-[12px] leading-relaxed text-muted">
            一座本地的四六级自习室：单词、句子、作文放在同一处，点词能查、句子能读、作文能对照。
            词库来自开源项目 ECDICT（MIT License），句子、作文与模板为本项目撰写；名著引文选用公版作品。
          </p>
          <div className="mt-4 grid gap-2 text-[11px] text-muted sm:grid-cols-2">
            <div className="rounded-lg bg-surface-2/50 px-3 py-2">
              快捷键：{shortcutLabel(settings.shortcutSearch)} 搜索 ·{' '}
              {shortcutLabel(settings.shortcutFocus)} 专注
            </div>
            <div className="rounded-lg bg-surface-2/50 px-3 py-2">学习卡片：空格翻面，1/2/3 评分</div>
            <div className="rounded-lg bg-surface-2/50 px-3 py-2">P：朗读当前单词</div>
            <div className="rounded-lg bg-surface-2/50 px-3 py-2">/：在任意页面快速搜索</div>
          </div>
          <p className="mt-4 text-[10px] text-muted/70">
            VerbaGather · 拾词 · v1.0 · 数据仅存储在本机，不会上传
          </p>
        </section>
      </div>
    </div>
  )
}

function Row({
  label,
  desc,
  children,
}: {
  label: string
  desc?: string
  children: React.ReactNode
}) {
  return (
    <div className="flex items-center justify-between gap-4 py-3.5 first:pt-0 last:pb-0">
      <div className="min-w-0">
        <div className="text-[12.5px]">{label}</div>
        {desc && <div className="mt-0.5 text-[10px] leading-relaxed text-muted">{desc}</div>}
      </div>
      <div className="shrink-0">{children}</div>
    </div>
  )
}

function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onChange(!checked)}
      className={cn(
        'relative inline-flex h-6 w-11 shrink-0 items-center rounded-full border transition-colors',
        checked ? 'border-forest bg-forest' : 'border-line bg-surface-2',
      )}
    >
      <span
        className={cn(
          'absolute left-0.5 top-0.5 h-4 w-4 rounded-full bg-paper shadow transition-transform',
          checked ? 'translate-x-[22px]' : 'translate-x-0',
        )}
      />
    </button>
  )
}
