export function keyMatches(eventKey: string, shortcut: string) {
  if (!shortcut) return false
  if (shortcut === 'Space') return eventKey === ' ' || eventKey === 'Spacebar'
  return eventKey.toLowerCase() === shortcut.toLowerCase()
}

type ShortcutEvent = Pick<KeyboardEvent, 'key' | 'ctrlKey' | 'metaKey' | 'altKey' | 'shiftKey'>

export function shortcutMatches(event: ShortcutEvent, shortcut: string) {
  if (!shortcut) return false
  const parts = shortcut.split('+').filter(Boolean)
  const key = parts.pop() || ''
  const modifiers = new Set(parts.map((part) => part.toLowerCase()))
  const wantsCtrl = modifiers.has('ctrl')
  const wantsMeta = modifiers.has('meta')
  const wantsAlt = modifiers.has('alt')
  const wantsShift = modifiers.has('shift')
  if (wantsCtrl && !(event.ctrlKey || event.metaKey)) return false
  if (wantsMeta && !event.metaKey) return false
  if (!wantsCtrl && !wantsMeta && (event.ctrlKey || event.metaKey)) return false
  if (wantsAlt !== event.altKey) return false
  if (wantsShift !== event.shiftKey) return false
  return keyMatches(event.key, key)
}

export function shortcutFromEvent(event: ShortcutEvent) {
  if (['Control', 'Meta', 'Alt', 'Shift'].includes(event.key)) return null
  const parts: string[] = []
  if (event.ctrlKey || event.metaKey) parts.push('Ctrl')
  if (event.altKey) parts.push('Alt')
  if (event.shiftKey) parts.push('Shift')
  const raw = event.key === ' ' ? 'Space' : event.key
  parts.push(raw.length === 1 ? raw.toUpperCase() : raw)
  return parts.join('+')
}

export function shortcutLabel(shortcut: string) {
  const labels: Record<string, string> = {
    Space: '空格',
    Enter: '回车',
    Escape: 'Esc',
    ArrowUp: '↑',
    ArrowDown: '↓',
    ArrowLeft: '←',
    ArrowRight: '→',
    Ctrl: 'Ctrl',
    Meta: '⌘',
    Alt: 'Alt',
    Shift: 'Shift',
  }
  return shortcut
    .split('+')
    .map((part) => labels[part] || part.toUpperCase())
    .join('+')
}
