import { useState } from 'react'
import { Volume2 } from 'lucide-react'
import { useSettings } from '@/lib/hooks'
import { speak } from '@/lib/tts'
import { cn } from '@/lib/utils'

export function SpeakButton({
  text,
  className,
  size = 18,
  accent,
  label,
}: {
  text: string
  className?: string
  size?: number
  accent?: string
  label?: string
}) {
  const { settings } = useSettings()
  const [playing, setPlaying] = useState(false)

  return (
    <button
      type="button"
      title={label || '朗读'}
      aria-label={label || '朗读'}
      onClick={(e) => {
        e.stopPropagation()
        e.preventDefault()
        setPlaying(true)
        const ok = speak(text, {
          accent: accent || settings.ttsAccent,
          rate: settings.ttsRate,
          onEnd: () => setPlaying(false),
          onError: () => setPlaying(false),
        })
        if (!ok) setPlaying(false)
        window.setTimeout(() => setPlaying(false), 6000)
      }}
      className={cn(
        'inline-grid place-items-center rounded-full text-muted transition-colors hover:bg-surface-2 hover:text-forest',
        playing && 'text-forest',
        className,
      )}
      style={{ width: size + 14, height: size + 14 }}
    >
      <Volume2 size={size} className={cn(playing && 'animate-pulse')} />
    </button>
  )
}
