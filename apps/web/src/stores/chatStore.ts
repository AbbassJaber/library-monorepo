import type { Citation, PendingAction, VoiceEndReason } from '@library/contracts';
import { create } from 'zustand';

export type ActionState = 'pending' | 'working' | 'confirmed' | 'cancelled' | 'failed';

export interface ChatEntry {
  id: number;
  role: 'user' | 'assistant';
  content: string;
  citations?: Citation[];
  notice?: boolean;
  voice?: boolean;
  speculative?: boolean;
  action?: {
    pending: PendingAction;
    state: ActionState;
    error?: string;
    decidedAt?: string;
  };
  callId?: number;
  call?: CallRecord;
}

export interface CallRecord {
  id: number;
  startedAt: number;
  durationSeconds: number;
  reason: VoiceEndReason;
}

export interface ChatBookContext {
  bookId: number;
  title: string;
}

interface ChatState {
  open: boolean;
  entries: ChatEntry[];
  draft: string | null;
  context: ChatBookContext | null;
  setOpen: (open: boolean) => void;
  openWithDraft: (draft: string, context?: ChatBookContext) => void;
  setContext: (context: ChatBookContext | null) => void;
  takeDraft: () => string | null;
  add: (entry: Omit<ChatEntry, 'id'>) => number;
  update: (id: number, patch: Partial<Omit<ChatEntry, 'id'>>) => void;
  remove: (id: number) => void;
  setActionState: (
    id: number,
    state: ActionState,
    extra?: { error?: string; decidedAt?: string }
  ) => void;
  reset: () => void;
}

let nextId = 1;

export const useChatStore = create<ChatState>()((set, get) => ({
  open: false,
  entries: [],
  draft: null,
  context: null,
  setOpen: open => set({ open }),
  openWithDraft: (draft, context) =>
    set(state => ({ open: true, draft, context: context ?? state.context })),
  setContext: context => set({ context }),
  takeDraft: () => {
    const { draft } = get();
    if (draft !== null) set({ draft: null });
    return draft;
  },

  add: entry => {
    const id = nextId++;
    set(state => ({ entries: [...state.entries, { ...entry, id }] }));
    return id;
  },
  update: (id, patch) =>
    set(state => ({
      entries: state.entries.map(entry => (entry.id === id ? { ...entry, ...patch } : entry)),
    })),
  remove: id => set(state => ({ entries: state.entries.filter(entry => entry.id !== id) })),
  setActionState: (id, actionState, extra) =>
    set(state => ({
      entries: state.entries.map(entry =>
        entry.id === id && entry.action
          ? {
              ...entry,
              action: {
                ...entry.action,
                state: actionState,
                ...(extra?.error === undefined ? {} : { error: extra.error }),
                ...(extra?.decidedAt === undefined ? {} : { decidedAt: extra.decidedAt }),
              },
            }
          : entry
      ),
    })),
  reset: () => set({ entries: [], context: null }),
}));
