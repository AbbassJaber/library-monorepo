import { clsx } from 'clsx';
import type { ClassValue } from 'clsx';
import { extendTailwindMerge } from 'tailwind-merge';

const twMerge = extendTailwindMerge({
  extend: {
    theme: {
      text: ['display', 'h1', 'h2', 'body', 'small', 'meta', 'label'],
      radius: ['cover', 'control-sm', 'control', 'control-lg', 'panel'],
      shadow: ['cover', 'pop'],
    },
  },
});

export const cn = (...inputs: ClassValue[]): string => twMerge(clsx(inputs));
