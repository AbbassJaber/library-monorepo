import type { ConfirmActionResponse } from '@library/contracts';
import { PendingActionStatus } from '@library/contracts';
import { verifyConfirmToken } from '../safety/confirmToken.js';
import { clip } from '../safety/untrusted.js';
import { TEXT } from './agentText.js';
import type { AgentContext, AgentDeps } from './agentTypes.js';

export type ConfirmErrorCode = 'INVALID_TOKEN' | 'EXPIRED' | 'WRONG_ACTOR' | 'ALREADY_DECIDED';

export const CONFIRM_ERROR_STATUS: Record<ConfirmErrorCode, number> = {
  INVALID_TOKEN: 401,
  EXPIRED: 401,
  WRONG_ACTOR: 403,
  ALREADY_DECIDED: 409,
};

export class ConfirmError extends Error {
  override readonly name = 'ConfirmError';
  constructor(
    readonly code: ConfirmErrorCode,
    message: string
  ) {
    super(message);
  }

  get status(): number {
    return CONFIRM_ERROR_STATUS[this.code];
  }
}

export const confirmAction = async (
  deps: Pick<AgentDeps, 'ports' | 'registry' | 'confirmSecret'>,
  ctx: AgentContext,
  input: { token: string; decision?: 'confirm' | 'cancel' }
): Promise<ConfirmActionResponse> => {
  const verified = verifyConfirmToken(deps.confirmSecret, input.token, ctx.actor.id);
  if (!verified.ok) {
    if (verified.reason === 'wrong-actor')
      throw new ConfirmError('WRONG_ACTOR', 'This action belongs to another user');
    if (verified.reason === 'expired')
      throw new ConfirmError('EXPIRED', 'This action has expired; ask again');
    throw new ConfirmError('INVALID_TOKEN', 'Invalid confirmation token');
  }
  const { actionId, tool, input: toolInput } = verified.payload;
  if (!actionId) throw new ConfirmError('INVALID_TOKEN', 'Invalid confirmation token');
  const decision: PendingActionStatus =
    input.decision === 'cancel'
      ? PendingActionStatus.enum.cancelled
      : PendingActionStatus.enum.confirmed;
  const action = await deps.ports.pendingActions.decide(actionId, ctx.actor.id, decision);
  if (!action || action.tool !== tool)
    throw new ConfirmError('ALREADY_DECIDED', 'This action was already confirmed or cancelled');
  const t = TEXT[action.locale];
  if (decision === PendingActionStatus.enum.cancelled)
    return {
      status: PendingActionStatus.enum.cancelled,
      actionId,
      tool,
      summary: action.summary,
      message: { role: 'assistant', content: t.cancelled(action.summary) },
    };
  try {
    const result = await deps.registry.call(
      { actor: ctx.actor, ports: deps.ports, requestId: ctx.requestId },
      tool,
      toolInput
    );
    await deps.ports.pendingActions.finish(actionId, { ok: true });
    return {
      status: PendingActionStatus.enum.confirmed,
      actionId,
      tool,
      summary: action.summary,
      result,
      message: { role: 'assistant', content: t.confirmed(action.summary) },
    };
  } catch (error) {
    await deps.ports.pendingActions.finish(actionId, {
      ok: false,
      error: clip(String((error as Error).message ?? error), 300),
    });
    throw error;
  }
};
