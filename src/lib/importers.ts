export interface ParsedWord {
  term: string
  meaning: string
}

const POS_TAIL = /\s+(?:n|v|vt|vi|a|ad|adj|adv|prep|conj|pron|num|art|aux)\.$/i
const NOISE_LINE =
  /^(?:unit|chapter|lesson|module|part|section|words?|vocabulary|directions|contents?|appendix)\b/i

function normalizeTerm(raw: string) {
  return raw
    .replace(POS_TAIL, '')
    .replace(/[.,;:]+$/g, '')
    .replace(/\s+/g, ' ')
    .trim()
}

export function parseWordText(text: string, limit = 800): ParsedWord[] {
  const out: ParsedWord[] = []
  const seen = new Set<string>()
  const lines = text.split(/\r?\n/)
  for (const rawLine of lines) {
    if (out.length >= limit) break
    let line = rawLine.replace(/\u00a0/g, ' ').trim()
    if (!line) continue
    if (/^#{1,6}\s/.test(line) || /^[-=*]{3,}$/.test(line)) continue
    if (NOISE_LINE.test(line)) continue
    line = line.replace(/^[\s\-•·*·–—]+/, '').replace(/^\d+[.)、]\s*/, '')
    if (!line || line.length > 120) continue

    let term = ''
    let meaning = ''

    const cjk = line.match(/^([A-Za-z][A-Za-z'’ .&-]*?)\s*([\u4e00-\u9fff][\s\S]*)$/)
    if (cjk) {
      term = normalizeTerm(cjk[1])
      meaning = cjk[2].trim()
    } else {
      const sep = line.match(
        /^([A-Za-z][A-Za-z'’ .&-]*?)\s*(?:\t+|\s*[|｜]\s*|\s+[-–—:：]\s+|\s{2,})\s*(\S[\s\S]*)$/,
      )
      if (sep) {
        term = normalizeTerm(sep[1])
        meaning = sep[2].trim()
      } else {
        const tokens = line.split(/\s+/)
        if (tokens.length <= 3 && /^[A-Za-z][A-Za-z'’-]*$/.test(tokens[0])) {
          term = normalizeTerm(line)
        } else if (tokens.length > 3 && /^[A-Za-z][A-Za-z'’-]*$/.test(tokens[0])) {
          continue
        }
      }
    }

    if (!term || term.length < 2 || term.length > 40) continue
    if (!/^[A-Za-z]/.test(term) || /\d/.test(term)) continue
    if (term.split(/\s+/).length > 3) continue
    const key = term.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push({ term, meaning })
  }
  return out
}

export function dedupeWords(words: ParsedWord[]) {
  const seen = new Set<string>()
  const out: ParsedWord[] = []
  for (const w of words) {
    const key = w.term.toLowerCase()
    if (seen.has(key)) continue
    seen.add(key)
    out.push(w)
  }
  return out
}

const OCR_STOP = new Set([
  'the', 'and', 'for', 'with', 'that', 'this', 'from', 'have', 'has', 'had',
  'was', 'were', 'are', 'his', 'her', 'its', 'their', 'they', 'them', 'then',
  'than', 'when', 'where', 'which', 'while', 'into', 'over', 'under', 'about',
  'after', 'before', 'also', 'more', 'most', 'some', 'such', 'only', 'very',
  'much', 'many', 'will', 'would', 'could', 'should', 'shall', 'been', 'being',
  'does', 'did', 'not', 'you', 'your', 'our', 'out', 'all', 'can', 'may',
  'might', 'must', 'word', 'words', 'unit', 'list', 'page', 'name', 'part',
])

/** OCR 结果只保留像英文单词的 token，再由本地词典过滤噪声。 */
export function extractOcrTokens(text: string, limit = 300): string[] {
  const matches = text.match(/[A-Za-z][A-Za-z'’-]{2,}/g) || []
  const out: string[] = []
  const seen = new Set<string>()
  for (const raw of matches) {
    const term = raw.toLowerCase().replace(/^['’-]+|['’-]+$/g, '')
    if (term.length < 4 || term.length > 24) continue
    if (OCR_STOP.has(term)) continue
    if (seen.has(term)) continue
    seen.add(term)
    out.push(term)
    if (out.length >= limit) break
  }
  return out
}

async function parseCsv(text: string): Promise<ParsedWord[]> {
  const Papa = (await import('papaparse')).default
  const parsed = Papa.parse<string[]>(text, { skipEmptyLines: true })
  const rows = parsed.data.filter((r) => Array.isArray(r) && r.length)
  const out: ParsedWord[] = []
  for (const row of rows) {
    const cells = row.map((c) => String(c ?? '').trim())
    if (!cells[0]) continue
    if (/^(word|term|单词|英文)$/i.test(cells[0])) continue
    if (cells.length >= 2) {
      out.push({ term: cells[0], meaning: cells.slice(1).filter(Boolean).join('；') })
    } else {
      out.push({ term: cells[0], meaning: '' })
    }
  }
  return dedupeWords(out)
}

async function parseJson(text: string): Promise<ParsedWord[]> {
  const data = JSON.parse(text)
  if (!Array.isArray(data)) return []
  const out: ParsedWord[] = []
  for (const item of data) {
    if (typeof item === 'string') {
      out.push({ term: item, meaning: '' })
    } else if (item && typeof item === 'object') {
      const term = item.term || item.word || item.english || item.text
      const meaning =
        item.meaning_cn || item.meaning || item.translation || item.chinese || item.definition || ''
      if (typeof term === 'string') out.push({ term, meaning: String(meaning || '') })
    }
  }
  return dedupeWords(out.filter((w) => w.term))
}

export async function pdfToText(file: File): Promise<string> {
  const pdfjs = await import('pdfjs-dist')
  pdfjs.GlobalWorkerOptions.workerSrc = '/pdf.worker.min.mjs'
  const doc = await pdfjs.getDocument({ data: await file.arrayBuffer() }).promise
  const pages: string[] = []
  const max = Math.min(doc.numPages, 60)
  for (let p = 1; p <= max; p += 1) {
    const page = await doc.getPage(p)
    const content = await page.getTextContent()
    let lastY: number | null = null
    let line = ''
    const lines: string[] = []
    for (const item of content.items) {
      if (!('str' in item)) continue
      const y = item.transform?.[5] ?? 0
      if (lastY !== null && Math.abs(y - lastY) > 2.5) {
        if (line.trim()) lines.push(line.trim())
        line = ''
      }
      line += `${item.str} `
      lastY = y
    }
    if (line.trim()) lines.push(line.trim())
    pages.push(lines.join('\n'))
  }
  return pages.join('\n')
}

export async function docxToText(file: File): Promise<string> {
  const mod = await import('mammoth')
  const mammoth = (mod as unknown as { default?: typeof mod }).default ?? mod
  const result = await mammoth.extractRawText({ arrayBuffer: await file.arrayBuffer() })
  return result.value || ''
}

export async function extractFileWords(file: File): Promise<ParsedWord[]> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv') || name.endsWith('.tsv')) {
    return parseCsv(await file.text())
  }
  if (name.endsWith('.json')) {
    return parseJson(await file.text())
  }
  if (name.endsWith('.docx')) {
    return parseWordText(await docxToText(file))
  }
  if (name.endsWith('.pdf')) {
    return parseWordText(await pdfToText(file))
  }
  return parseWordText(await file.text())
}

export async function preprocessImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file)
  const targetWidth = Math.min(1800, Math.max(1200, bitmap.width * 1.6))
  const scale = targetWidth / bitmap.width
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('无法处理图片')
  ctx.filter = 'grayscale(1) contrast(1.35) brightness(1.05)'
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'))
  if (!blob) throw new Error('图片处理失败')
  return blob
}

export async function ocrImage(
  file: File,
  onProgress: (progress: number) => void,
): Promise<string> {
  const processed = await preprocessImage(file)
  const { createWorker } = await import('tesseract.js')
  const worker = await createWorker('eng', 1, {
    workerPath: '/ocr/worker.min.js',
    corePath: '/ocr/tesseract-core-simd-lstm.wasm.js',
    langPath: '/ocr/lang',
    logger: (m: { status: string; progress: number }) => {
      if (m.status === 'recognizing text' || m.status === 'loading language traineddata') {
        onProgress(m.progress || 0)
      }
    },
  })
  try {
    const { data } = await worker.recognize(processed)
    return data.text
  } finally {
    await worker.terminate()
  }
}
