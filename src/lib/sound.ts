let audioContext: AudioContext | null = null

function getAudioContext(): AudioContext | null {
  if (typeof window === 'undefined') return null
  const Ctor =
    window.AudioContext ||
    (window as typeof window & { webkitAudioContext?: typeof AudioContext }).webkitAudioContext
  if (!Ctor) return null
  if (!audioContext) audioContext = new Ctor()
  return audioContext
}

type Tone = {
  frequency: number
  start: number
  duration: number
  type?: OscillatorType
  volume?: number
}

function playTones(tones: Tone[]) {
  const ctx = getAudioContext()
  if (!ctx) return
  const schedule = () => {
    const base = ctx.currentTime + 0.01
    for (const tone of tones) {
      const oscillator = ctx.createOscillator()
      const gain = ctx.createGain()
      const start = base + tone.start
      const end = start + tone.duration
      oscillator.type = tone.type || 'sine'
      oscillator.frequency.setValueAtTime(tone.frequency, start)
      gain.gain.setValueAtTime(0.0001, start)
      gain.gain.exponentialRampToValueAtTime(tone.volume ?? 0.055, start + 0.012)
      gain.gain.exponentialRampToValueAtTime(0.0001, end)
      oscillator.connect(gain)
      gain.connect(ctx.destination)
      oscillator.start(start)
      oscillator.stop(end + 0.02)
    }
  }
  if (ctx.state === 'suspended') {
    void ctx.resume().then(schedule).catch(() => {})
  } else {
    schedule()
  }
}

/** 答对：两个向上的轻快音符。 */
export function playCorrectSound() {
  playTones([
    { frequency: 659.25, start: 0, duration: 0.12, volume: 0.05 },
    { frequency: 880, start: 0.09, duration: 0.16, volume: 0.045 },
  ])
}

/** 答错：两个低而短的下行音符，不刺耳。 */
export function playWrongSound() {
  playTones([
    { frequency: 196, start: 0, duration: 0.16, type: 'triangle', volume: 0.045 },
    { frequency: 155.56, start: 0.12, duration: 0.2, type: 'triangle', volume: 0.04 },
  ])
}
