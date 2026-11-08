import { clsx, type ClassValue } from 'clsx'

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs)
}

export function formatMinutes(ms: number) {
  const minutes = Math.round(ms / 60000)
  if (minutes < 1) return '<1 分钟'
  if (minutes < 60) return `${minutes} 分钟`
  const h = Math.floor(minutes / 60)
  const m = minutes % 60
  return m ? `${h} 小时 ${m} 分钟` : `${h} 小时`
}

export function formatDuration(ms: number) {
  const total = Math.max(0, Math.round(ms / 1000))
  const m = Math.floor(total / 60)
  const s = total % 60
  return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`
}

export function levelLabel(level: string) {
  if (level === 'cet4') return '四级'
  if (level === 'cet6') return '六级'
  return '不限'
}

export function wordStateLabel(state: string) {
  switch (state) {
    case 'learning':
      return '学习中'
    case 'review':
      return '待复习'
    case 'mastered':
      return '已掌握'
    default:
      return '新词'
  }
}

export function essayTypeLabel(type: string) {
  const map: Record<string, string> = {
    argument: '议论文',
    chart: '图表作文',
    letter: '书信',
    speech: '演讲',
    notice: '通知',
    review: '评论',
  }
  return map[type] || type
}

export function categoryLabel(category: string) {
  const map: Record<string, string> = {
    writing: '写作句型',
    motivational: '励志名言',
    literature: '名著摘抄',
    exam: '高频表达',
    custom: '我的句子',
  }
  return map[category] || category
}

export function subcategoryLabel(sub: string) {
  const map: Record<string, string> = {
    opening: '开头',
    transition: '过渡',
    argument: '论证',
    chart: '图表',
    ending: '结尾',
    quote: '名言',
    classic: '经典',
    expression: '表达',
    user: '自定义',
  }
  return map[sub] || sub
}

export function relativeDue(dueAt: string | null) {
  if (!dueAt) return '—'
  const diff = new Date(dueAt).getTime() - Date.now()
  if (diff <= 0) return '已到期'
  const minutes = diff / 60000
  if (minutes < 60) return `${Math.round(minutes)} 分钟后`
  const hours = minutes / 60
  if (hours < 24) return `${Math.round(hours)} 小时后`
  const days = hours / 24
  if (days < 30) return `${Math.round(days)} 天后`
  return new Date(dueAt).toLocaleDateString('zh-CN', { month: 'short', day: 'numeric' })
}

export function dateLabel(input: string | Date) {
  const d = typeof input === 'string' ? new Date(input) : input
  return d.toLocaleDateString('zh-CN', { month: 'long', day: 'numeric', weekday: 'long' })
}

export function todayLabel() {
  return dateLabel(new Date())
}

export function greeting() {
  const h = new Date().getHours()
  if (h < 6) return '夜深了'
  if (h < 11) return '早上好'
  if (h < 14) return '中午好'
  if (h < 18) return '下午好'
  return '晚上好'
}

export function wordCount(text: string) {
  const cleaned = text.replace(/[^\p{L}\p{N}'’-]+/gu, ' ').trim()
  if (!cleaned) return 0
  return cleaned.split(/\s+/).length
}

export function shuffle<T>(arr: T[]): T[] {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1))
    ;[a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

export function firstLine(text: string, max = 90) {
  const line = String(text || '').split('\n')[0]
  return line.length > max ? `${line.slice(0, max)}…` : line
}

export function sentenceByline(sentence: { author?: string; source?: string; category?: string }) {
  const author = (sentence.author || '').trim()
  const source = (sentence.source || '').trim()
  if (sentence.category === 'custom') return source || '我的句子'
  if (author) return source && source !== author ? `${author} · ${source}` : author
  if (sentence.category === 'exam' && source) return source
  if (source && source !== '自撰') return `自撰 · ${source}`
  return '自撰'
}

export function pct(part: number, total: number) {
  if (!total) return 0
  return Math.round((part / total) * 100)
}

export function clamp(n: number, min: number, max: number) {
  return Math.min(max, Math.max(min, n))
}

export const BOOK_COLORS: Record<string, string> = {
  forest: 'var(--c-forest)',
  amber: 'var(--c-amber)',
  ink: 'var(--c-ink)',
  danger: 'var(--c-danger)',
  plum: '#7a4d6d',
  sky: '#3f6f86',
}
