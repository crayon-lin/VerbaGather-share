import { Router } from 'express'
import { z } from 'zod'
import { db, allSettings, setSetting } from '../db.mjs'
import { DEFAULT_SETTINGS, ensureHighFrequencyBook, ensureSystemBooks } from '../seed.mjs'
import { bad } from '../lib/http.mjs'

const router = Router()

const settingsSchema = z
  .object({
    level: z.enum(['cet4', 'cet6', 'all']),
    dailyNew: z.number().int().min(0).max(200),
    dailyReview: z.number().int().min(0).max(500),
    autoSpeak: z.boolean(),
    quizSound: z.boolean(),
    ttsAccent: z.enum(['en-US', 'en-GB']),
    ttsRate: z.number().min(0.5).max(1.4),
    theme: z.enum(['light', 'dark', 'system']),
    bgImage: z
      .string()
      .max(4_500_000)
      .refine(
        (value) => value === '' || /^data:image\/(png|jpeg|webp|gif|avif);base64,/.test(value),
        '背景图片格式不支持',
      ),
    bgOpacity: z.number().min(0).max(1),
    easyRating: z.boolean(),
    defaultBookId: z.string().max(80),
    aiEnabled: z.boolean(),
    aiBaseUrl: z.string().max(300),
    aiApiKey: z.string().max(300),
    aiModel: z.string().max(100),
    translateAiEnabled: z.boolean(),
    translateAiBaseUrl: z.string().max(300),
    translateAiApiKey: z.string().max(300),
    translateAiModel: z.string().max(100),
    searchAiEnabled: z.boolean(),
    searchAiBaseUrl: z.string().max(300),
    searchAiApiKey: z.string().max(300),
    searchAiModel: z.string().max(100),
    essayAiEnabled: z.boolean(),
    essayAiBaseUrl: z.string().max(300),
    essayAiApiKey: z.string().max(300),
    essayAiModel: z.string().max(100),
    shortcutSearch: z.string().max(40),
    shortcutFocus: z.string().max(40),
    shortcutReveal: z.string().max(20),
    shortcutNext: z.string().max(20),
    shortcutOption1: z.string().max(20),
    shortcutOption2: z.string().max(20),
    shortcutOption3: z.string().max(20),
    shortcutOption4: z.string().max(20),
    shortcutSpeak: z.string().max(20),
  })
  .partial()

router.get('/settings', (req, res) => {
  res.json({ settings: { ...DEFAULT_SETTINGS, ...allSettings() } })
})

router.put('/settings', (req, res) => {
  const parsed = settingsSchema.safeParse(req.body)
  if (!parsed.success) throw bad('设置内容有误', parsed.error.flatten())
  for (const [key, value] of Object.entries(parsed.data)) {
    if (value !== undefined) setSetting(key, value)
  }
  res.json({ settings: { ...DEFAULT_SETTINGS, ...allSettings() } })
})

router.get('/export', (req, res) => {
  const data = {
    books: db.prepare('SELECT * FROM books').all(),
    words: db.prepare('SELECT * FROM words').all(),
    bookWords: db.prepare('SELECT * FROM book_words').all(),
    progress: db.prepare('SELECT * FROM progress').all(),
    reviewLogs: db.prepare('SELECT * FROM review_logs').all(),
    studyDays: db.prepare('SELECT * FROM study_days').all(),
    favorites: db.prepare('SELECT * FROM favorites').all(),
    customSentences: db.prepare('SELECT * FROM sentences WHERE is_custom = 1').all(),
    customEssays: db.prepare('SELECT * FROM essays WHERE is_custom = 1').all(),
    papers: db.prepare('SELECT * FROM papers').all(),
    essayDrafts: db.prepare('SELECT * FROM essay_drafts').all(),
    quizSets: db.prepare('SELECT * FROM quiz_sets').all(),
    settings: db.prepare("SELECT * FROM settings WHERE key != 'seed_version'").all(),
  }
  const payload = {
    app: 'verbagather',
    version: 1,
    exportedAt: new Date().toISOString(),
    data,
  }
  res.setHeader('Content-Disposition', `attachment; filename="inkling-backup-${Date.now()}.json"`)
  res.json(payload)
})

