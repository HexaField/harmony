import type { ProposedAction, ExecutionResult } from './proposals.js'

export function executeActions(actions: ProposedAction[]): ExecutionResult {
  const result: ExecutionResult = {
    success: true,
    actionsExecuted: 0,
    actionsTotal: actions.length,
    errors: [],
    capabilitiesCreated: [],
    capabilitiesRevoked: []
  }

  for (const action of actions) {
    try {
      switch (action.kind) {
        case 'delegate-capability': {
          const capId = `zcap:cap-${Date.now()}-${result.actionsExecuted}`
          result.capabilitiesCreated!.push(capId)
          result.actionsExecuted++
          break
        }
        case 'revoke-capability': {
          const capId = action.params.capabilityId as string
          if (capId) result.capabilitiesRevoked!.push(capId)
          result.actionsExecuted++
          break
        }
        case 'create-role':
        case 'create-channel':
        case 'delete-channel':
        case 'update-rule':
        case 'update-constitution':
          result.actionsExecuted++
          break
        default:
          result.errors!.push(`Unknown action kind: ${action.kind}`)
      }
    } catch (err) {
      result.errors!.push(String(err))
      result.success = false
    }
  }

  if (result.errors!.length > 0 && result.actionsExecuted < result.actionsTotal) {
    result.success = false
  }

  return result
}
