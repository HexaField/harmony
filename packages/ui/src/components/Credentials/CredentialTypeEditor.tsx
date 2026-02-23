import { createSignal, For, Show, type JSX } from 'solid-js'
import type { CredentialTypeDef, SchemaField, IssuerPolicy } from '@harmony/credentials'

export interface CredentialTypeEditorProps {
  onSave: (def: CredentialTypeDef) => void
  onCancel: () => void
  existing?: CredentialTypeDef
}

export function useCredentialTypeEditor(props: CredentialTypeEditorProps) {
  const [name, setName] = createSignal(props.existing?.name ?? '')
  const [description, setDescription] = createSignal(props.existing?.description ?? '')
  const [fields, setFields] = createSignal<SchemaField[]>(props.existing?.schema.fields ?? [])
  const [issuerKind, setIssuerKind] = createSignal<IssuerPolicy['kind']>(
    props.existing?.issuerPolicy.kind ?? 'admin-only'
  )
  const [revocable, setRevocable] = createSignal(props.existing?.revocable ?? true)
  const [transferable, setTransferable] = createSignal(props.existing?.transferable ?? false)

  const addField = () => {
    setFields((prev) => [...prev, { name: '', type: 'string', required: true }])
  }

  const removeField = (index: number) => {
    setFields((prev) => prev.filter((_, i) => i !== index))
  }

  const updateField = (index: number, updates: Partial<SchemaField>) => {
    setFields((prev) => prev.map((f, i) => (i === index ? { ...f, ...updates } : f)))
  }

  const canSave = () => name().trim().length > 0

  const save = () => {
    if (!canSave()) return
    props.onSave({
      name: name().trim(),
      description: description().trim(),
      schema: { fields: fields() },
      issuerPolicy: { kind: issuerKind() },
      displayConfig: { showInMemberList: true, showOnMessages: true, priority: 0 },
      revocable: revocable(),
      transferable: transferable()
    })
  }

  return {
    name,
    setName,
    description,
    setDescription,
    fields,
    addField,
    removeField,
    updateField,
    issuerKind,
    setIssuerKind,
    revocable,
    setRevocable,
    transferable,
    setTransferable,
    canSave,
    save,
    cancel: () => props.onCancel(),
    fieldCount: () => fields().length,
    isEditing: () => !!props.existing
  }
}

export function CredentialTypeEditor(props: CredentialTypeEditorProps): JSX.Element {
  const ctrl = useCredentialTypeEditor(props)

  return (
    <div class="space-y-4 p-4 max-w-md">
      <h2 class="text-lg font-semibold text-white">{ctrl.isEditing() ? 'Edit' : 'New'} Credential Type</h2>

      <div class="space-y-3">
        <div>
          <label class="text-xs text-hm-text-muted block mb-1">Name</label>
          <input
            class="w-full bg-hm-bg-dark text-sm text-hm-text rounded px-3 py-2 outline-none"
            value={ctrl.name()}
            onInput={(e) => ctrl.setName(e.currentTarget.value)}
            placeholder="e.g., Verified Artist"
          />
        </div>

        <div>
          <label class="text-xs text-hm-text-muted block mb-1">Description</label>
          <textarea
            class="w-full bg-hm-bg-dark text-sm text-hm-text rounded px-3 py-2 outline-none resize-none h-16"
            value={ctrl.description()}
            onInput={(e) => ctrl.setDescription(e.currentTarget.value)}
          />
        </div>

        <div>
          <label class="text-xs text-hm-text-muted block mb-1">Issuer Policy</label>
          <select
            class="w-full bg-hm-bg-dark text-sm text-hm-text rounded px-3 py-2 outline-none"
            value={ctrl.issuerKind()}
            onChange={(e) => ctrl.setIssuerKind(e.currentTarget.value as IssuerPolicy['kind'])}
          >
            <option value="admin-only">Admin Only</option>
            <option value="role-based">Role Based</option>
            <option value="self-attest">Self Attest</option>
            <option value="peer-attest">Peer Attest</option>
          </select>
        </div>

        <div class="flex items-center gap-4">
          <label class="flex items-center gap-2 text-sm text-hm-text cursor-pointer">
            <input
              type="checkbox"
              checked={ctrl.revocable()}
              onChange={(e) => ctrl.setRevocable(e.currentTarget.checked)}
            />
            Revocable
          </label>
          <label class="flex items-center gap-2 text-sm text-hm-text cursor-pointer">
            <input
              type="checkbox"
              checked={ctrl.transferable()}
              onChange={(e) => ctrl.setTransferable(e.currentTarget.checked)}
            />
            Transferable
          </label>
        </div>

        <div>
          <div class="flex items-center justify-between mb-2">
            <label class="text-xs text-hm-text-muted">Schema Fields</label>
            <button class="text-xs text-hm-accent hover:underline" onClick={() => ctrl.addField()}>
              + Add Field
            </button>
          </div>
          <div class="space-y-2">
            <For each={ctrl.fields()}>
              {(field, index) => (
                <div class="flex items-center gap-2 bg-hm-bg-dark rounded p-2">
                  <input
                    class="flex-1 bg-hm-bg-darker text-xs text-hm-text rounded px-2 py-1 outline-none"
                    value={field.name}
                    onInput={(e) => ctrl.updateField(index(), { name: e.currentTarget.value })}
                    placeholder="Field name"
                  />
                  <select
                    class="bg-hm-bg-darker text-xs text-hm-text rounded px-2 py-1 outline-none"
                    value={field.type}
                    onChange={(e) => ctrl.updateField(index(), { type: e.currentTarget.value as SchemaField['type'] })}
                  >
                    <option value="string">String</option>
                    <option value="number">Number</option>
                    <option value="boolean">Boolean</option>
                    <option value="date">Date</option>
                    <option value="did">DID</option>
                    <option value="url">URL</option>
                  </select>
                  <button class="text-xs text-red-400" onClick={() => ctrl.removeField(index())}>
                    ✕
                  </button>
                </div>
              )}
            </For>
          </div>
        </div>
      </div>

      <div class="flex gap-2 justify-end pt-2">
        <button class="px-4 py-2 text-sm text-hm-text-muted hover:text-white" onClick={() => ctrl.cancel()}>
          Cancel
        </button>
        <button
          class="px-4 py-2 text-sm font-medium text-white bg-hm-accent rounded disabled:opacity-50"
          disabled={!ctrl.canSave()}
          onClick={() => ctrl.save()}
        >
          {ctrl.isEditing() ? 'Save' : 'Create'}
        </button>
      </div>
    </div>
  )
}
