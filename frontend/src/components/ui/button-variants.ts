/**
 * The button's tones, apart from the component so the recipe can be read
 * without the behaviour and shared without breaking fast refresh.
 */
import { cva } from 'class-variance-authority'

export const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 whitespace-nowrap rounded-md text-sm font-medium transition-all duration-200 cursor-pointer disabled:pointer-events-none disabled:opacity-40 disabled:cursor-not-allowed aria-disabled:opacity-40 aria-disabled:cursor-not-allowed focus-visible:outline-2 focus-visible:outline-offset-2 active:scale-[0.97] aria-disabled:active:scale-100 motion-reduce:active:scale-100',
  {
    variants: {
      variant: {
        // The one primary per task: the page's own ink, inverted. Material
        // (top light, drop, pressed inset) is `.btn-ink`.
        default:
          'btn-ink bg-foreground text-background font-semibold focus-visible:outline-foreground',
        // Secondaries share one neutral fill; a tool's accent shows through the
        // icon the call site passes, never the chrome.
        soft: 'bg-accent text-foreground not-aria-disabled:hover:bg-foreground/[0.10] focus-visible:outline-signal',
        // The consequence tier. Amber files an approval (always with
        // GitPullRequest), rose confirms a destruction, emerald is the
        // selected lens. The material is `.btn-glass`.
        'glass-emerald':
          'btn-glass [--glass-hue:var(--color-emerald-500)] [--glass-text:var(--color-glass-text-emerald)] font-semibold focus-visible:outline-emerald-500',
        'glass-amber':
          'btn-glass [--glass-hue:var(--color-amber-500)] [--glass-text:var(--color-glass-text-amber)] font-semibold focus-visible:outline-amber-500',
        'glass-rose':
          'btn-glass [--glass-hue:var(--color-rose-500)] [--glass-text:var(--color-glass-text-rose)] font-semibold focus-visible:outline-rose-500',
        ghost:
          'text-muted-foreground not-aria-disabled:hover:bg-accent not-aria-disabled:hover:text-foreground focus-visible:outline-signal',
        // Rose text for the inline control that only opens a destructive confirm.
        danger:
          'text-state-bad not-aria-disabled:hover:bg-state-bad-fill focus-visible:outline-state-bad',
      },
      // Two working heights: 32px in toolbars, 40px in forms and footers. `xs`
      // is the inline exception for a 40px row. Icon sizes are squares on the
      // same scale.
      size: {
        xs: 'h-7 px-2.5 text-xs',
        sm: 'h-8 px-3.5 text-xs',
        default: 'h-10 px-5',
        'icon-sm': 'h-7 w-7',
        icon: 'h-8 w-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
)

/** The variants that already say a press changes something. Every other tone
 *  declares `mutates`; `mutation-affordances.test.ts` reads this list. */
export const CONSEQUENCE_VARIANTS: readonly string[] = ['glass-amber', 'glass-rose', 'danger']

/** Whether a button changes something: what it declares, else what a submit
 *  or the consequence tier already says. */
export function buttonMutates(
  variant: string | null | undefined,
  type: string | undefined,
  mutates: boolean | undefined,
): boolean {
  return mutates ?? (type === 'submit' || CONSEQUENCE_VARIANTS.includes(variant ?? ''))
}
