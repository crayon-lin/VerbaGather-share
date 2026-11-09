export type Level = 'cet4' | 'cet6' | 'all'
export type WordState = 'new' | 'learning' | 'review' | 'mastered'
export type EssayType = 'argument' | 'chart' | 'letter' | 'speech' | 'notice' | 'review'
export type SentenceCategory = 'writing' | 'motivational' | 'literature' | 'exam' | 'custom'

export interface Word {
  id: string
  term: string
  phonetic: string
  pos: string
  meaning_cn: string
  meaning_en: string
  example_en: string
  example_cn: string
  exchange: string
  tags: string[]
  levels: string[]
  rank: number
  collins: number
  oxford: number
  is_core: boolean
  favorite?: boolean
  source: string
  created_at: string
  state: WordState
  due_at: string | null
  reps: number
  lapses: number
  correct: number
  wrong: number
  interval_days: number
  ease: number
  last_reviewed_at: string | null
  mastered_at: string | null
}

export interface Book {
  id: string
  name: string
  description: string
  level: Level
  kind: 'system' | 'custom' | 'newwords' | 'mistakes'
  color: string
  sort_order: number
  created_at: string
  total: number
  new_count: number
  learning_count: number
  review_count: number
  mastered_count: number
  due_count: number
}

export interface DailyStat {
  day: string
  reviews: number
  newWords: number
  correct: number
  durationMs: number
}

export interface QueueItem extends Word {
  distractors?: {
    terms: string[]
    meanings: string[]
  }
}

export interface QueueResponse {
  items: QueueItem[]
  counts: { due: number; newRemaining: number }
  daily: DailyStat
}

export interface BookWordsResponse {
  book: Book
  items: Word[]
  total: number
  page: number
  pageSize: number
  stats: {
    total: number
    new_count: number
    learning_count: number
    review_count: number
    mastered_count: number
  }
}

export interface Sentence {
  id: string
  text_en: string
  text_cn: string
  category: SentenceCategory
  subcategory: string
  level: Level
  source: string
  author: string
  note: string
  tags: string[]
  difficulty: number
  favorite: boolean
  is_custom: boolean
}

export interface EssayParagraph {
  en: string
  cn: string
  role: string
}

export interface EssayOutlinePart {
  part: string
  points: string[]
}

export interface EssayHighlight {
  text: string
  type: string
  note: string
}

export interface EssaySummary {
  id: string
  title_en: string
  title_cn: string
  prompt_cn: string
  prompt_en: string
  type: EssayType
  level: 'cet4' | 'cet6'
  word_count: number
  excerpt: string
  firstParagraph: string
  tips: string[]
  favorite: boolean
  is_custom?: boolean
}

export interface Essay extends EssaySummary {
  paragraphs: EssayParagraph[]
  outline: EssayOutlinePart[]
  highlights: EssayHighlight[]
}

export interface Template {
  id: string
  text_en: string
  text_cn: string
  type: EssayType
  usage: string
  level: Level
  tags: string[]
}

export interface EssayScoreResult {
  score: number
  maxScore: number
  summary: string
  dimensions: Array<{ name: string; score: number; maxScore: number; comment: string }>
  strengths: string[]
  improvements: string[]
  suggestions: string[]
  model: string
}

export interface EssayDraft {
  essay_id: string
  content: string
  checks: boolean[]
  seconds: number
  savedAt: string | null
  updated_at?: string
}

export type QuestionType =
  | 'en2cn'
  | 'cn2en'
  | 'listen'
  | 'spell'
  | 'cloze'
  | 'sentence'
  | 'passage_cloze'
  | 'listening'
  | 'reading'

export interface Question {
  id: string
  wordId: string | null
  type: QuestionType
  prompt: string
  answer: string
  options: string[]
  answerIndex: number
  passage?: string
  audioText?: string
  blankIndex?: number
  blankCount?: number
  explanation?: string
  word: Pick<Word, 'id' | 'term' | 'phonetic' | 'meaning_cn' | 'example_en' | 'example_cn'> & {
    pos?: string
    meaning_en?: string
    exchange?: string
    state?: WordState
  }
}

export interface SearchResults {
  words: Array<{ id: string; term: string; phonetic: string; meaning_cn: string; state: WordState }>
  sentences: Array<{ id: string; text_en: string; text_cn: string; category: string; source: string }>
  essays: Array<{ id: string; title_en: string; title_cn: string; type: string; level: string }>
  templates: Array<{ id: string; text_en: string; text_cn: string; type: string; usage: string }>
}

