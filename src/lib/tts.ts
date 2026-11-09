let voices: SpeechSynthesisVoice[] = []
let listening = false

export function speechSupported() {
  return typeof window !== 'undefined' && 'speechSynthesis' in window
}

function refreshVoices() {
  if (!speechSupported()) return
  voices = window.speechSynthesis.getVoices()
}

export function initSpeech() {
  if (!speechSupported() || listening) return
  listening = true
  refreshVoices()
  window.speechSynthesis.addEventListener('voiceschanged', refreshVoices)
}

export function englishVoices(accent?: string) {
  const list = voices.filter((v) => v.lang.toLowerCase().startsWith('en'))
  if (!accent) return list
  const exact = list.filter((v) => v.lang.toLowerCase().replace('_', '-') === accent.toLowerCase())
  return exact.length ? exact : list
}

const PREFERRED: Record<string, string[]> = {
  'en-US': ['aria', 'jenny', 'guy', 'samantha', 'alex', 'google us english', 'zira', 'david'],
  'en-GB': ['libby', 'ryan', 'sonia', 'daniel', 'google uk english', 'hazel', 'george'],
}

function pickVoice(accent: string) {
  const list = englishVoices(accent)
  const prefer = PREFERRED[accent] || []
  for (const key of prefer) {
    const hit = list.find((v) => v.name.toLowerCase().includes(key))
    if (hit) return hit
  }
  const natural = list.find((v) => /natural|online/i.test(v.name))
  return natural || list[0] || null
}

export interface SpeakOptions {
  accent?: string
  rate?: number
  onEnd?: () => void
  onError?: () => void
}

export function speak(text: string, options: SpeakOptions = {}) {
  if (!speechSupported() || !text.trim()) return false
  const accent = options.accent || 'en-US'
  const synth = window.speechSynthesis
  if (!voices.length) refreshVoices()
  // 只有确实有语音在播放时才 cancel，避免每次朗读都先触发一次取消延迟。
  if (synth.speaking || synth.pending) synth.cancel()
  if (synth.paused) synth.resume()
  const utterance = new SpeechSynthesisUtterance(text)
  utterance.lang = accent
  utterance.rate = Math.min(1.4, Math.max(0.5, options.rate ?? 0.95))
  const voice = pickVoice(accent)
  if (voice) utterance.voice = voice
  if (options.onEnd) utterance.onend = options.onEnd
  if (options.onError) utterance.onerror = options.onError
  synth.speak(utterance)
  return true
}

export function stopSpeaking() {
  if (speechSupported()) window.speechSynthesis.cancel()
}

export function currentVoiceLabel(accent: string) {
  const voice = pickVoice(accent)
  return voice ? voice.name : '系统默认语音'
}
