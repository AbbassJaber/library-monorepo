import { create } from 'zustand';

interface CommandState {
  open: boolean;
  setOpen: (open: boolean) => void;
}

export const useCommandStore = create<CommandState>()(set => ({
  open: false,
  setOpen: open => set({ open }),
}));