export interface AiChatMessage {
  role: 'user' | 'assistant'
  content: string
}

export interface Settings {
  level: Level
  dailyNew: number
  dailyReview: number
  autoSpeak: boolean
  quizSound: boolean
  ttsAccent: 'en-US' | 'en-GB'
  ttsRate: number
  theme: 'light' | 'dark' | 'system'
  bgImage: string
  bgOpacity: number
  easyRating: boolean
  defaultBookId: string
  aiEnabled: boolean
  aiBaseUrl: string
  aiApiKey: string
  aiModel: string
  translateAiEnabled: boolean
  translateAiBaseUrl: string
  translateAiApiKey: string
  translateAiModel: string
  searchAiEnabled: boolean
  searchAiBaseUrl: string
  searchAiApiKey: string
  searchAiModel: string
  essayAiEnabled: boolean
  essayAiBaseUrl: string
  essayAiApiKey: string
  essayAiModel: string
  shortcutSearch: string
  shortcutFocus: string
  shortcutReveal: string
  shortcutNext: string
  shortcutOption1: string
  shortcutOption2: string
  shortcutOption3: string
  shortcutOption4: string
  shortcutSpeak: string
}

export const DEFAULT_SETTINGS: Settings = {
  level: 'cet4',
  dailyNew: 20,
  dailyReview: 200,
  autoSpeak: true,
  quizSound: false,
  ttsAccent: 'en-US',
  ttsRate: 0.95,
  theme: 'system',
  bgImage: '',
  bgOpacity: 0.22,
  easyRating: false,
  defaultBookId: 'b_newwords',
  aiEnabled: false,
  aiBaseUrl: '',
  aiApiKey: '',
  aiModel: '',
  translateAiEnabled: false,
  translateAiBaseUrl: '',
  translateAiApiKey: '',
  translateAiModel: '',
  searchAiEnabled: false,
  searchAiBaseUrl: '',
  searchAiApiKey: '',
  searchAiModel: '',
  essayAiEnabled: false,
  essayAiBaseUrl: '',
  essayAiApiKey: '',
  essayAiModel: '',
  shortcutSearch: 'Ctrl+K',
  shortcutFocus: 'F',
  shortcutReveal: 'Space',
  shortcutNext: 'Enter',
  shortcutOption1: '1',
  shortcutOption2: '2',
  shortcutOption3: '3',
  shortcutOption4: '4',
  shortcutSpeak: 'P',
}

export interface StatsOverview {
  totalWords: number
  learned: number
  mastered: number
  due: number
  accuracy: number
  durationMs: number
  streak: number
  today: DailyStat
  goals: { dailyNew: number; dailyReview: number }
}

export interface HeatCell {
  day: string
  reviews: number
  newWords: number
  minutes: number
  count: number
}

export interface ForecastCell {
  day: string
  count: number
}

export interface TrendCell {
  day: string
  reviews: number
  newWords: number
  minutes: number
}

export interface BookStat {
  id: string
  name: string
  level: Level
  kind: string
  color: string
  total: number
  mastered: number
  learned: number
  due: number
}

export interface DictEntry {
  found: boolean
  term: string
  query?: string
  lemma?: boolean
  phonetic?: string
  translation?: string
  pos?: string
  wordId?: string | null
  inWordBook?: boolean
  suggestions?: string[]
}

export interface BatchDictItem {
  term: string
  found: boolean
  phonetic: string
  pos: string
  meaning_cn: string
  wordId: string | null
  existsInBook: boolean
}

export interface FavoritesResponse {
  words: Word[]
  sentences: Sentence[]
  essays: EssaySummary[]
}

export interface SentenceInput {
  text_en: string
  text_cn?: string
  category?: string
  subcategory?: string
  level?: Level
  source?: string
  author?: string
  note?: string
  tags?: string[] | string
  difficulty?: number
}

export interface QuizSetSummary {
  id: string
  title: string
  source_type: 'book' | 'word' | 'all'
  source_ref: string
  source_label: string
  level: Level
  count: number
  types: string[]
  generator: 'local' | 'ai' | 'mixed'
  created_at: string
  updated_at: string
  attempts: number
  last_score: number | null
  best_score: number | null
}

export interface QuizSet extends QuizSetSummary {
  questions: Question[]
}

export interface GenerateQuizResult {
  set: QuizSet
  added: Question[]
  reused: boolean
  generator: 'local' | 'ai'
  notice: string
}
