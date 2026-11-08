import { docxToText, ocrImage, pdfToText } from './importers'

export interface ParsedSentence {
  text_en: string
  text_cn: string
}

const CJK = /[\u3400-\u9fff\uf900-\ufaff]/
const NOISE = /^(unit|chapter|lesson|module|part|section|directions|contents?|appendix)\b/i

function hasCjk(text: string) {
  return CJK.test(text)
}

function mostlyChinese(text: string) {
  const chars = [...text.replace(/\s/g, '')]
  if (!chars.length) return false
  const cjk = chars.filter((c) => CJK.test(c)).length
  return cjk / chars.length > 0.35
}

function clean(text: string) {
  return text
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .replace(/^[\s"'“”‘’]+|[\s"'“”‘’]+$/g, '')
    .trim()
}

export function splitEnglishSentences(text: string): string[] {
  const normalized = text.replace(/\s+/g, ' ').trim()
  if (!normalized) return []
  const matched = normalized.match(/[^.!?]+[.!?]+["'”’]?|[^.!?]+$/g) || [normalized]
  return matched
    .map((s) => clean(s))
    .filter((s) => s.length >= 8 && s.length <= 500 && /[A-Za-z]{2}/.test(s))
}

export function parseSentenceText(text: string): ParsedSentence[] {
  const lines = String(text || '')
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)

  const out: ParsedSentence[] = []
  const seen = new Set<string>()
  const push = (en: string, cn = '') => {
    const textEn = clean(en)
    if (textEn.length < 8 || textEn.length > 500) return
    if (NOISE.test(textEn)) return
    const key = textEn.toLowerCase()
    if (seen.has(key)) return
    seen.add(key)
    out.push({ text_en: textEn, text_cn: clean(cn) })
  }

  for (const line of lines) {
    if (NOISE.test(line)) continue
    if (!hasCjk(line) && !/[.!?…]/.test(line) && line.split(/\s+/).length <= 5) continue
    const parts = line
      .split(/\t+|\s*\|\|\s*|\s*\|\s*|\s+[—–]\s+/)
      .map((p) => p.trim())
      .filter(Boolean)
    if (
      parts.length >= 2 &&
      (hasCjk(parts[0]) !== hasCjk(parts[1])) &&
      /[A-Za-z]{3}/.test(parts[0] + parts[1])
    ) {
      const cnIndex = hasCjk(parts[0]) ? 0 : 1
      const enIndex = cnIndex === 0 ? 1 : 0
      push(parts[enIndex], parts[cnIndex])
      continue
    }

    const firstCjk = line.search(CJK)
    if (firstCjk > 10 && /[A-Za-z]{3}/.test(line.slice(0, firstCjk))) {
      push(line.slice(0, firstCjk), line.slice(firstCjk))
      continue
    }

    if (mostlyChinese(line)) {
      const last = out[out.length - 1]
      if (last && !last.text_cn && line.length <= 300) last.text_cn = clean(line)
      continue
    }

    for (const sentence of splitEnglishSentences(line)) push(sentence)
  }
  return out.slice(0, 250)
}

async function parseCsv(file: File): Promise<ParsedSentence[]> {
  const Papa = (await import('papaparse')).default
  const parsed = Papa.parse<string[]>(await file.text(), { skipEmptyLines: true })
  const rows = parsed.data.filter((r) => Array.isArray(r) && r.some(Boolean))
  if (!rows.length) return []
  const header = rows[0].map((c) => String(c || '').toLowerCase().trim())
  const enIndex = header.findIndex((h) => /^(en|english|text_en|sentence|sentences)$/.test(h))
  const cnIndex = header.findIndex((h) => /^(cn|chinese|zh|text_cn|translation|译文|中文)$/.test(h))
  const start = enIndex >= 0 || cnIndex >= 0 ? 1 : 0
  const enCol = enIndex >= 0 ? enIndex : 0
  const cnCol = cnIndex >= 0 ? cnIndex : 1
  const out: ParsedSentence[] = []
  for (let i = start; i < rows.length; i += 1) {
    const row = rows[i]
    const en = clean(String(row[enCol] || ''))
    if (!en) continue
    out.push({ text_en: en, text_cn: clean(String(row[cnCol] || '')) })
  }
  return out
}

async function parseJson(file: File): Promise<ParsedSentence[]> {
  const data = JSON.parse(await file.text())
  if (!Array.isArray(data)) return []
  const out: ParsedSentence[] = []
  for (const item of data) {
    if (typeof item === 'string') {
      out.push({ text_en: item, text_cn: '' })
    } else if (item && typeof item === 'object') {
      const en = item.text_en || item.en || item.english || item.sentence || item.text
      const cn = item.text_cn || item.cn || item.chinese || item.translation || item.zh
      if (typeof en === 'string' && en.trim()) {
        out.push({ text_en: en.trim(), text_cn: typeof cn === 'string' ? cn.trim() : '' })
      }
    }
  }
  return out
}

export async function extractSentencePairs(file: File): Promise<ParsedSentence[]> {
  const name = file.name.toLowerCase()
  if (name.endsWith('.csv') || name.endsWith('.tsv')) return parseCsv(file)
  if (name.endsWith('.json')) return parseJson(file)
  if (name.endsWith('.docx')) return parseSentenceText(await docxToText(file))
  if (name.endsWith('.pdf')) return parseSentenceText(await pdfToText(file))
  return parseSentenceText(await file.text())
}

export async function ocrSentencePairs(
  file: File,
  onProgress: (value: number) => void,
): Promise<ParsedSentence[]> {
  const text = await ocrImage(file, onProgress)
  return parseSentenceText(text)
    .map((item) => ({ ...item, text_cn: '' }))
    .filter((item) => item.text_en.split(/\s+/).length >= 3)
}
