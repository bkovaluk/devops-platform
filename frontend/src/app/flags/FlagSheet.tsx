/**
 * Create a flag, or change one, in one environment. Everything goes through
 * the approval-aware `useFlagActions`; the sheet only says, before anyone
 * presses submit, which way the change will go: where it applies directly the
 * submit reads "Save to dev", and where it becomes a request the submit turns
 * amber, carries the pull-request mark and reads "Request approval for
 * staging", with a callout saying a teammate has to approve it.
 *
 * The target environment is captured when the sheet opens. Closing with
 * unsaved changes asks first.
 */
import { useNavigate } from '@tanstack/react-router'
import { GitPullRequest, Save } from 'lucide-react'
import { useId, useState } from 'react'
import { Button } from '@/components/ui/button'
import { EnvSignal } from '@/components/ui/env-signal'
import { Field, Input, Textarea } from '@/components/ui/input'
import { Sheet } from '@/components/ui/sheet'
import { Switch } from '@/components/ui/switch'
import { inEnv } from '@/features/auth/permissions'
import { useScopes } from '@/features/auth/use-scopes'
import { useEnvironments } from '@/features/config/use-config'
import { useFlagActions } from '@/features/flags/use-flag-actions'
import type { Flag, FlagCreate, FlagUpdate } from '@/types/api'
import { FLAG_KEY_PATTERN } from './flag-words'

type FlagSheetProps =
  | { mode: 'create'; open: boolean; onOpenChange: (open: boolean) => void; defaultEnv: string }
  | { mode: 'edit'; open: boolean; onOpenChange: (open: boolean) => void; flag: Flag }

interface Draft {
  key: string
  env: string
  enabled: boolean
  rollout: string
  description: string
  owner: string
}

function draftOf(props: FlagSheetProps, environments: readonly string[]): Draft {
  if (props.mode === 'edit') {
    const { flag } = props
    return {
      key: flag.key,
      env: flag.env,
      enabled: flag.enabled,
      rollout: String(flag.rollout_percent),
      description: flag.description,
      owner: flag.owner,
    }
  }
  const env = environments.includes(props.defaultEnv) ? props.defaultEnv : (environments[0] ?? '')
  return { key: '', env, enabled: false, rollout: '0', description: '', owner: '' }
}

function problems(draft: Draft, mode: FlagSheetProps['mode']) {
  const rollout = Number(draft.rollout)
  return {
    key:
      mode === 'create' && !FLAG_KEY_PATTERN.test(draft.key)
        ? 'Lower case letters, digits, dot, dash or underscore; 2 to 63 characters.'
        : null,
    rollout:
      !Number.isInteger(rollout) || rollout < 0 || rollout > 100
        ? 'A whole number from 0 to 100.'
        : null,
    owner: draft.owner.trim() ? null : 'Somebody has to own it.',
  }
}

export function FlagSheet(props: FlagSheetProps) {
  // Mounted only while open, so every opening starts from the record as it is now.
  return props.open ? <OpenFlagSheet {...props} /> : null
}

