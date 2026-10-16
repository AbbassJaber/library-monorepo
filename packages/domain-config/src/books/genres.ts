import type { GenreDefinition } from '../types.js';

export const genres: GenreDefinition[] = [
  {
    name: 'Fantasy',
    slug: 'fantasy',
    aliases: {
      en: ['fantasy', 'magic', 'dragons', 'epic fantasy'],
      ar: ['فانتازيا', 'خيال', 'سحر'],
      fr: ['fantasy', 'fantastique', 'magie'],
    },
  },
  {
    name: 'Science Fiction',
    slug: 'science-fiction',
    aliases: {
      en: ['science fiction', 'sci-fi', 'scifi', 'sf', 'space'],
      ar: ['خيال علمي', 'فضاء'],
      fr: ['science-fiction', 'science fiction', 'anticipation', 'sf'],
    },
  },
  {
    name: 'Mystery & Crime',
    slug: 'mystery',
    aliases: {
      en: ['mystery', 'crime', 'detective', 'whodunit', 'noir'],
      ar: ['غموض', 'جريمة', 'بوليسي', 'تحقيق'],
      fr: ['policier', 'roman policier', 'polar', 'mystère', 'enquête'],
    },
  },
  {
    name: 'Thriller',
    slug: 'thriller',
    aliases: {
      en: ['thriller', 'suspense', 'spy'],
      ar: ['إثارة', 'تشويق', 'جاسوسية'],
      fr: ['thriller', 'suspense', 'espionnage'],
    },
  },
  {
    name: 'Romance',
    slug: 'romance',
    aliases: {
      en: ['romance', 'romantic', 'love story'],
      ar: ['رومانسي', 'رومانسية', 'حب', 'قصة حب'],
      fr: ['romance', 'romantique', 'amour', 'histoire d’amour'],
    },
  },
  {
    name: 'Historical Fiction',
    slug: 'historical-fiction',
    aliases: {
      en: ['historical', 'historical fiction', 'history novel'],
      ar: ['تاريخي', 'رواية تاريخية', 'تاريخية'],
      fr: ['historique', 'roman historique'],
    },
  },
  {
    name: 'Literary Fiction',
    slug: 'literary-fiction',
    aliases: {
      en: ['literary', 'literary fiction', 'novel', 'classic', 'classics'],
      ar: ['أدب', 'رواية', 'رواية أدبية', 'كلاسيكي'],
      fr: ['littérature', 'roman', 'fiction littéraire', 'classique'],
    },
  },
  {
    name: 'Non-fiction',
    slug: 'non-fiction',
    aliases: {
      en: ['non-fiction', 'nonfiction', 'essay', 'essays', 'science', 'history book'],
      ar: ['غير خيالي', 'واقعي', 'مقالات', 'علوم'],
      fr: ['essai', 'essais', 'documentaire', 'non-fiction'],
    },
  },
  {
    name: 'Biography & Memoir',
    slug: 'biography',
    aliases: {
      en: ['biography', 'memoir', 'autobiography', 'life story'],
      ar: ['سيرة', 'سيرة ذاتية', 'مذكرات'],
      fr: ['biographie', 'mémoires', 'autobiographie'],
    },
  },
  {
    name: 'Poetry',
    slug: 'poetry',
    aliases: {
      en: ['poetry', 'poems', 'verse'],
      ar: ['شعر', 'ديوان', 'قصائد'],
      fr: ['poésie', 'poèmes', 'vers'],
    },
  },
  {
    name: 'Philosophy',
    slug: 'philosophy',
    aliases: {
      en: ['philosophy', 'philosophical', 'ethics'],
      ar: ['فلسفة', 'فلسفي'],
      fr: ['philosophie', 'philosophique'],
    },
  },
  {
    name: "Children's",
    slug: 'children',
    aliases: {
      en: ['children', "children's", 'kids', 'picture book', 'young readers'],
      ar: ['أطفال', 'للأطفال', 'قصص أطفال'],
      fr: ['jeunesse', 'enfants', 'pour enfants', 'album'],
    },
  },
];
