import { useRender } from '@base-ui/react/use-render'
import type { VariantProps } from 'class-variance-authority'
import * as React from 'react'
import { useWritesBlocked, WRITES_BLOCKED_REASON } from '@/features/auth/view-as'
import { toast } from '@/lib/toast'
import { cn } from '@/lib/utils'
import { buttonMutates, buttonVariants } from './button-variants'
import { ACTIVATION_KEYS, Hint, refuseActivationKey, refusePress } from './hint'

export interface ButtonProps
  extends
    Omit<React.ButtonHTMLAttributes<HTMLButtonElement>, 'title'>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean
  /**
   * Whether pressing this changes something. Defaults to what the variant or a
   * submit already declares. Under a view-as it is what the shell refuses on
   * its own: the grants on screen allow it, the lens does not.
   */
  mutates?: boolean
  /** What the button is for, or why it is disabled, on hover and focus.
   *  Under a view-as it says the refusal instead. */
  hint?: string | null
  ref?: React.Ref<HTMLButtonElement>
}

/** One id for the refusal, so leaning on Enter says it once. */
const REFUSAL_TOAST_ID = 'writes-blocked'

/**
 * Everything the refusal owns on the element that receives the event, spread
 * after the call site's own props: a caller cannot hand back, through a
 * capture handler or `aria-disabled`, the authority the lens took away.
 */
const REFUSED = {
  'aria-disabled': true,
  onClick: undefined,
  onClickCapture: refusePress,
  onKeyDown: undefined,
  onKeyDownCapture: refuseActivationKey,
  onPointerDown: undefined,
  onPointerDownCapture: undefined,
} as const

/** The `asChild` child with every path to its own handlers removed: its
 *  handlers would run beside the guard's, so the guard must be the only one. */
function withoutActivation(child: React.ReactElement): React.ReactElement {
  return React.cloneElement(child as React.ReactElement<React.DOMAttributes<HTMLElement>>, {
    onClick: undefined,
    onClickCapture: undefined,
    onKeyDown: undefined,
    onKeyDownCapture: undefined,
    onPointerDown: undefined,
    onPointerDownCapture: undefined,
  })
}

/**
 * Refusing the press is not refusing the form: a form with one text field
 * submits on Enter with no button in the path. So the refusal sits on the
 * owning form too, in the capture phase, before the call site's `onSubmit`.
 */
function useRefusedForm(button: React.RefObject<HTMLButtonElement | null>, blocked: boolean) {
  React.useEffect(() => {
    if (!blocked) return
    const node = button.current
    const form = node?.form ?? node?.closest('form')
    if (!form) return
    const refuse = (event: Event) => {
      event.preventDefault()
      event.stopPropagation()
      toast.error(WRITES_BLOCKED_REASON, { id: REFUSAL_TOAST_ID })
    }
    form.addEventListener('submit', refuse, true)
    return () => form.removeEventListener('submit', refuse, true)
  }, [button, blocked])
}

export function Button(props: ButtonProps) {
  const {
    className,
    variant,
    size,
    asChild = false,
    mutates,
    hint,
    type,
    children,
    ref,
    ...rest
  } = props
  const blocked = useWritesBlocked() && buttonMutates(variant, type, mutates)
  const [hintOpen, setHintOpen] = React.useState(false)
  const element = React.useRef<HTMLButtonElement>(null)
  React.useImperativeHandle(ref, () => element.current as HTMLButtonElement, [])
  useRefusedForm(element, blocked)

  // A refused key never reaches the click a hint closes on, so its release does.
  const closeOnRefusedKey = blocked
    ? {
        onKeyUp: (event: React.KeyboardEvent) => {
          if (ACTIVATION_KEYS.includes(event.key)) setHintOpen(false)
        },
      }
    : null

  // `asChild` lends everything to the one child element, whose own props win
  // except for handlers, which both run.
  const lent = asChild && React.isValidElement(children) ? children : null
  const button = useRender({
    defaultTagName: 'button',
    render: lent && blocked ? withoutActivation(lent) : (lent ?? undefined),
    ref: element,
    props: {
      type,
      className: cn(buttonVariants({ variant, size, className })),
      ...closeOnRefusedKey,
      ...rest,
      ...(blocked ? REFUSED : null),
      children: lent ? undefined : children,
    },
  })

  // A call site that gives a hint keeps the trigger for its lifetime, even
  // while it has nothing to say, so a reason that comes and goes never swaps
  // the button out from under the pointer.
  if (!('hint' in props) && !blocked) return button
  return (
    <Hint
      label={blocked ? WRITES_BLOCKED_REASON : hint}
      wrap
      open={hintOpen}
      onOpenChange={setHintOpen}
    >
      {button}
    </Hint>
  )
}
