import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { api } from './api'
import { DEFAULT_SETTINGS, type Settings } from '@shared/types'

export function useSettings() {
  const query = useQuery({ queryKey: ['settings'], queryFn: api.settings, staleTime: 60_000 })
  const settings: Settings = query.data?.settings ?? DEFAULT_SETTINGS
  return { settings, isLoading: query.isLoading, query }
}

export function useUpdateSettings() {
  const queryClient = useQueryClient()
  return useMutation({
    mutationFn: (patch: Partial<Settings>) => api.saveSettings(patch),
    onSuccess: (data) => {
      queryClient.setQueryData(['settings'], data)
      queryClient.invalidateQueries({
        predicate: (query) => query.queryKey[0] !== 'settings',
      })
    },
  })
}

export function useLevel() {
  const { settings } = useSettings()
  return settings.level
}
