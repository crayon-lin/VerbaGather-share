const MAX_SOURCE_BYTES = 20 * 1024 * 1024
const MAX_DATA_URL_LENGTH = 4_500_000

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image()
    img.onload = () => resolve(img)
    img.onerror = () => reject(new Error('图片读取失败，请换一张试试'))
    img.src = src
  })
}

/**
 * 把本地图片压缩成适合存入设置的 data URL。
 * 背景图只用于本机展示，限制长边 1920、优先 WebP，避免备份和接口过大。
 */
export async function fileToBackgroundDataUrl(file: File): Promise<string> {
  if (!file.type.startsWith('image/')) throw new Error('请选择图片文件')
  if (file.size > MAX_SOURCE_BYTES) throw new Error('图片不能超过 20 MB')

  const objectUrl = URL.createObjectURL(file)
  try {
    const img = await loadImage(objectUrl)
    const sourceWidth = img.naturalWidth || img.width
    const sourceHeight = img.naturalHeight || img.height
    if (!sourceWidth || !sourceHeight) throw new Error('图片尺寸读取失败')

    const maxSide = 1920
    const scale = Math.min(1, maxSide / Math.max(sourceWidth, sourceHeight))
    const width = Math.max(1, Math.round(sourceWidth * scale))
    const height = Math.max(1, Math.round(sourceHeight * scale))

    const canvas = document.createElement('canvas')
    canvas.width = width
    canvas.height = height
    const ctx = canvas.getContext('2d')
    if (!ctx) throw new Error('当前浏览器无法处理图片')
    ctx.drawImage(img, 0, 0, width, height)

    let dataUrl = canvas.toDataURL('image/webp', 0.82)
    if (!dataUrl.startsWith('data:image/webp')) {
      dataUrl = canvas.toDataURL('image/jpeg', 0.82)
    }
    if (dataUrl.length > MAX_DATA_URL_LENGTH) {
      dataUrl = canvas.toDataURL('image/webp', 0.68)
      if (!dataUrl.startsWith('data:image/webp')) {
        dataUrl = canvas.toDataURL('image/jpeg', 0.68)
      }
    }
    if (dataUrl.length > MAX_DATA_URL_LENGTH) {
      throw new Error('图片压缩后仍然过大，请换一张尺寸小一些的图片')
    }
    return dataUrl
  } finally {
    URL.revokeObjectURL(objectUrl)
  }
}
