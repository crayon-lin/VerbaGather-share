import { api } from '@/lib/api'

interface LegacyDraft {
  content?: string
  checks?: boolean[]
  seconds?: number
  savedAt?: string
}

export async function migrateLegacyEssayDrafts() {
  let keys: string[] = []
  try {
    keys = Object.keys(window.localStorage).filter((key) => key.startsWith('inkling-draft-'))
  } catch {
    return 0
  }
  let migrated = 0
  for (const key of keys) {
    const essayId = key.slice('inkling-draft-'.length)
    if (!essayId) continue
    try {
      const raw = window.localStorage.getItem(key)
      if (!raw) continue
      const draft = JSON.parse(raw) as LegacyDraft
      if (!draft?.content?.trim()) {
        window.localStorage.removeItem(key)
        continue
      }
      await api.saveEssayDraft(essayId, {
        content: draft.content,
        checks: Array.isArray(draft.checks) ? draft.checks.map(Boolean) : [],
        seconds: Number(draft.seconds) || 0,
        savedAt: draft.savedAt,
      })
      window.localStorage.removeItem(key)
      migrated += 1
    } catch {
      /* 单篇迁移失败时保留原草稿，下次再试 */
    }
  }
  return migrated
}

export async function migrateLegacyPaperStorage() {
  const key = 'inkling-custom-papers'
  let raw = ''
  try {
    raw = window.localStorage.getItem(key) || ''
  } catch {
    return 0
  }
  if (!raw) return 0
  try {
    const rows = JSON.parse(raw)
    if (!Array.isArray(rows) || !rows.length) {
      window.localStorage.removeItem(key)
      return 0
    }
    const papers = rows
      .filter((item) => item && typeof item === 'object' && Array.isArray(item.questions))
      .map((item) => ({
        title: String(item.title || '导入真题'),
        level: item.level === 'cet6' ? ('cet6' as const) : ('cet4' as const),
        writingPrompt: String(item.writingPrompt || ''),
        questions: item.questions,
      }))
    if (!papers.length) {
      window.localStorage.removeItem(key)
      return 0
    }
    const result = await api.importPapers(papers)
    window.localStorage.removeItem(key)
    return result.created
  } catch {
    return 0
  }
}
