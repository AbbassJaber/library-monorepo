import type { DomainConfig } from '../types.js';
import { fields } from './fields.js';
import { genres } from './genres.js';
import { labels } from './labels.js';
import { openLibrary } from './lookup.js';
import { prompts } from './prompts.js';

const stages = {
  navy: '#142347',
  plum: '#2B1538',
  petrol: '#0F2A35',
  indigo: '#1E1640',
  oxblood: '#3A1410',
} as const;

export const books: DomainConfig = {
  key: 'books',
  labels,
  fields,
  genres,
  prompts,
  lookup: openLibrary,
  cover: {
    palette: [
      ['#E8742A', '#1A0E07', '#7A2E12', stages.navy],
      ['#1F7A50', '#FFFFFF', '#0F3D27', stages.plum],
      ['#D7263D', '#FFFFFF', '#111111', stages.petrol],
      ['#FF6F59', '#1B1B1B', '#3A1F5D', stages.indigo],
      ['#2E1F4F', '#FFFFFF', '#FF8A3D', stages.oxblood],
      ['#8FD3E8', '#0B2A36', '#145C7A', stages.plum],
      ['#111111', '#FFFFFF', '#D7263D', stages.oxblood],
      ['#00A6A6', '#06292A', '#FFFFFF', stages.plum],
      ['#4A4E57', '#FFFFFF', '#2E3138', stages.navy],
      ['#3D5AFE', '#FFFFFF', '#FFD23F', stages.plum],
      ['#B8E986', '#12210F', '#1E3A1A', stages.indigo],
      ['#F25C2A', '#1A0B05', '#B83A12', stages.navy],
      ['#FFFFFF', '#111111', '#1C3FAA', stages.navy],
      ['#C9B6F2', '#1E1238', '#4B2A8F', stages.petrol],
      ['#FFC94D', '#1B1407', '#FF6F3C', stages.navy],
      ['#1C2B6B', '#FFFFFF', '#FFD23F', stages.oxblood],
      ['#FF5A8A', '#1B0710', '#FFE14D', stages.petrol],
      ['#0F4C5C', '#FFFFFF', '#5FB4C9', stages.oxblood],
    ],
  },
};

export { genres as bookGenres } from './genres.js';
export { openLibrary } from './lookup.js';
