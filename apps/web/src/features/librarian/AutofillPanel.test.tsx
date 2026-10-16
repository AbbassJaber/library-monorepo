import { screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { http } from 'msw';
import { describe, expect, it } from 'vitest';
import { Route, Routes } from 'react-router';
import { FieldSource, type BookDraft } from '@library/contracts';
import { aiStatus, librarian } from '@/test/fixtures';
import { API, ok } from '@/test/msw/handlers';
import { server } from '@/test/msw/server';
import { renderWithProviders } from '@/test/render';
import { BookFormPage } from './BookFormPage';

const field = <T,>(value: T | null, source: BookDraft['title']['source'], confidence = 0.95) => ({
  value,
  source,
  confidence: value === null ? 0 : confidence,
});

const draft: BookDraft = {
  title: field('The Master and Margarita', FieldSource.enum.lookup),
  author: field('Mikhail Bulgakov', FieldSource.enum.lookup),
  publishedYear: { ...field(1967, FieldSource.enum.lookup), conflict: null },
  synopsis: field('The devil visits Soviet Moscow.', FieldSource.enum.model, 0.4),
  isbn: field('9780141180144', FieldSource.enum.lookup),
  coverUrl: field(null, FieldSource.enum.empty),
  genreIds: field([1], FieldSource.enum.model, 0.8),
  lookupSource: 'openlibrary',
};
const aiMeta = {
  runId: 3,
  feature: 'AUTOFILL',
  provider: 'bedrock',
  model: 'eu.anthropic.claude-haiku-4-5-20251001-v1:0',
  tokensIn: 1900,
  tokensOut: 140,
  tokensCachedRead: 0,
  tokensCachedWrite: 0,
  costUsd: 0.0026,
  latencyMs: 1800,
  fallbackUsed: false,
};

const setup = (answer: { data: BookDraft; meta: Record<string, unknown> }) => {
  const sent: unknown[] = [];
  let created = 0;
  server.use(
    http.get(`${API}/auth/me`, () => ok(librarian)),
    http.post(`${API}/ai/books/autofill`, async ({ request }) => {
      sent.push(await request.json());
      return ok(answer.data, answer.meta);
    }),
    http.post(`${API}/books`, () => {
      created += 1;
      return ok({}, undefined, { status: 201 });
    })
  );
  renderWithProviders(
    <Routes>
      <Route path="/librarian/books/new" element={<BookFormPage />} />
    </Routes>,
    { route: '/librarian/books/new' }
  );
  return { sent, created: () => created };
};

describe('AutofillPanel', () => {
  it('shows each drafted field with its source, fills the form on request, and saves nothing', async () => {
    const { sent, created } = setup({
      data: draft,
      meta: { ai: aiMeta, lookupHit: true, aiUnavailable: false },
    });
    await userEvent.type(await screen.findByLabelText('Look-up ISBN'), '978-0-14-118014-4');
    await userEvent.click(screen.getByRole('button', { name: 'Look up' }));

    const panel = await screen.findByRole('region', { name: 'Fill from Open Library' });
    expect(sent).toEqual([{ isbn: '978-0-14-118014-4' }]);
    const synopsis = within(panel).getByText('The devil visits Soviet Moscow.').closest('div')!;
    expect(within(synopsis).getByText('Suggested by AI')).toBeInTheDocument();
    expect(within(synopsis).getByText('check this')).toBeInTheDocument();
    const title = within(panel).getByText('The Master and Margarita').closest('div')!;
    expect(within(title).getByText('From Open Library')).toBeInTheDocument();
    expect(within(panel).getByText(/eu\.anthropic\.claude-haiku/)).toBeInTheDocument();

    await userEvent.click(within(panel).getByRole('button', { name: 'Use these values' }));
    expect(screen.getByLabelText(/^Title/)).toHaveValue('The Master and Margarita');
    expect(screen.getByLabelText(/^Author/)).toHaveValue('Mikhail Bulgakov');
    expect(screen.getByLabelText(/^Published/)).toHaveValue(1967);
    expect(screen.getByLabelText(/^Synopsis/)).toHaveValue('The devil visits Soviet Moscow.');
    expect(screen.getByRole('checkbox', { name: 'Fantasy' })).toBeChecked();
    expect(created()).toBe(0);
  });

  it('shows a year conflict with both values and lets the librarian take the AI year', async () => {
    const conflicted = {
      ...draft,
      publishedYear: {
        ...field(1800, FieldSource.enum.lookup),
        conflict: { value: 1859, confidence: 0.9 },
      },
    };
    setup({ data: conflicted, meta: { ai: aiMeta, lookupHit: true, aiUnavailable: false } });
    await userEvent.type(await screen.findByLabelText('Look-up ISBN'), '9780141439600');
    await userEvent.click(screen.getByRole('button', { name: 'Look up' }));
    const panel = await screen.findByRole('region', { name: 'Fill from Open Library' });
    const year = within(panel).getByText('1800').closest('div')!;
    expect(within(year).getByText('AI says 1859')).toBeInTheDocument();
    expect(within(year).getByText('check this')).toBeInTheDocument();
    await userEvent.click(within(year).getByRole('button', { name: 'Use 1859' }));
    await userEvent.click(within(panel).getByRole('button', { name: 'Use these values' }));
    expect(screen.getByLabelText(/^Published/)).toHaveValue(1859);
  });

  it('keeps the Open Library year unless the AI year is chosen', async () => {
    const conflicted = {
      ...draft,
      publishedYear: {
        ...field(1800, FieldSource.enum.lookup),
        conflict: { value: 1859, confidence: 0.9 },
      },
    };
    setup({ data: conflicted, meta: { ai: aiMeta, lookupHit: true, aiUnavailable: false } });
    await userEvent.type(await screen.findByLabelText('Look-up ISBN'), '9780141439600');
    await userEvent.click(screen.getByRole('button', { name: 'Look up' }));
    const panel = await screen.findByRole('region', { name: 'Fill from Open Library' });
    await userEvent.click(within(panel).getByRole('button', { name: 'Use these values' }));
    expect(screen.getByLabelText(/^Published/)).toHaveValue(1800);
  });

  it('says so when the book is not in Open Library, and when the AI stepped aside', async () => {
    setup({
      data: {
        ...draft,
        title: field('Unlisted Novel', FieldSource.enum.input, 1),
        author: field(null, FieldSource.enum.empty),
        publishedYear: { ...field(null, FieldSource.enum.empty), conflict: null },
        synopsis: field(null, FieldSource.enum.empty),
        isbn: field(null, FieldSource.enum.empty),
        genreIds: field(null, FieldSource.enum.empty),
        lookupSource: null,
      },
      meta: { ai: null, lookupHit: false, aiUnavailable: true },
    });
    await userEvent.type(await screen.findByLabelText('Look-up title'), 'Unlisted Novel');
    await userEvent.click(screen.getByRole('button', { name: 'Look up' }));
    const panel = await screen.findByRole('region', { name: 'Fill from Open Library' });
    expect(await within(panel).findByText(/not in Open Library/)).toBeInTheDocument();
    expect(within(panel).getByText(/assistant is unavailable/)).toBeInTheDocument();
    expect(within(panel).getByText('As typed')).toBeInTheDocument();
  });

  it('asks for an ISBN or a title before calling the server', async () => {
    const { sent } = setup({ data: draft, meta: {} });
    await userEvent.type(await screen.findByLabelText('Look-up author'), 'Bulgakov');
    await userEvent.click(screen.getByRole('button', { name: 'Look up' }));
    expect(await screen.findByText('Provide an ISBN or a title.')).toBeInTheDocument();
    expect(sent).toHaveLength(0);
  });

  it('is absent when autofill is switched off', async () => {
    server.use(
      http.get(`${API}/ai/status`, () =>
        ok({ ...aiStatus, features: { ...aiStatus.features, AUTOFILL: false } })
      )
    );
    setup({ data: draft, meta: {} });
    expect(await screen.findByLabelText(/^Title/)).toBeInTheDocument();
    expect(screen.queryByLabelText('Look-up ISBN')).not.toBeInTheDocument();
  });
});
