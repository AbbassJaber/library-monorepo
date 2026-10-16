import { CHAT_HISTORY_MAX, apiPaths } from '@library/contracts';
import type {
  ChatBody,
  ChatContext,
  ChatLocale,
  ChatResponse,
  ConfirmActionBody,
  ConfirmActionResponse,
} from '@library/contracts';
import { api } from '@/lib/api';
import type { ChatEntry } from '@/stores/chatStore';

export const MESSAGE_MAX = 4000;

export const historyOf = (entries: ChatEntry[], text: string): ChatBody['messages'] =>
  [
    ...entries
      .filter(entry => !entry.notice && entry.content.trim().length > 0)
      .map(entry => ({ role: entry.role, content: entry.content })),
    { role: 'user' as const, content: text },
  ].slice(-CHAT_HISTORY_MAX);

export const sendChat = (
  messages: ChatBody['messages'],
  locale: ChatLocale,
  context?: ChatContext | undefined
) =>
  api.post<ChatResponse>(apiPaths.ai.chat, {
    messages,
    locale,
    ...(context ? { context } : {}),
  } satisfies ChatBody);

export const decideAction = (token: string, decision: 'confirm' | 'cancel') =>
  api
    .post<ConfirmActionResponse>(
      decision === 'confirm' ? apiPaths.ai.confirmAction : apiPaths.ai.cancelAction,
      { token } satisfies ConfirmActionBody
    )
    .then(r => r.data);
