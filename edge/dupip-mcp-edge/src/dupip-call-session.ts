/**
 * Per-caller call session actor (phase 12).
 *
 * One instance per caller phone number. The platform guarantees a single
 * instance per name and one method call at a time — the read-modify-write
 * below needs no lock — and results are durable-before-reply
 * (docs: developers.telnyx.com/docs/edge-compute/stateful-actors).
 */

import { StatefulActor } from '@telnyx/edge-runtime'

export interface CallSessionState {
  callCount: number
  lastCallAt: number
  lastIntent: string | null
}

export class DupipCallSession extends StatefulActor {
  async recordCall(args: { callerKnown: boolean }): Promise<CallSessionState> {
    const current = await this.ctx.storage.get<CallSessionState>('state')
    const state: CallSessionState = current ?? { callCount: 0, lastCallAt: 0, lastIntent: null }

    state.callCount += 1
    state.lastCallAt = Date.now()
    // Example heuristic: every 5th call from a known caller is likely a
    // "check-in" — the workflow can personalize on call_count / lastIntent.
    if (args.callerKnown && state.callCount % 5 === 0) {
      state.lastIntent = 'check-in'
    }

    await this.ctx.storage.put('state', state)
    return state
  }
}