router.post('/import-backup', (req, res) => {
  const payload = req.body
  const data = payload?.data
  if (!data || !Array.isArray(data.books) || !Array.isArray(data.words)) {
    throw bad('备份文件格式不正确')
  }
  db.exec('BEGIN')
  try {
    db.exec(`
      DELETE FROM favorites;
      DELETE FROM review_logs;
      DELETE FROM progress;
      DELETE FROM book_words;
      DELETE FROM words;
      DELETE FROM books;
      DELETE FROM study_days;
      DELETE FROM sentences WHERE is_custom = 1;
      DELETE FROM essays WHERE is_custom = 1;
      DELETE FROM papers;
      DELETE FROM essay_drafts;
      DELETE FROM quiz_sets;
    `)
    const b = db.prepare(
      `INSERT INTO books (id, name, description, level, kind, color, sort_order, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const x of data.books) {
      b.run(x.id, x.name, x.description || '', x.level || 'all', x.kind || 'custom', x.color || 'ink', x.sort_order || 0, x.created_at || new Date().toISOString())
    }
    const w = db.prepare(
      `INSERT INTO words (id, term, phonetic, pos, meaning_cn, meaning_en, example_en, example_cn, exchange, tags, levels, rank, collins, oxford, is_core, source, created_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const x of data.words) {
      w.run(
        x.id,
        x.term,
        x.phonetic || '',
        x.pos || '',
        x.meaning_cn || '',
        x.meaning_en || '',
        x.example_en || '',
        x.example_cn || '',
        x.exchange || '',
        x.tags || '',
        x.levels || '',
        x.rank || 200000,
        x.collins || 0,
        x.oxford || 0,
        x.is_core || 0,
        x.source || 'import',
        x.created_at || new Date().toISOString(),
      )
    }
    const bw = db.prepare(
      'INSERT OR IGNORE INTO book_words (book_id, word_id, added_at, source) VALUES (?, ?, ?, ?)',
    )
    for (const x of data.bookWords || []) {
      bw.run(x.book_id, x.word_id, x.added_at || new Date().toISOString(), x.source || 'import')
    }
    const p = db.prepare(
      `INSERT OR REPLACE INTO progress (word_id, state, ease, interval_days, due_at, reps, lapses, correct, wrong, last_rating, last_reviewed_at, mastered_at, first_seen_at)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const x of data.progress || []) {
      p.run(
        x.word_id,
        x.state || 'new',
        x.ease ?? 2.5,
        x.interval_days ?? 0,
        x.due_at || null,
        x.reps || 0,
        x.lapses || 0,
        x.correct || 0,
        x.wrong || 0,
        x.last_rating ?? null,
        x.last_reviewed_at || null,
        x.mastered_at || null,
        x.first_seen_at || null,
      )
    }
    const l = db.prepare(
      'INSERT INTO review_logs (id, word_id, rating, mode, duration_ms, reviewed_at) VALUES (?, ?, ?, ?, ?, ?)',
    )
    for (const x of data.reviewLogs || []) {
      l.run(x.id, x.word_id, x.rating, x.mode || 'learn', x.duration_ms || 0, x.reviewed_at || new Date().toISOString())
    }
    const d = db.prepare(
      'INSERT OR REPLACE INTO study_days (day, reviews, new_words, correct, duration_ms) VALUES (?, ?, ?, ?, ?)',
    )
    for (const x of data.studyDays || []) {
      d.run(x.day, x.reviews || 0, x.new_words || 0, x.correct || 0, x.duration_ms || 0)
    }
    const f = db.prepare(
      'INSERT OR IGNORE INTO favorites (entity_type, entity_id, created_at) VALUES (?, ?, ?)',
    )
    for (const x of data.favorites || []) {
      f.run(x.entity_type, x.entity_id, x.created_at || new Date().toISOString())
    }
    const s = db.prepare(
      'INSERT OR REPLACE INTO settings (key, value) VALUES (?, ?)',
    )
    for (const x of data.settings || []) {
      if (x.key === 'seed_version') continue
      s.run(x.key, x.value)
    }
    const cs = db.prepare(
      `INSERT OR REPLACE INTO sentences
       (id, text_en, text_cn, category, subcategory, level, source, author, note, tags, difficulty, is_custom)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    )
    for (const x of data.customSentences || []) {
      cs.run(
        x.id,
        x.text_en,
        x.text_cn || '',
        x.category || 'custom',
        x.subcategory || 'user',
        x.level || 'all',
        x.source || '我的句子',
        x.author || '',
        x.note || '',
        x.tags || '',
        x.difficulty || 2,
      )
    }
    const ce = db.prepare(
      `INSERT OR REPLACE INTO essays
       (id, title_en, title_cn, prompt_cn, prompt_en, type, level, word_count, paragraphs, outline, highlights, tips, is_custom)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 1)`,
    )
    for (const x of data.customEssays || []) {
      ce.run(
        x.id,
        x.title_en || '',
        x.title_cn || '',
        x.prompt_cn || '',
        x.prompt_en || '',
        x.type || 'argument',
        x.level || 'cet4',
        x.word_count || 0,
        x.paragraphs || '[]',
        x.outline || '[]',
        x.highlights || '[]',
        x.tips || '[]',
      )
    }
    const pp = db.prepare(
      `INSERT OR REPLACE INTO papers
       (id, title, level, writing_prompt, questions, created_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const x of data.papers || []) {
      pp.run(
        x.id,
        x.title || '导入真题',
        x.level || 'cet4',
        x.writing_prompt || '',
        x.questions || '[]',
        x.created_at || new Date().toISOString(),
        x.updated_at || new Date().toISOString(),
      )
    }
    const ed = db.prepare(
      `INSERT OR REPLACE INTO essay_drafts
       (essay_id, content, checks, seconds, saved_at, updated_at)
       VALUES (?, ?, ?, ?, ?, ?)`,
    )
    for (const x of data.essayDrafts || []) {
      ed.run(
        x.essay_id,
        x.content || '',
        x.checks || '[]',
        x.seconds || 0,
        x.saved_at || null,
        x.updated_at || new Date().toISOString(),
      )
    }
    const qs = db.prepare(
      `INSERT OR REPLACE INTO quiz_sets
       (id, title, source_type, source_ref, source_label, level, count, types, generator, signature,
        questions, created_at, updated_at, attempts, last_score, best_score)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    )
    for (const x of data.quizSets || []) {
      qs.run(
        x.id,
        x.title,
        x.source_type || 'book',
        x.source_ref || '',
        x.source_label || '',
        x.level || 'cet4',
        x.count || 0,
        x.types || '',
        x.generator || 'local',
        x.signature || '',
        x.questions || '[]',
        x.created_at || new Date().toISOString(),
        x.updated_at || new Date().toISOString(),
        x.attempts || 0,
        x.last_score ?? null,
        x.best_score ?? null,
      )
    }
    ensureSystemBooks()
    ensureHighFrequencyBook()
    db.exec('COMMIT')
  } catch (err) {
    db.exec('ROLLBACK')
    throw bad(`导入失败：${err.message}`)
  }
  res.json({
    ok: true,
    counts: {
      words: db.prepare('SELECT COUNT(*) c FROM words').get().c,
      books: db.prepare('SELECT COUNT(*) c FROM books').get().c,
      progress: db.prepare('SELECT COUNT(*) c FROM progress').get().c,
    },
  })
})

export default router
