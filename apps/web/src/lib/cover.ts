import type { CSSProperties } from 'react';
import type { CoverColors } from '@library/domain-config';
import { coverPalette } from './domain';

export const COVER_SHAPES = ['circle', 'band', 'half', 'arch', 'dot', 'stripes'] as const;
export type CoverShape = (typeof COVER_SHAPES)[number];

const PALETTE_SEED = 2166136261;
const SHAPE_SEED = 2654435761;
const FALLBACK_COLORS: CoverColors = ['#4A4E57', '#FFFFFF', '#2E3138', '#142347'];

const hash = (text: string, seed: number): number => {
  let h = seed;
  for (let i = 0; i < text.length; i++) h = Math.imul(h ^ text.charCodeAt(i), 16777619);
  return Math.abs(h);
};

export const COVER_TITLE_CQW = 12.5;
const COVER_TEXT_WIDTH_CQW = 80;
const TITLE_CHAR_EM = 0.62;

export const coverTitleSize = (title: string): number => {
  const longest = Math.max(1, ...title.split(/\s+|(?<=-)/).map(word => word.length));
  return Math.min(COVER_TITLE_CQW, COVER_TEXT_WIDTH_CQW / (longest * TITLE_CHAR_EM));
};

export interface CoverDesign {
  bg: string;
  text: string;
  accent: string;
  stage: string;
  shape: CoverShape;
}

export const coverDesign = (title: string): CoverDesign => {
  const [bg, text, accent, stage] =
    coverPalette[hash(title, PALETTE_SEED) % coverPalette.length] ?? FALLBACK_COLORS;
  const shape = COVER_SHAPES[hash(title, SHAPE_SEED) % COVER_SHAPES.length] ?? 'circle';
  return { bg, text, accent, stage, shape };
};

export const coverVars = (title: string): CSSProperties => {
  const { bg, text, accent, stage } = coverDesign(title);
  return {
    '--cover-bg': bg,
    '--cover-text': text,
    '--cover-accent': accent,
    '--cover-stage': stage,
  } as CSSProperties;
};
