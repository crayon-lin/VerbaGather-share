import type {
  AiChatMessage,
  BatchDictItem,
  Book,
  BookStat,
  BookWordsResponse,
  DictEntry,
  Essay,
  EssayDraft,
  EssayScoreResult,
  EssaySummary,
  FavoritesResponse,
  ForecastCell,
  GenerateQuizResult,
  HeatCell,
  QueueResponse,
  Question,
  QuizSet,
  QuizSetSummary,
  SearchResults,
  Sentence,
  SentenceInput,
  Settings,
  StatsOverview,
  Template,
  TrendCell,
  Word,
} from '@shared/types'

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(`/api${path}`, {
    headers: { 'Content-Type': 'application/json', ...(init?.headers || {}) },
    ...init,
  })
  if (!res.ok) {
    let message = `请求失败（${res.status}）`
    try {
      const body = await res.json()
      message = body.error || message
    } catch {
      /* ignore */
    }
    throw new Error(message)
  }
  return res.json() as Promise<T>
}

function qs(params: Record<string, string | number | boolean | undefined | null>) {
  const s = new URLSearchParams()
  for (const [k, v] of Object.entries(params)) {
    if (v !== undefined && v !== null && v !== '') s.set(k, String(v))
  }
  const out = s.toString()
  return out ? `?${out}` : ''
}

