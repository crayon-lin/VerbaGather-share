import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const dir = path.join(root, 'server', 'seed', 'content')
const read = (name) => JSON.parse(fs.readFileSync(path.join(dir, name), 'utf8'))
const exists = (name) => fs.existsSync(path.join(dir, name))
const fail = (msg) => {
  console.error(`✗ ${msg}`)
  process.exitCode = 1
}
const ok = (msg) => console.log(`✓ ${msg}`)

const expectedSentences = { writing: 40, motivational: 20, literature: 25, exam: 15 }
const sentenceFiles = fs.readdirSync(dir).filter((f) => f.startsWith('sentences-') && f.endsWith('.json'))
const sentences = sentenceFiles.flatMap((f) => read(f))
if (sentences.length !== 100) fail(`句子应为 100 条，实际 ${sentences.length}`)
const sIds = new Set()
const sTexts = new Set()
for (const s of sentences) {
  if (!s.id || !s.text_en || !s.text_cn || !s.note) fail(`句子字段缺失: ${s.id}`)
  if (sIds.has(s.id)) fail(`句子 id 重复: ${s.id}`)
  sIds.add(s.id)
  if (sTexts.has(s.text_en)) fail(`句子重复: ${s.id}`)
  sTexts.add(s.text_en)
  if (!['writing', 'motivational', 'literature', 'exam'].includes(s.category)) fail(`句子分类异常: ${s.id}`)
  if (!['cet4', 'cet6', 'all'].includes(s.level)) fail(`句子级别异常: ${s.id}`)
}
for (const [cat, count] of Object.entries(expectedSentences)) {
  const actual = sentences.filter((s) => s.category === cat).length
  if (actual !== count) fail(`句子分类 ${cat} 应为 ${count}，实际 ${actual}`)
}
ok(`句子 ${sentences.length} 条，分类齐全`)

const essayFiles = fs.readdirSync(dir).filter((f) => f.startsWith('essays-') && f.endsWith('.json'))
const essays = essayFiles.flatMap((f) => read(f))
if (essays.length !== 16) fail(`作文应为 16 篇，实际 ${essays.length}`)
const eIds = new Set()
const eTitles = new Set()
for (const e of essays) {
  if (!e.id || !e.title_en || !e.title_cn || !e.prompt_cn) fail(`作文字段缺失: ${e.id}`)
  if (eIds.has(e.id)) fail(`作文 id 重复: ${e.id}`)
  eIds.add(e.id)
  if (eTitles.has(e.title_en)) fail(`作文标题重复: ${e.id}`)
  eTitles.add(e.title_en)
  if (!Array.isArray(e.paragraphs) || e.paragraphs.length < 3) fail(`作文段落不足: ${e.id}`)
  const actual = e.paragraphs.map((p) => p.en).join(' ').trim().split(/\s+/).length
  if (Math.abs(actual - e.word_count) > 3) fail(`作文 ${e.id} 字数 ${actual} 与声明 ${e.word_count} 不符`)
  for (const p of e.paragraphs) {
    if (!p.en || !p.cn) fail(`作文 ${e.id} 段落缺译文`)
  }
  for (const h of e.highlights || []) {
    if (!e.paragraphs.some((p) => p.en.includes(h.text))) fail(`作文 ${e.id} 亮点不在正文: ${h.text.slice(0, 30)}`)
  }
  if (!(e.tips || []).length) fail(`作文 ${e.id} 缺评分要点`)
}
if (essays.filter((e) => e.level === 'cet4').length !== 8) fail('四级作文应为 8 篇')
if (essays.filter((e) => e.level === 'cet6').length !== 8) fail('六级作文应为 8 篇')
ok(`作文 ${essays.length} 篇，字数与亮点校验通过`)

const templates = read('templates.json')
if (templates.length !== 40) fail(`模板应为 40 条，实际 ${templates.length}`)
const tIds = new Set()
for (const t of templates) {
  if (!t.id || !t.text_en || !t.text_cn) fail(`模板字段缺失: ${t.id}`)
  if (tIds.has(t.id)) fail(`模板 id 重复: ${t.id}`)
  tIds.add(t.id)
}
ok(`模板 ${templates.length} 条`)

const coreFiles = Array.from({ length: 8 }, (_, i) => `core-terms-${String(i + 1).padStart(2, '0')}.json`)
const core = coreFiles.flatMap(read)
const exampleFiles = fs.readdirSync(dir).filter((f) => f.startsWith('examples-') && f.endsWith('.json')).sort()
const examples = exampleFiles.flatMap((f) => read(f))
if (examples.length !== 400) fail(`例句应为 400 条，实际 ${examples.length}`)
let mismatch = 0
let missingWord = 0
let wordLen = 0
examples.forEach((ex, i) => {
  if (core[i] && ex.term !== core[i].term) {
    mismatch += 1
    if (mismatch <= 5) fail(`例句第 ${i} 条 term 不匹配: ${ex.term} != ${core[i].term}`)
  }
  if (!ex.example_en || !ex.example_cn || !ex.note) fail(`例句字段缺失: ${ex.term}`)
  const lower = ex.example_en.toLowerCase()
  const term = ex.term.toLowerCase()
  const stem = term.length > 5 ? term.slice(0, term.length - 2) : term
  if (!lower.includes(term) && !lower.includes(stem)) {
    missingWord += 1
    if (missingWord <= 8) console.warn(`  ! 例句可能不含原词: ${ex.term} → ${ex.example_en}`)
  }
  const len = ex.example_en.trim().split(/\s+/).length
  if (len < 8 || len > 18) {
    wordLen += 1
    if (wordLen <= 5) console.warn(`  ! 例句长度 ${len}: ${ex.term}`)
  }
})
if (mismatch) fail(`例句 term 顺序有 ${mismatch} 处不匹配`)
if (missingWord) console.warn(`  ! ${missingWord} 条例句未直接包含原词（可能是词形变化）`)
if (wordLen) console.warn(`  ! ${wordLen} 条例句词数不在 8–18`)
ok(`例句 ${examples.length} 条，顺序与核心词一致`)

for (const f of fs.readdirSync(dir).filter((n) => n.endsWith('.json'))) {
  const raw = fs.readFileSync(path.join(dir, f), 'utf8')
  if (raw.includes('\uFFFD')) fail(`${f} 含替换字符，可能编码损坏`)
}

console.log('')
console.log(`内容检查完成：${sentences.length} 句 · ${essays.length} 篇 · ${templates.length} 模板 · ${examples.length} 例句`)
if (process.exitCode) console.error('存在需要修正的问题')
