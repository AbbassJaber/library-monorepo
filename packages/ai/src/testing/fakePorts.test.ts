import {
  book,
  createFakePorts,
  createFakeState,
  genre,
  librarian,
  reader,
  runPortContract,
} from './index.js';

runPortContract('fake ports', async () => {
  const fiction = genre(1, 'Fiction', 'fiction');
  const active = book(1, {
    title: 'The Fake Hobbit',
    genres: [{ id: 1, name: 'Fiction', slug: 'fiction' }],
  });
  const archived = book(2, { archivedAt: '2026-02-01T00:00:00.000Z' });
  const ports = createFakePorts(createFakeState({ books: [active, archived], genres: [fiction] }));
  return {
    ports,
    seed: {
      reader,
      librarian,
      activeBook: { id: active.id, title: active.title },
      archivedBook: { id: archived.id },
      genre: { id: fiction.id, slug: fiction.slug },
    },
  };
});
