import type { Citation } from '@library/contracts';
import { create } from 'zustand';

export type CallPhase = 'idle' | 'connecting' | 'live' | 'ending';
export type CallActivity = 'connecting' | 'listening' | 'thinking' | 'speaking';
export type CallView = 'full' | 'minimized';

interface CallState {
  phase: CallPhase;
  view: CallView;
  callId: number | null;
  startedAt: number | null;
  maxSeconds: number | null;
  muted: boolean;
  captions: boolean;
  toolRunning: boolean;
  speaking: boolean;
  lastUser: string | null;
  lastAssistant: string | null;
  mentioned: Citation[];
  set: (patch: Partial<Omit<CallState, 'set' | 'reset'>>) => void;
  reset: () => void;
}

const initial = {
  phase: 'idle' as CallPhase,
  view: 'full' as CallView,
  callId: null,
  startedAt: null,
  maxSeconds: null,
  muted: false,
  captions: true,
  toolRunning: false,
  speaking: false,
  lastUser: null,
  lastAssistant: null,
  mentioned: [] as Citation[],
};

export const useCallStore = create<CallState>()(set => ({
  ...initial,
  set: patch => set(patch),
  reset: () => set(initial),
}));

export const callActivity = (state: {
  phase: CallPhase;
  toolRunning: boolean;
  speaking: boolean;
}): CallActivity =>
  state.phase === 'connecting'
    ? 'connecting'
    : state.toolRunning
      ? 'thinking'
      : state.speaking
        ? 'speaking'
        : 'listening';