export const api = {
  health: () =>
    request<{
      ok: boolean
      counts: { words: number; books: number; sentences: number; essays: number; templates: number; dict: number; core: number }
    }>('/health'),
  settings: () => request<{ settings: Settings }>('/settings'),
  saveSettings: (patch: Partial<Settings>) =>
    request<{ settings: Settings }>('/settings', { method: 'PUT', body: JSON.stringify(patch) }),

  aiTranslate: (data: {
    text: string
    question?: string
    translation?: string
    history?: AiChatMessage[]
  }) =>
    request<{ reply: string; model: string }>('/ai/translate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  aiSearch: (data: { query: string; context?: string }) =>
    request<{ answer: string; model: string }>('/ai/search', {
      method: 'POST',
      body: JSON.stringify(data),
    }),

  books: () => request<{ items: Book[] }>('/books'),
  createBook: (data: { name: string; description?: string; level: string; color: string }) =>
    request<{ book: Book }>('/books', { method: 'POST', body: JSON.stringify(data) }),
  updateBook: (id: string, data: Partial<Book>) =>
    request<{ book: Book }>(`/books/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteBook: (id: string) => request<{ ok: boolean }>(`/books/${id}`, { method: 'DELETE' }),

  bookWords: (
    id: string,
    params: { q?: string; state?: string; sort?: string; page?: number; pageSize?: number },
  ) => request<BookWordsResponse>(`/books/${id}/words${qs(params)}`),
  word: (id: string) => request<{ word: Word; books: Array<{ id: string; name: string }> }>(`/words/${id}`),
  createWord: (data: {
    term: string
    phonetic?: string
    meaning_cn?: string
    bookId?: string
  }) => request<{ word: Word; created: boolean }>('/words', { method: 'POST', body: JSON.stringify(data) }),
  updateWord: (id: string, data: Partial<Word>) =>
    request<{ word: Word }>(`/words/${id}`, { method: 'PATCH', body: JSON.stringify(data) }),
  deleteWord: (id: string, bookId?: string) =>
    request<{ ok: boolean }>(`/words/${id}${qs({ bookId })}`, { method: 'DELETE' }),
  bulkWords: (
    bookId: string,
    words: Array<{
      term: string
      phonetic?: string
      pos?: string
      meaning_cn?: string
      meaning_en?: string
      example_en?: string
      example_cn?: string
    }>,
  ) =>
    request<{ created: number; linked: number; skipped: number; total: number }>(
      `/books/${bookId}/words/bulk`,
      { method: 'POST', body: JSON.stringify({ words }) },
    ),

  queue: (params: { mode: 'new' | 'review'; bookId?: string; limit?: number; extra?: boolean }) =>
    request<QueueResponse>(`/study/queue${qs(params)}`),
  grade: (data: { wordId: string; rating: number; mode?: string; durationMs?: number }) =>
    request<{ word: Word; daily: QueueResponse['daily'] }>('/study/grade', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  markMastered: (wordId: string) =>
    request<{ ok: boolean }>('/study/master', { method: 'POST', body: JSON.stringify({ wordId }) }),
  addMistake: (wordId: string) =>
    request<{ ok: boolean }>('/study/mistake', { method: 'POST', body: JSON.stringify({ wordId }) }),
  resetProgress: (bookId?: string) =>
    request<{ ok: boolean }>('/study/reset', { method: 'POST', body: JSON.stringify({ bookId }) }),

  quiz: ({ bookId, count, types }: { bookId?: string; count?: number; types: string[] }) =>
    request<{ questions: Question[] }>(`/quiz${qs({ bookId, count, types: types.join(',') })}`),
  quizSets: () => request<{ items: QuizSetSummary[] }>('/quiz-sets'),
  quizSet: (id: string) => request<{ set: QuizSet }>(`/quiz-sets/${id}`),
  generateQuizSet: (data: {
    bookId?: string
    word?: string
    count: number
    types: string[]
    difficulty?: number
    tendencies?: string[]
  }) =>
    request<GenerateQuizResult>('/quiz-sets/generate', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  recordQuizAttempt: (id: string, score: number, total: number) =>
    request<{ ok: boolean; best: number; attempts: number }>(`/quiz-sets/${id}/attempt`, {
      method: 'POST',
      body: JSON.stringify({ score, total }),
    }),
  deleteQuizSet: (id: string) =>
    request<{ ok: boolean }>(`/quiz-sets/${id}`, { method: 'DELETE' }),

  sentences: (params: { category?: string; level?: string; q?: string; favorite?: boolean }) =>
    request<{ items: Sentence[]; counts: Record<string, number> }>(`/sentences${qs(params)}`),
  createSentence: (input: SentenceInput) =>
    request<{ id: string; created: boolean }>('/sentences', {
      method: 'POST',
      body: JSON.stringify(input),
    }),
  importSentences: (items: SentenceInput[]) =>
    request<{ created: number; skipped: number; total: number }>('/sentences/import', {
      method: 'POST',
      body: JSON.stringify({ items }),
    }),
  updateSentence: (id: string, patch: Partial<SentenceInput>) =>
    request<{ ok: boolean }>(`/sentences/${id}`, { method: 'PATCH', body: JSON.stringify(patch) }),
  deleteSentence: (id: string) =>
    request<{ ok: boolean }>(`/sentences/${id}`, { method: 'DELETE' }),
  dailySentence: (level: string) => request<{ sentence: Sentence | null }>(`/sentences/daily${qs({ level })}`),
  essays: (params: { type?: string; level?: string }) =>
    request<{ items: EssaySummary[] }>(`/essays${qs(params)}`),
  essay: (id: string) => request<{ essay: Essay }>(`/essays/${id}`),
  importEssays: (
    essays: Array<{
      title_en: string
      title_cn: string
      prompt_cn?: string
      prompt_en?: string
      type?: string
      level?: 'cet4' | 'cet6'
      paragraphs: Array<string | { en: string; cn?: string; role?: string }>
      outline?: unknown[]
      highlights?: unknown[]
      tips?: string[]
    }>,
  ) =>
    request<{ created: number; ids: string[] }>('/essays/import', {
      method: 'POST',
      body: JSON.stringify({ essays }),
    }),
  deleteEssay: (id: string) => request<{ ok: boolean }>(`/essays/${id}`, { method: 'DELETE' }),
  essayDrafts: () => request<{ items: EssayDraft[] }>('/essay-drafts'),
  essayDraft: (id: string) => request<{ draft: EssayDraft | null }>(`/essay-drafts/${id}`),
  saveEssayDraft: (
    id: string,
    data: { content: string; checks: boolean[]; seconds: number; savedAt?: string },
  ) =>
    request<{ draft: EssayDraft }>(`/essay-drafts/${id}`, {
      method: 'PUT',
      body: JSON.stringify(data),
    }),
  deleteEssayDraft: (id: string) =>
    request<{ ok: boolean }>(`/essay-drafts/${id}`, { method: 'DELETE' }),
  papers: () =>
    request<{
      items: Array<{
        id: string
        title: string
        level: 'cet4' | 'cet6'
        writingPrompt: string
        questions: Question[]
        created_at?: string
        updated_at?: string
      }>
    }>('/papers'),
  importPapers: (
    papers: Array<{
      title: string
      level: 'cet4' | 'cet6'
      writingPrompt?: string
      questions: Question[]
    }>,
  ) =>
    request<{ created: number; ids: string[]; items: unknown[] }>('/papers/import', {
      method: 'POST',
      body: JSON.stringify({ papers }),
    }),
  deletePaper: (id: string) => request<{ ok: boolean }>(`/papers/${id}`, { method: 'DELETE' }),
  scoreEssay: (data: { content: string; prompt?: string; level: 'cet4' | 'cet6'; wordCount?: number }) =>
    request<EssayScoreResult>('/ai/essay-score', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  templates: (params: { type?: string; usage?: string }) =>
    request<{ items: Template[] }>(`/templates${qs(params)}`),
  search: (q: string) => request<SearchResults>(`/search${qs({ q })}`),
  dict: (term: string) => request<DictEntry>(`/dict/${encodeURIComponent(term)}`),
  dictBatch: (terms: string[], bookId?: string) =>
    request<{ items: BatchDictItem[] }>('/dict/batch', {
      method: 'POST',
      body: JSON.stringify({ terms, bookId }),
    }),

  toggleFavorite: (entityType: 'word' | 'sentence' | 'essay', entityId: string) =>
    request<{ favorited: boolean }>('/favorites/toggle', {
      method: 'POST',
      body: JSON.stringify({ entityType, entityId }),
    }),
  favorites: () => request<FavoritesResponse>('/favorites'),

  stats: () => request<StatsOverview>('/stats/overview'),
  heatmap: (days = 140) => request<{ items: HeatCell[] }>(`/stats/heatmap${qs({ days })}`),
  forecast: (days = 7) => request<{ items: ForecastCell[] }>(`/stats/forecast${qs({ days })}`),
  trend: (days = 30) => request<{ items: TrendCell[] }>(`/stats/trend${qs({ days })}`),
  bookStats: () => request<{ items: BookStat[] }>('/stats/books'),
}

export async function downloadBackup() {
  const res = await fetch('/api/export')
  if (!res.ok) throw new Error('导出失败')
  const blob = await res.blob()
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `inkling-backup-${new Date().toISOString().slice(0, 10)}.json`
  a.click()
  URL.revokeObjectURL(url)
}

export async function importBackup(file: File) {
  const text = await file.text()
  const payload = JSON.parse(text)
  return request<{ ok: boolean; counts: { words: number; books: number; progress: number } }>(
    '/import-backup',
    { method: 'POST', body: JSON.stringify(payload) },
  )
}
