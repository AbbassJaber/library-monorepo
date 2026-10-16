import { describe, expect, it } from 'vitest';
import { createMockProvider } from '../providers/mock/index.js';
import type { GenerateRequest } from '../providers/types.js';
import { book, createFakePorts, createFakeState, genre, reader } from '../testing/index.js';
import { RECOMMEND_TOOL, recommend, recommendMockHandler } from './recommend.js';
import { ReadingState, ChatLocale } from '@library/contracts';

const fantasy = { id: 1, name: 'Fantasy', slug: 'fantasy' };
const scifi = { id: 2, name: 'Science Fiction', slug: 'science-fiction' };

const setup = () => {
  const state = createFakeState({
    genres: [genre(1, 'Fantasy'), genre(2, 'Science Fiction')],
    books: [
      book(1, { title: 'The Hobbit', genres: [fantasy], rating: 4.7 }),
      book(2, { title: 'The Fellowship of the Ring', genres: [fantasy], rating: 4.8 }),
      book(3, { title: 'A Wizard of Earthsea', genres: [fantasy], rating: 4.4 }),
      book(12, { title: 'Dune', genres: [scifi], rating: 4.6 }),
    ],
  });
  const ports = createFakePorts(state);
  state.favorites.set(reader.id, [{ genre: fantasy, position: 0 }]);
  return { state, ports };
};

const shelve = async (ports: ReturnType<typeof setup>['ports'], bookId: number) =>
  ports.catalog.addToReadingList(reader, { bookId, state: ReadingState.enum.FINISHED });

describe('explained recommendations', () => {
  it('citations reference only shelf entries shown to the model; books only from the candidates', async () => {
    const { ports } = setup();
    const hobbit = await shelve(ports, 1);
    const seen: GenerateRequest[] = [];
    const llm = createMockProvider({
      tools: {
        [RECOMMEND_TOOL]: request => {
          seen.push(request);
          return {
            recommendations: [
              {
                bookId: 2,
                explanation: 'You finished The Hobbit.',
                citedEntryIds: [hobbit.id, 999_999],
              },
              { bookId: 1, explanation: 'Read it again.', citedEntryIds: [hobbit.id] },
              { bookId: 777, explanation: 'Invented.', citedEntryIds: [hobbit.id] },
              { bookId: 3, explanation: 'Because of a ghost entry.', citedEntryIds: [424_242] },
            ],
          };
        },
      },
    });
    const { value, meta, reason } = await recommend(
      { llm, ports },
      { actor: reader, requestId: 'r' },
      { locale: ChatLocale.enum.en }
    );
    expect(reason).toBe('ok');
    expect(value).toEqual([
      expect.objectContaining({
        book: expect.objectContaining({ id: 2 }),
        explanation: 'You finished The Hobbit.',
        citedEntryIds: [hobbit.id],
        citedBooks: [{ bookId: 1, title: 'The Hobbit' }],
      }),
    ]);
    expect(meta).toMatchObject({ feature: 'RECOMMEND' });
    const system = seen[0]!.system.map(block => block.text).join('\n');
    expect(system).toContain('<data name="shelf">');
    expect(system).toContain('<data name="candidates">');
  });

  it('never offers what is already on the shelf, and asks for the UI language', async () => {
    const { ports } = setup();
    await shelve(ports, 1);
    const seen: GenerateRequest[] = [];
    const llm = createMockProvider({
      tools: { [RECOMMEND_TOOL]: request => (seen.push(request), { recommendations: [] }) },
    });
    await recommend(
      { llm, ports },
      { actor: reader, requestId: 'r' },
      { locale: ChatLocale.enum.fr }
    );
    const system = seen[0]!.system.map(block => block.text).join('\n');
    const candidates = JSON.parse(
      system.slice(
        system.indexOf('<data name="candidates">') + 25,
        system.indexOf('</data>', system.indexOf('<data name="candidates">'))
      )
    ) as Array<{ id: number }>;
    expect(candidates.map(c => c.id).sort()).toEqual([2, 3]);
    expect(system).toContain('Write the explanations in French');
  });

  it('with embeddings, the books nearest the shelf centroid join the candidates, outside the favourites too', async () => {
    const { ports, state } = setup();
    await shelve(ports, 1);
    const unit = (i: number) => Array.from({ length: 4 }, (_, j) => (j === i ? 1 : 0));
    const put = (bookId: number, vector: number[]) =>
      state.vectors.set(bookId, { bookId, vector, contentHash: 'h', model: 'test', dimensions: 4 });
    put(1, unit(0));
    put(12, [0.9, 0.1, 0, 0]);
    put(2, unit(1));
    put(3, unit(2));
    const seen: GenerateRequest[] = [];
    const llm = createMockProvider({
      tools: { [RECOMMEND_TOOL]: request => (seen.push(request), { recommendations: [] }) },
    });
    await recommend(
      { llm, ports, embeddingModel: 'test' },
      { actor: reader, requestId: 'r' },
      { locale: ChatLocale.enum.en }
    );
    const system = seen[0]!.system.map(block => block.text).join('\n');
    expect(system).toContain('"title":"Dune"');
  });

  it('with nothing on the shelf there is no model call and no recommendation', async () => {
    const { ports, state } = setup();
    const llm = createMockProvider({
      tools: { [RECOMMEND_TOOL]: () => ({ recommendations: [] }) },
    });
    const outcome = await recommend(
      { llm, ports },
      { actor: reader, requestId: 'r' },
      { locale: ChatLocale.enum.en }
    );
    expect(outcome).toMatchObject({ value: [], meta: null, reason: 'no-history' });
    expect(state.runs).toEqual([]);
  });

  it('output that fails validation twice falls back (the page shows the plain list)', async () => {
    const { ports, state } = setup();
    await shelve(ports, 1);
    const llm = createMockProvider({
      tools: { [RECOMMEND_TOOL]: () => ({ recommendations: 'lots' }) },
    });
    const outcome = await recommend(
      { llm, ports },
      { actor: reader, requestId: 'r' },
      { locale: ChatLocale.enum.en }
    );
    expect(outcome).toMatchObject({ value: [], reason: 'fallback' });
    expect(outcome.meta?.fallbackUsed).toBe(true);
    expect(state.runs).toHaveLength(1);
  });

  it('the offline Mock explains by shared genre, citing the entry it shares it with', async () => {
    const { ports } = setup();
    const hobbit = await shelve(ports, 1);
    const llm = createMockProvider({ tools: { [RECOMMEND_TOOL]: recommendMockHandler } });
    const { value } = await recommend(
      { llm, ports },
      { actor: reader, requestId: 'r' },
      { locale: ChatLocale.enum.en }
    );
    expect(value.map(r => r.book.id)).toEqual([2, 3]);
    expect(value[0]).toMatchObject({
      citedEntryIds: [hobbit.id],
      explanation: 'Fantasy, like The Hobbit on your list.',
    });
    const fr = await recommend(
      { llm, ports },
      { actor: reader, requestId: 'r' },
      { locale: ChatLocale.enum.fr }
    );
    expect(fr.value[0]!.explanation).toBe('Fantasy, comme The Hobbit dans votre liste.');
  });
});
