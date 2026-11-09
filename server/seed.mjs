import fs from 'node:fs'
import path from 'node:path'
import { CONTENT_DIR, SEED_DIR, nowIso } from './lib/time.mjs'
import { db, getSetting, setSetting, allSettings } from './db.mjs'

export const SEED_VERSION = 5

export const DEFAULT_SETTINGS = {
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

export const SYSTEM_BOOKS = [
  {
    id: 'b_cet4',
    name: '四级核心',
    description: '四级大纲核心词汇，按词频与柯林斯星级排序',
    level: 'cet4',
    kind: 'system',
    color: 'forest',
    sort_order: 10,
  },
  {
    id: 'b_cet4_high',
    name: '四级高频',
    description: '四级词中柯林斯 4 星及以上的高频词，适合考前快速过一遍',
    level: 'cet4',
    kind: 'system',
    color: 'sky',
    sort_order: 15,
  },
  {
    id: 'b_cet6',
    name: '六级新增',
    description: '六级在四级之外新增的词汇，避免重复背诵',
    level: 'cet6',
    kind: 'system',
    color: 'amber',
    sort_order: 20,
  },
  {
    id: 'b_newwords',
    name: '我的生词本',
    description: '学习中标为“不认识 / 模糊”的词会自动收进这里',
    level: 'all',
    kind: 'newwords',
    color: 'ink',
    sort_order: 30,
  },
  {
    id: 'b_mistakes',
    name: '错题本',
    description: '测验中做错的词会自动收集，方便集中攻克',
    level: 'all',
    kind: 'mistakes',
    color: 'danger',
    sort_order: 40,
  },
]

function readJson(file) {
  try {
    return JSON.parse(fs.readFileSync(file, 'utf8'))
  } catch (err) {
    console.warn(`[seed] 跳过 ${path.basename(file)}: ${err.message}`)
    return null
  }
}

function contentFiles(prefix) {
  if (!fs.existsSync(CONTENT_DIR)) return []
  return fs
    .readdirSync(CONTENT_DIR)
    .filter((f) => f.startsWith(prefix) && f.endsWith('.json'))
    .sort()
    .map((f) => path.join(CONTENT_DIR, f))
}

function insertBooks() {
  const stmt = db.prepare(
    `INSERT OR IGNORE INTO books (id, name, description, level, kind, color, sort_order, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const at = nowIso()
  for (const b of SYSTEM_BOOKS) {
    stmt.run(b.id, b.name, b.description, b.level, b.kind, b.color, b.sort_order, at)
  }
}

export function ensureSystemBooks() {
  insertBooks()
}

export function ensureHighFrequencyBook() {
  const linked = db
    .prepare("SELECT COUNT(*) c FROM book_words WHERE book_id = 'b_cet4_high'")
    .get().c
  if (linked > 0) return 0
  const res = db
    .prepare(
      `INSERT OR IGNORE INTO book_words (book_id, word_id, added_at, source)
       SELECT 'b_cet4_high', id, ?, 'seed'
       FROM words
       WHERE levels LIKE '%cet4%' AND collins >= 4`,
    )
    .run(nowIso())
  const added = Number(res.changes) || 0
  if (added > 0) console.log(`[seed] 四级高频=${added}`)
  return added
}

function loadExamples() {
  const map = new Map()
  for (const file of contentFiles('examples-')) {
    const rows = readJson(file)
    if (!Array.isArray(rows)) continue
    for (const row of rows) {
      if (row?.term && row?.example_en) {
        map.set(String(row.term).toLowerCase(), row)
      }
    }
  }
  return map
}

function insertWords() {
  const words = readJson(path.join(SEED_DIR, 'words.json'))
  if (!Array.isArray(words)) throw new Error('缺少 server/seed/words.json')
  const examples = loadExamples()
  const insert = db.prepare(
    `INSERT OR REPLACE INTO words
     (id, term, phonetic, pos, meaning_cn, meaning_en, example_en, example_cn, exchange, tags, levels, rank, collins, oxford, is_core, source, created_at)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  const link = db.prepare(
    'INSERT OR IGNORE INTO book_words (book_id, word_id, added_at, source) VALUES (?, ?, ?, ?)',
  )
  const at = nowIso()
  let n4 = 0
  let n6 = 0
  for (const w of words) {
    const levels = Array.isArray(w.levels) ? w.levels : []
    const ex = examples.get(String(w.term).toLowerCase())
    insert.run(
      w.id,
      w.term,
      w.phonetic || '',
      w.pos || '',
      w.meaning_cn || '',
      w.meaning_en || '',
      ex?.example_en || '',
      ex?.example_cn || '',
      w.exchange || '',
      (w.tags || []).join(','),
      levels.join(','),
      w.rank || 200000,
      w.collins || 0,
      w.oxford || 0,
      w.is_core || 0,
      w.source || 'ECDICT',
      at,
    )
    if (levels.includes('cet4')) {
      link.run('b_cet4', w.id, at, 'seed')
      n4 += 1
    } else if (levels.includes('cet6')) {
      link.run('b_cet6', w.id, at, 'seed')
      n6 += 1
    }
  }
  console.log(`[seed] words=${words.length} cet4=${n4} cet6=${n6} examples=${examples.size}`)
}

function insertDict() {
  const rows = readJson(path.join(SEED_DIR, 'dict.json'))
  if (!Array.isArray(rows)) return
  const stmt = db.prepare(
    'INSERT OR REPLACE INTO dict (term, phonetic, translation, pos, rank) VALUES (?, ?, ?, ?, ?)',
  )
  for (const d of rows) {
    stmt.run(d.term, d.phonetic || '', d.translation || '', d.pos || '', d.rank || 200000)
  }
  console.log(`[seed] dict=${rows.length}`)
}

function insertContent() {
  const sentences = []
  for (const file of contentFiles('sentences-')) {
    const rows = readJson(file)
    if (Array.isArray(rows)) sentences.push(...rows)
  }
  const essays = []
  for (const file of contentFiles('essays-')) {
    const rows = readJson(file)
    if (Array.isArray(rows)) essays.push(...rows)
  }
  const templates = readJson(path.join(CONTENT_DIR, 'templates.json'))

  const sStmt = db.prepare(
    `INSERT OR REPLACE INTO sentences
     (id, text_en, text_cn, category, subcategory, level, source, author, note, tags, difficulty, is_custom)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 0)`,
  )
  for (const s of sentences) {
    if (!s?.id || !s.text_en) continue
    sStmt.run(
      s.id,
      s.text_en,
      s.text_cn || '',
      s.category || 'writing',
      s.subcategory || '',
      s.level || 'all',
      s.source || '',
      s.author || '',
      s.note || '',
      Array.isArray(s.tags) ? s.tags.join(',') : s.tags || '',
      s.difficulty || 2,
    )
  }

  const eStmt = db.prepare(
    `INSERT OR REPLACE INTO essays
     (id, title_en, title_cn, prompt_cn, prompt_en, type, level, word_count, paragraphs, outline, highlights, tips)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
  )
  for (const e of essays) {
    if (!e?.id || !e.title_en) continue
    eStmt.run(
      e.id,
      e.title_en,
      e.title_cn || '',
      e.prompt_cn || '',
      e.prompt_en || '',
      e.type || 'argument',
      e.level || 'cet4',
      e.word_count || 0,
      JSON.stringify(e.paragraphs || []),
      JSON.stringify(e.outline || []),
      JSON.stringify(e.highlights || []),
      JSON.stringify(e.tips || []),
    )
  }

  const tStmt = db.prepare(
    `INSERT OR REPLACE INTO templates (id, text_en, text_cn, type, usage, level, tags)
     VALUES (?, ?, ?, ?, ?, ?, ?)`,
  )
  if (Array.isArray(templates)) {
    for (const t of templates) {
      if (!t?.id || !t.text_en) continue
      tStmt.run(
        t.id,
        t.text_en,
        t.text_cn || '',
        t.type || 'argument',
        t.usage || '开头',
        t.level || 'all',
        Array.isArray(t.tags) ? t.tags.join(',') : t.tags || '',
      )
    }
  }

  console.log(`[seed] sentences=${sentences.length} essays=${essays.length} templates=${templates?.length || 0}`)
  return { sentences: sentences.length, essays: essays.length, templates: templates?.length || 0 }
}

function updateExamples() {
  const examples = loadExamples()
  if (!examples.size) return 0
  const stmt = db.prepare(
    'UPDATE words SET example_en = ?, example_cn = ?, is_core = 1 WHERE term = ? COLLATE NOCASE',
  )
  let n = 0
  for (const [term, ex] of examples) {
    const res = stmt.run(ex.example_en, ex.example_cn || '', term)
    n += Number(res.changes) || 0
  }
  return n
}

function ensureDefaults() {
  for (const [k, v] of Object.entries(DEFAULT_SETTINGS)) {
    if (getSetting(k, undefined) === undefined) setSetting(k, v)
  }
}

function fullSeed() {
  db.exec('BEGIN')
  try {
    insertBooks()
    insertWords()
    insertDict()
    insertContent()
    updateExamples()
    ensureDefaults()
    setSetting('seed_version', SEED_VERSION)
    setSetting('seed_stats', {
      words: db.prepare('SELECT COUNT(*) c FROM words').get().c,
      sentences: db.prepare('SELECT COUNT(*) c FROM sentences').get().c,
      essays: db.prepare('SELECT COUNT(*) c FROM essays').get().c,
      seededAt: nowIso(),
    })
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

function refreshContent() {
  db.exec('BEGIN')
  try {
    db.exec('DELETE FROM sentences WHERE is_custom = 0; DELETE FROM essays WHERE is_custom = 0; DELETE FROM templates;')
    insertContent()
    const n = updateExamples()
    ensureDefaults()
    setSetting('seed_version', SEED_VERSION)
    console.log(`[seed] refreshed content, examples updated=${n}`)
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw err
  }
}

export function seedIfNeeded() {
  ensureDefaults()
  const words = db.prepare('SELECT COUNT(*) c FROM words').get().c
  if (words === 0) {
    fullSeed()
  } else {
    const version = getSetting('seed_version', 0)
    if (version !== SEED_VERSION) {
      refreshContent()
      setSetting('seed_version', SEED_VERSION)
    }
  }
  ensureSystemBooks()
  ensureHighFrequencyBook()
}

export function seedSummary() {
  return {
    words: db.prepare('SELECT COUNT(*) c FROM words').get().c,
    books: db.prepare('SELECT COUNT(*) c FROM books').get().c,
    sentences: db.prepare('SELECT COUNT(*) c FROM sentences').get().c,
    essays: db.prepare('SELECT COUNT(*) c FROM essays').get().c,
    templates: db.prepare('SELECT COUNT(*) c FROM templates').get().c,
    dict: db.prepare('SELECT COUNT(*) c FROM dict').get().c,
    core: db.prepare('SELECT COUNT(*) c FROM words WHERE is_core = 1').get().c,
    settings: allSettings(),
  }
}
