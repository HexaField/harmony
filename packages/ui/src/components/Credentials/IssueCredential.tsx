import { createSignal, For, Show, type JSX } from 'solid-js'
import type { CredentialType } from '@harmony/credentials'

export interface IssueCredentialProps {
  credentialType: CredentialType
  onIssue: (subjectDID: string, fields: Record<string, unknown>) => void
  onCancel: () => void
}

export function useIssueCredential(props: IssueCredentialProps) {
  const [subjectDID, setSubjectDID] = createSignal('')
  const [fieldValues, setFieldValues] = createSignal<Record<string, unknown>>({})

  const updateField = (name: string, value: unknown) => {
    setFieldValues((prev) => ({ ...prev, [name]: value }))
  }

  const requiredFields = () => props.credentialType.def.schema.fields.filter((f) => f.required)

  const canIssue = () => {
    if (!subjectDID().trim()) return false
    for (const field of requiredFields()) {
      const val = fieldValues()[field.name]
      if (val === undefined || val === null || val === '') return false
    }
    return true
  }

  const issue = () => {
    if (!canIssue()) return
    props.onIssue(subjectDID().trim(), fieldValues())
  }

  return {
    typeName: () => props.credentialType.def.name,
    schemaFields: () => props.credentialType.def.schema.fields,
    subjectDID,
    setSubjectDID,
    fieldValues,
    updateField,
    canIssue,
    issue,
    cancel: () => props.onCancel(),
    requiredFieldCount: () => requiredFields().length
  }
}

export function IssueCredential(props: IssueCredentialProps): JSX.Element {
  const ctrl = useIssueCredential(props)

  return (
    <div class="space-y-4 p-4 max-w-md">
      <h2 class="text-lg font-semibold text-white">Issue: {ctrl.typeName()}</h2>

      <div>
        <label class="text-xs text-hm-text-muted block mb-1">Recipient DID</label>
        <input
          class="w-full bg-hm-bg-dark text-sm text-hm-text rounded px-3 py-2 outline-none placeholder-hm-text-muted"
          placeholder="did:key:z6Mk..."
          value={ctrl.subjectDID()}
          onInput={(e) => ctrl.setSubjectDID(e.currentTarget.value)}
        />
      </div>

      <Show when={ctrl.schemaFields().length > 0}>
        <div class="space-y-3">
          <p class="text-xs font-medium text-hm-text-muted uppercase tracking-wider">Fields</p>
          <For each={ctrl.schemaFields()}>
            {(field) => (
              <div>
                <label class="text-xs text-hm-text-muted block mb-1">
                  {field.name}
                  {field.required && <span class="text-red-400 ml-1">*</span>}
                </label>
                {field.type === 'boolean' ? (
                  <label class="flex items-center gap-2 text-sm text-hm-text cursor-pointer">
                    <input
                      type="checkbox"
                      checked={!!ctrl.fieldValues()[field.name]}
                      onChange={(e) => ctrl.updateField(field.name, e.currentTarget.checked)}
                    />
                    {field.description ?? field.name}
                  </label>
                ) : field.type === 'number' ? (
                  <input
                    type="number"
                    class="w-full bg-hm-bg-dark text-sm text-hm-text rounded px-3 py-2 outline-none"
                    value={String(ctrl.fieldValues()[field.name] ?? '')}
                    onInput={(e) => ctrl.updateField(field.name, parseFloat(e.currentTarget.value))}
                  />
                ) : (
                  <input
                    type={field.type === 'date' ? 'date' : field.type === 'url' ? 'url' : 'text'}
                    class="w-full bg-hm-bg-dark text-sm text-hm-text rounded px-3 py-2 outline-none"
                    value={String(ctrl.fieldValues()[field.name] ?? '')}
                    onInput={(e) => ctrl.updateField(field.name, e.currentTarget.value)}
                    placeholder={field.description}
                  />
                )}
              </div>
            )}
          </For>
        </div>
      </Show>

      <div class="flex gap-2 justify-end pt-2">
        <button class="px-4 py-2 text-sm text-hm-text-muted hover:text-white" onClick={() => ctrl.cancel()}>
          Cancel
        </button>
        <button
          class="px-4 py-2 text-sm font-medium text-white bg-green-600 rounded disabled:opacity-50"
          disabled={!ctrl.canIssue()}
          onClick={() => ctrl.issue()}
        >
          Issue Credential
        </button>
      </div>
    </div>
  )
}