function OpenFlagSheet(props: FlagSheetProps) {
  const { can } = useScopes()
  // A flag can be created only where the principal may write one.
  const environments = useEnvironments().filter((env) => can(inEnv('flags', 'write', env)))
  const actions = useFlagActions()
  const navigate = useNavigate()
  const formId = useId()
  const [initial] = useState(() => draftOf(props, environments))
  const [draft, setDraft] = useState(initial)
  const [confirmingDiscard, setConfirmingDiscard] = useState(false)
  const [touched, setTouched] = useState(false)

  const set = <K extends keyof Draft>(field: K, value: Draft[K]) =>
    setDraft((current) => ({ ...current, [field]: value }))
  const dirty = JSON.stringify(draft) !== JSON.stringify(initial)
  const errors = problems(draft, props.mode)
  const invalid = Object.values(errors).some(Boolean)
  const routed = actions.needsApproval(draft.env)
  const ids = {
    key: `${formId}-key`,
    env: `${formId}-env`,
    enabled: `${formId}-enabled`,
    rollout: `${formId}-rollout`,
    description: `${formId}-description`,
    owner: `${formId}-owner`,
  }

  const close = () => props.onOpenChange(false)
  const requestClose = () => (dirty ? setConfirmingDiscard(true) : close())

  const submit = async () => {
    setTouched(true)
    if (invalid || actions.isPending) return
    const rollout = Number(draft.rollout)
    if (props.mode === 'create') {
      const body: FlagCreate = {
        key: draft.key,
        description: draft.description.trim(),
        enabled: draft.enabled,
        rollout_percent: rollout,
        owner: draft.owner.trim(),
      }
      const result = await actions.create(draft.env, body).catch(() => null)
      if (!result) return
      close()
      if (result.applied) {
        void navigate({
          to: '/flags/$env/$key',
          params: { env: draft.env, key: draft.key },
          viewTransition: true,
        })
      }
      return
    }
    const body: FlagUpdate = {}
    if (draft.enabled !== initial.enabled) body.enabled = draft.enabled
    if (rollout !== Number(initial.rollout)) body.rollout_percent = rollout
    if (draft.description !== initial.description) body.description = draft.description.trim()
    if (draft.owner !== initial.owner) body.owner = draft.owner.trim()
    const result = await actions.update(draft.key, draft.env, body).catch(() => null)
    if (result) close()
  }

  const verb = props.mode === 'create' ? 'Create in' : 'Save to'

  return (
    <Sheet
      open
      onOpenChange={(open) => !open && requestClose()}
      title={props.mode === 'create' ? 'New flag' : `Edit ${props.flag.key}`}
      description={
        <span className="flex items-center gap-1.5">
          Changes apply to <EnvSignal env={draft.env} />
        </span>
      }
      footer={
        confirmingDiscard ? (
          <div className="flex items-center justify-between gap-3">
            <p className="text-sm text-foreground">Discard your changes?</p>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setConfirmingDiscard(false)}>
                Keep editing
              </Button>
              <Button variant="glass-rose" mutates={false} onClick={close}>
                Discard
              </Button>
            </div>
          </div>
        ) : (
          <>
            {routed && (
              <div
                role="note"
                className="flex items-start gap-2 rounded-md bg-state-warn-fill px-3 py-2 text-xs text-state-warn"
              >
                <GitPullRequest aria-hidden="true" className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                <p>
                  This becomes a request for {draft.env}. A teammate reviews it in Approvals, and
                  nothing changes in {draft.env} until they approve it.
                </p>
              </div>
            )}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={requestClose}>
                Cancel
              </Button>
              <Button
                type="submit"
                form={formId}
                variant={routed ? 'glass-amber' : 'default'}
                disabled={
                  actions.isPending || (props.mode === 'edit' && !dirty) || (touched && invalid)
                }
                hint={props.mode === 'edit' && !dirty ? 'Nothing has changed yet' : undefined}
              >
                {routed ? (
                  <GitPullRequest aria-hidden="true" className="h-4 w-4" />
                ) : (
                  <Save aria-hidden="true" className="h-4 w-4" />
                )}
                {routed ? `Request approval for ${draft.env}` : `${verb} ${draft.env}`}
              </Button>
            </div>
          </>
        )
      }
    >
      <form
        id={formId}
        noValidate
        className="flex flex-col gap-5"
        onSubmit={(event) => {
          event.preventDefault()
          void submit()
        }}
      >
        {props.mode === 'create' && (
          <>
            <Field
              label="Key"
              htmlFor={ids.key}
              help="How code asks for it."
              error={touched ? errors.key : null}
            >
              <Input
                id={ids.key}
                value={draft.key}
                aria-invalid={touched && errors.key ? true : undefined}
                onChange={(event) => set('key', event.target.value.toLowerCase())}
                placeholder="checkout-v2"
                className="font-mono text-label"
              />
            </Field>
            <Field label="Environment" htmlFor={ids.env}>
              <select
                id={ids.env}
                value={draft.env}
                onChange={(event) => set('env', event.target.value)}
                className="h-10 w-full rounded-md bg-well px-3 font-mono text-label text-foreground outline-none focus-visible:outline-2 focus-visible:outline-signal"
              >
                {environments.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            </Field>
          </>
        )}
        <div className="flex items-center justify-between gap-4 rounded-lg bg-well px-3 py-3">
          <label htmlFor={ids.enabled} className="flex flex-col gap-0.5">
            <span className="text-sm text-foreground">Enabled</span>
            <span className="text-xs text-dim-foreground">Off answers false to everyone.</span>
          </label>
          <Switch
            id={ids.enabled}
            checked={draft.enabled}
            onCheckedChange={(value) => set('enabled', value)}
          />
        </div>
        <Field
          label="Rollout percent"
          htmlFor={ids.rollout}
          help="The share of evaluations that answer true while enabled."
          error={touched ? errors.rollout : null}
        >
          <div className="flex items-center gap-3">
            <input
              type="range"
              min={0}
              max={100}
              step={1}
              aria-label="Rollout percent slider"
              value={Number(draft.rollout) || 0}
              onChange={(event) => set('rollout', event.target.value)}
              className="h-1 flex-1 cursor-pointer accent-[var(--signal)]"
            />
            <Input
              id={ids.rollout}
              inputMode="numeric"
              value={draft.rollout}
              aria-invalid={touched && errors.rollout ? true : undefined}
              onChange={(event) => set('rollout', event.target.value.replace(/[^0-9]/g, ''))}
              className="w-20 text-right font-mono tabular-nums"
            />
          </div>
        </Field>
        <Field label="Description" htmlFor={ids.description}>
          <Textarea
            id={ids.description}
            value={draft.description}
            onChange={(event) => set('description', event.target.value)}
            placeholder="What turning it on changes"
          />
        </Field>
        <Field label="Owner" htmlFor={ids.owner} error={touched ? errors.owner : null}>
          <Input
            id={ids.owner}
            value={draft.owner}
            aria-invalid={touched && errors.owner ? true : undefined}
            onChange={(event) => set('owner', event.target.value)}
            placeholder="team-or-person@example.com"
          />
        </Field>
      </form>
    </Sheet>
  )
}
