import { create } from 'zustand'

export interface Toast {
  id: string
  message: string
  type: 'success' | 'error' | 'info'
}

interface UIState {
  searchOpen: boolean
  setSearchOpen: (open: boolean) => void
  aiPanelOpen: boolean
  setAiPanelOpen: (open: boolean) => void
  focusMode: boolean
  setFocusMode: (enabled: boolean) => void
  toasts: Toast[]
  pushToast: (message: string, type?: Toast['type']) => void
  removeToast: (id: string) => void
}

export const useUIStore = create<UIState>((set) => ({
  searchOpen: false,
  setSearchOpen: (open) => set({ searchOpen: open }),
  aiPanelOpen: false,
  setAiPanelOpen: (open) => set({ aiPanelOpen: open }),
  focusMode: false,
  setFocusMode: (enabled) => set({ focusMode: enabled }),
  toasts: [],
  pushToast: (message, type = 'success') => {
    const id = `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`
    set((state) => ({ toasts: [...state.toasts, { id, message, type }] }))
    window.setTimeout(() => {
      set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) }))
    }, 3200)
  },
  removeToast: (id) => set((state) => ({ toasts: state.toasts.filter((t) => t.id !== id) })),
}))

export function toast(message: string, type: Toast['type'] = 'success') {
  useUIStore.getState().pushToast(message, type)
}
