import fs from 'node:fs'
import path from 'node:path'
import { DatabaseSync } from 'node:sqlite'
import { ROOT } from './lib/time.mjs'

const DATA_DIR = path.join(ROOT, 'data')
fs.mkdirSync(DATA_DIR, { recursive: true })

export const DB_PATH = path.join(DATA_DIR, 'app.db')
export const db = new DatabaseSync(DB_PATH)

db.exec(`
  PRAGMA journal_mode = WAL;
  PRAGMA synchronous = NORMAL;
  PRAGMA foreign_keys = ON;
  PRAGMA busy_timeout = 5000;
`)

export function migrate() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS books (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      description TEXT NOT NULL DEFAULT '',
      level TEXT NOT NULL DEFAULT 'all',
      kind TEXT NOT NULL DEFAULT 'custom',
      color TEXT NOT NULL DEFAULT 'ink',
      sort_order INTEGER NOT NULL DEFAULT 0,
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS words (
      id TEXT PRIMARY KEY,
      term TEXT NOT NULL COLLATE NOCASE UNIQUE,
      phonetic TEXT NOT NULL DEFAULT '',
      pos TEXT NOT NULL DEFAULT '',
      meaning_cn TEXT NOT NULL DEFAULT '',
      meaning_en TEXT NOT NULL DEFAULT '',
      example_en TEXT NOT NULL DEFAULT '',
      example_cn TEXT NOT NULL DEFAULT '',
      exchange TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      levels TEXT NOT NULL DEFAULT '',
      rank INTEGER NOT NULL DEFAULT 200000,
      collins INTEGER NOT NULL DEFAULT 0,
      oxford INTEGER NOT NULL DEFAULT 0,
      is_core INTEGER NOT NULL DEFAULT 0,
      source TEXT NOT NULL DEFAULT '',
      created_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS book_words (
      book_id TEXT NOT NULL REFERENCES books(id) ON DELETE CASCADE,
      word_id TEXT NOT NULL REFERENCES words(id) ON DELETE CASCADE,
      added_at TEXT NOT NULL,
      source TEXT NOT NULL DEFAULT '',
      PRIMARY KEY (book_id, word_id)
    );

    CREATE TABLE IF NOT EXISTS progress (
      word_id TEXT PRIMARY KEY REFERENCES words(id) ON DELETE CASCADE,
      state TEXT NOT NULL DEFAULT 'new',
      ease REAL NOT NULL DEFAULT 2.5,
      interval_days REAL NOT NULL DEFAULT 0,
      due_at TEXT,
      reps INTEGER NOT NULL DEFAULT 0,
      lapses INTEGER NOT NULL DEFAULT 0,
      correct INTEGER NOT NULL DEFAULT 0,
      wrong INTEGER NOT NULL DEFAULT 0,
      last_rating INTEGER,
      last_reviewed_at TEXT,
      mastered_at TEXT,
      first_seen_at TEXT
    );

    CREATE TABLE IF NOT EXISTS review_logs (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      word_id TEXT NOT NULL,
      rating INTEGER NOT NULL,
      mode TEXT NOT NULL DEFAULT 'learn',
      duration_ms INTEGER NOT NULL DEFAULT 0,
      reviewed_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS study_days (
      day TEXT PRIMARY KEY,
      reviews INTEGER NOT NULL DEFAULT 0,
      new_words INTEGER NOT NULL DEFAULT 0,
      correct INTEGER NOT NULL DEFAULT 0,
      duration_ms INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS sentences (
      id TEXT PRIMARY KEY,
      text_en TEXT NOT NULL,
      text_cn TEXT NOT NULL,
      category TEXT NOT NULL,
      subcategory TEXT NOT NULL DEFAULT '',
      level TEXT NOT NULL DEFAULT 'all',
      source TEXT NOT NULL DEFAULT '',
      author TEXT NOT NULL DEFAULT '',
      note TEXT NOT NULL DEFAULT '',
      tags TEXT NOT NULL DEFAULT '',
      difficulty INTEGER NOT NULL DEFAULT 2,
      is_custom INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS quiz_sets (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      source_type TEXT NOT NULL DEFAULT 'book',
      source_ref TEXT NOT NULL DEFAULT '',
      source_label TEXT NOT NULL DEFAULT '',
      level TEXT NOT NULL DEFAULT 'cet4',
      count INTEGER NOT NULL DEFAULT 0,
      types TEXT NOT NULL DEFAULT '',
      generator TEXT NOT NULL DEFAULT 'local',
      signature TEXT NOT NULL DEFAULT '',
      questions TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      attempts INTEGER NOT NULL DEFAULT 0,
      last_score INTEGER,
      best_score INTEGER
    );

    CREATE TABLE IF NOT EXISTS essays (
      id TEXT PRIMARY KEY,
      title_en TEXT NOT NULL,
      title_cn TEXT NOT NULL,
      prompt_cn TEXT NOT NULL DEFAULT '',
      prompt_en TEXT NOT NULL DEFAULT '',
      type TEXT NOT NULL,
      level TEXT NOT NULL,
      word_count INTEGER NOT NULL DEFAULT 0,
      paragraphs TEXT NOT NULL DEFAULT '[]',
      outline TEXT NOT NULL DEFAULT '[]',
      highlights TEXT NOT NULL DEFAULT '[]',
      tips TEXT NOT NULL DEFAULT '[]',
      is_custom INTEGER NOT NULL DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS papers (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      level TEXT NOT NULL DEFAULT 'cet4',
      writing_prompt TEXT NOT NULL DEFAULT '',
      questions TEXT NOT NULL DEFAULT '[]',
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS templates (
      id TEXT PRIMARY KEY,
      text_en TEXT NOT NULL,
      text_cn TEXT NOT NULL,
      type TEXT NOT NULL DEFAULT 'argument',
      usage TEXT NOT NULL DEFAULT '开头',
      level TEXT NOT NULL DEFAULT 'all',
      tags TEXT NOT NULL DEFAULT ''
    );

    CREATE TABLE IF NOT EXISTS favorites (
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      created_at TEXT NOT NULL,
      PRIMARY KEY (entity_type, entity_id)
    );

    CREATE TABLE IF NOT EXISTS essay_drafts (
      essay_id TEXT PRIMARY KEY,
      content TEXT NOT NULL DEFAULT '',
      checks TEXT NOT NULL DEFAULT '[]',
      seconds INTEGER NOT NULL DEFAULT 0,
      saved_at TEXT,
      updated_at TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS dict (
      term TEXT PRIMARY KEY COLLATE NOCASE,
      phonetic TEXT NOT NULL DEFAULT '',
      translation TEXT NOT NULL DEFAULT '',
      pos TEXT NOT NULL DEFAULT '',
      rank INTEGER NOT NULL DEFAULT 200000
    );

    CREATE INDEX IF NOT EXISTS idx_words_term ON words(term);
    CREATE INDEX IF NOT EXISTS idx_words_rank ON words(rank);
    CREATE INDEX IF NOT EXISTS idx_book_words_book ON book_words(book_id);
    CREATE INDEX IF NOT EXISTS idx_progress_due ON progress(due_at);
    CREATE INDEX IF NOT EXISTS idx_progress_state ON progress(state);
    CREATE INDEX IF NOT EXISTS idx_logs_word ON review_logs(word_id);
    CREATE INDEX IF NOT EXISTS idx_logs_time ON review_logs(reviewed_at);
    CREATE INDEX IF NOT EXISTS idx_sentences_cat ON sentences(category);
    CREATE INDEX IF NOT EXISTS idx_essays_level ON essays(level);
    CREATE INDEX IF NOT EXISTS idx_quiz_sets_updated ON quiz_sets(updated_at);
    CREATE INDEX IF NOT EXISTS idx_quiz_sets_signature ON quiz_sets(signature);
  `)

  // 旧库升级：为 sentences 增加 is_custom（SQLite 不支持 ADD COLUMN IF NOT EXISTS）
  const sentenceColumns = db.prepare('PRAGMA table_info(sentences)').all()
  if (!sentenceColumns.some((col) => col.name === 'is_custom')) {
    db.exec('ALTER TABLE sentences ADD COLUMN is_custom INTEGER NOT NULL DEFAULT 0')
  }
  const essayColumns = db.prepare('PRAGMA table_info(essays)').all()
  if (!essayColumns.some((col) => col.name === 'is_custom')) {
    db.exec('ALTER TABLE essays ADD COLUMN is_custom INTEGER NOT NULL DEFAULT 0')
  }
}

export function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key)
  if (!row) return fallback
  try {
    return JSON.parse(row.value)
  } catch {
    return row.value
  }
}

export function setSetting(key, value) {
  db.prepare(
    'INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value',
  ).run(key, JSON.stringify(value))
}

export function allSettings() {
  const rows = db.prepare('SELECT key, value FROM settings').all()
  const out = {}
  for (const row of rows) {
    try {
      out[row.key] = JSON.parse(row.value)
    } catch {
      out[row.key] = row.value
    }
  }
  return out
}
