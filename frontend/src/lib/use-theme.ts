import { useEffect } from 'react'
import { type Theme, useUIStore } from '@/stores/ui-store'

export function resolveTheme(theme: Theme): 'dark' | 'light' {
  if (theme !== 'system') return theme
  return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'
}

/**
 * Keeps the class on <html> in step with the chosen theme, and with the OS
 * while the choice is "system". The first paint is the inline script in
 * index.html, which reads the same persisted value before React loads.
 */
export function useThemeEffect(): void {
  const theme = useUIStore((state) => state.theme)

  useEffect(() => {
    const apply = () => {
      const root = document.documentElement
      root.classList.remove('dark', 'light')
      root.classList.add(resolveTheme(theme))
    }
    apply()
    if (theme !== 'system') return
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    media.addEventListener('change', apply)
    return () => media.removeEventListener('change', apply)
  }, [theme])
}
