import { useEffect, useRef, useState } from 'react'

/**
 * "Copy, then show a check for a moment." The one clipboard path in the app:
 * every copy control is built on this, never on its own clipboard call.
 */
export function useCopy(
  value: string,
  resetMs = 2000,
): {
  copied: boolean
  /** Resolves true only when the clipboard actually took the value. */
  copy: () => Promise<boolean>
} {
  const [copied, setCopied] = useState(false)
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current)
    },
    [],
  )

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(value)
    } catch {
      // No clipboard (an insecure origin, a denied permission): nothing was copied.
      return false
    }
    setCopied(true)
    if (timer.current) clearTimeout(timer.current)
    timer.current = setTimeout(() => setCopied(false), resetMs)
    return true
  }

  return { copied, copy }
}
