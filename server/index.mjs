import express from 'express'
import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'
import { migrate, db, DB_PATH } from './db.mjs'
import { seedIfNeeded, seedSummary } from './seed.mjs'
import { HttpError } from './lib/http.mjs'
import booksRouter from './routes/books.mjs'
import wordsRouter from './routes/words.mjs'
import studyRouter from './routes/study.mjs'
import contentRouter from './routes/content.mjs'
import statsRouter from './routes/stats.mjs'
import settingsRouter from './routes/settings.mjs'
import quizSetsRouter, { consolidateQuizNotebooks } from './routes/quizsets.mjs'
import translateRouter from './routes/translate.mjs'
import aiSearchRouter from './routes/aiSearch.mjs'
import essayAiRouter from './routes/essayAi.mjs'
import papersRouter from './routes/papers.mjs'
import essayDraftsRouter from './routes/essayDrafts.mjs'

const ROOT = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const DIST = path.join(ROOT, 'dist')
const PORT = Number(process.env.PORT) || 5178
const HOST = process.env.HOST || '127.0.0.1'

migrate()
seedIfNeeded()
consolidateQuizNotebooks()

const app = express()
app.disable('x-powered-by')
app.use(express.json({ limit: '30mb' }))
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff')
  res.setHeader('Referrer-Policy', 'same-origin')
  next()
})

app.get('/api/health', (req, res) => {
  const summary = seedSummary()
  res.json({
    ok: true,
    app: 'verbagather',
    version: 1,
    db: DB_PATH,
    counts: {
      words: summary.words,
      books: summary.books,
      sentences: summary.sentences,
      essays: summary.essays,
      templates: summary.templates,
      dict: summary.dict,
      core: summary.core,
    },
  })
})

app.use(
  '/api',
  booksRouter,
  wordsRouter,
  studyRouter,
  contentRouter,
  statsRouter,
  settingsRouter,
  quizSetsRouter,
  translateRouter,
  aiSearchRouter,
  essayAiRouter,
  papersRouter,
  essayDraftsRouter,
)
app.use('/api', (req, res) => res.status(404).json({ error: '接口不存在' }))

const indexHtml = path.join(DIST, 'index.html')
if (fs.existsSync(indexHtml)) {
  app.use(
    express.static(DIST, {
      index: false,
      setHeaders(res, filePath) {
        if (filePath.includes(`${path.sep}assets${path.sep}`)) {
          res.setHeader('Cache-Control', 'public, max-age=31536000, immutable')
        }
      },
    }),
  )
  app.use((req, res, next) => {
    if (req.method !== 'GET' || req.path.startsWith('/api/')) return next()
    res.setHeader('Cache-Control', 'no-cache')
    res.sendFile(indexHtml)
  })
} else {
  app.get('/', (req, res) => {
    res
      .status(200)
      .type('html')
      .send(
        '<!doctype html><meta charset="utf-8"><title>VerbaGather · 拾词</title><body style="font-family:system-ui;padding:48px;line-height:1.8"><h1>VerbaGather · 拾词</h1><p>前端尚未构建。请先运行 <code>npm run build</code>，再执行 <code>npm start</code>。</p><p>API 已就绪：<a href="/api/health">/api/health</a></p></body>',
      )
  })
}

app.use((err, req, res, next) => {
  if (err instanceof HttpError) {
    return res.status(err.status).json({ error: err.message, details: err.details })
  }
  console.error('[api]', err)
  res.status(500).json({ error: '服务器内部错误', message: err?.message })
})

function listen(port) {
  return new Promise((resolve, reject) => {
    const server = app.listen(port, HOST, () => resolve(server))
    server.once('error', reject)
  })
}

let server = null
let port = PORT
for (let i = 0; i < 10; i += 1) {
  try {
    server = await listen(port)
    break
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[server] 端口 ${port} 已被占用，尝试 ${port + 1}`)
      port += 1
    } else {
      throw err
    }
  }
}
if (!server) {
  console.error('[server] 找不到可用端口')
  process.exit(1)
}

const summary = seedSummary()
console.log('')
console.log('  VerbaGather · 拾词  —  四六级学习站')
console.log(`  地址   http://${HOST === '0.0.0.0' ? 'localhost' : HOST}:${port}`)
console.log(`  数据   ${DB_PATH}`)
console.log(
  `  内容   ${summary.words} 词 · ${summary.sentences} 句 · ${summary.essays} 篇作文 · ${summary.dict} 条词典`,
)
console.log('')

const shutdown = () => {
  server.close(() => {
    try {
      db.close()
    } catch {
      /* ignore */
    }
    process.exit(0)
  })
}
process.on('SIGINT', shutdown)
process.on('SIGTERM', shutdown)
