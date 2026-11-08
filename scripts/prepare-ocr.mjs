import fs from 'node:fs'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const root = path.resolve(fileURLToPath(new URL('..', import.meta.url)))
const pub = path.join(root, 'public')
const ocr = path.join(pub, 'ocr')
const lang = path.join(ocr, 'lang')
fs.mkdirSync(lang, { recursive: true })

function copy(from, to, label) {
  const src = path.join(root, from)
  if (!fs.existsSync(src)) {
    console.warn(`[ocr] 缺少 ${from}，跳过`)
    return
  }
  fs.copyFileSync(src, path.join(pub, to))
  console.log(`[ocr] ${label || to}`)
}

copy('node_modules/tesseract.js/dist/worker.min.js', 'ocr/worker.min.js', 'worker.min.js')
copy(
  'node_modules/tesseract.js-core/tesseract-core-simd-lstm.wasm.js',
  'ocr/tesseract-core-simd-lstm.wasm.js',
  'tesseract core (simd lstm)',
)
copy(
  'node_modules/tesseract.js-core/tesseract-core-lstm.wasm.js',
  'ocr/tesseract-core-lstm.wasm.js',
  'tesseract core (lstm fallback)',
)
copy(
  'node_modules/@tesseract.js-data/eng/4.0.0_best_int/eng.traineddata.gz',
  'ocr/lang/eng.traineddata.gz',
  'eng traineddata',
)
copy('node_modules/pdfjs-dist/build/pdf.worker.min.mjs', 'pdf.worker.min.mjs', 'pdf worker')

console.log('[ocr] 资源已就绪')
