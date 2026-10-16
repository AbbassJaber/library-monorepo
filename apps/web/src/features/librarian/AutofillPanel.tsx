import { useMutation } from '@tanstack/react-query';
import { FieldSource, type AutofillBody, type BookDraft, type Genre } from '@library/contracts';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Badge, Button, Input } from '@/components/ui';
import { AiFallbackNotice } from '@/features/ai/AiFallbackNotice';
import { autofillBook } from '@/features/ai/api';
import type { AutofillMeta } from '@/features/ai/api';
import { useAiStatus } from '@/features/ai/queries';
import { useAiMeta } from '@/features/ai/useAiMeta';
import { describeError } from '@/i18n/errors';
import { useLabels } from '@/i18n/useLabels';

export interface DraftValues {
  title?: string;
  author?: string;
  publishedYear?: number;
  synopsis?: string;
  isbn?: string;
  coverUrl?: string;
  genreIds?: number[];
}

type DraftKey = Exclude<keyof BookDraft, 'lookupSource'>;
const ORDER: DraftKey[] = [
  'title',
  'author',
  'publishedYear',
  'synopsis',
  'isbn',
  'coverUrl',
  'genreIds',
];
const LOW_CONFIDENCE = 0.5;

const valuesOf = (draft: BookDraft): DraftValues =>
  Object.fromEntries(
    ORDER.filter(key => draft[key].value !== null).map(key => [key, draft[key].value])
  ) as DraftValues;

const tone = (source: FieldSource) =>
  source === FieldSource.enum.model
    ? 'strong'
    : source === FieldSource.enum.lookup
      ? 'accent'
      : 'neutral';

export const AutofillPanel = ({
  genres,
  onApply,
}: {
  genres: Genre[];
  onApply: (values: DraftValues) => void;
}) => {
  const { t } = useTranslation('librarian');
  const labels = useLabels();
  const status = useAiStatus();
  const ai = useAiMeta();
  const [query, setQuery] = useState({ isbn: '', title: '', author: '' });
  const [missingInput, setMissingInput] = useState(false);
  const [result, setResult] = useState<{ draft: BookDraft; meta: AutofillMeta } | null>(null);
  const [takeAiYear, setTakeAiYear] = useState(false);

  const lookup = useMutation({
    mutationFn: (body: AutofillBody) => autofillBook(body),
    onSuccess: value => {
      setResult(value);
      setTakeAiYear(false);
      ai.setMeta(value.meta.ai);
    },
  });

  if (!status.data?.features.AUTOFILL) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    const isbn = query.isbn.trim();
    const title = query.title.trim();
    const author = query.author.trim();
    setMissingInput(isbn === '' && title === '');
    if (isbn === '' && title === '') return;
    lookup.mutate({
      ...(isbn ? { isbn } : {}),
      ...(title ? { title } : {}),
      ...(author ? { author } : {}),
    });
  };

  const fieldLabel: Record<DraftKey, string> = {
    title: t('form.fields.title'),
    author: labels.creator,
    publishedYear: labels.year,
    synopsis: labels.summary,
    isbn: labels.externalId,
    coverUrl: t('form.fields.coverUrl'),
    genreIds: labels.genres,
  };
  const display = (key: DraftKey, value: unknown): string =>
    key === 'genreIds'
      ? (value as number[]).map(id => genres.find(g => g.id === id)?.name ?? `#${id}`).join(', ')
      : String(value);

  const input = (name: keyof typeof query, label: string, extra: { dir?: 'auto' } = {}) => (
    <div className="min-w-48 flex-1">
      <label htmlFor={`autofill-${name}`} className="mb-1.5 block text-label text-fg-2">
        {label}
      </label>
      <Input
        id={`autofill-${name}`}
        value={query[name]}
        autoComplete="off"
        onChange={e => setQuery({ ...query, [name]: e.target.value })}
        {...extra}
      />
    </div>
  );

  return (
    <section
      aria-labelledby="autofill-heading"
      className="mb-6 max-w-3xl rounded-panel border border-line bg-surface p-5 sm:p-6"
    >
      <h2 id="autofill-heading" className="text-lg font-semibold">
        {t('autofill.heading')}
      </h2>
      <p className="mt-1 text-small text-fg-2">{t('autofill.intro')}</p>
      <form onSubmit={submit} noValidate className="mt-3 flex flex-wrap items-end gap-3">
        {input('isbn', t('autofill.isbn'))}
        {input('title', t('autofill.title'), { dir: 'auto' })}
        {input('author', t('autofill.author'), { dir: 'auto' })}
        <Button type="submit" variant="secondary" loading={lookup.isPending}>
          {t('autofill.submit')}
        </Button>
      </form>
      {missingInput ? (
        <p role="alert" className="mt-2 text-small text-danger">
          {t('zod.autofill.isbnOrTitle', { ns: 'common' })}
        </p>
      ) : null}
      {lookup.isError ? (
        <p role="alert" className="mt-2 text-small text-danger">
          {describeError(lookup.error)}
        </p>
      ) : null}

      {result ? (
        <div className="mt-4 flex flex-col gap-3" aria-live="polite">
          {!result.meta.lookupHit ? (
            <p role="status" className="text-small text-fg-2">
              {t('autofill.notFound')}
            </p>
          ) : null}
          {result.meta.aiUnavailable ? <AiFallbackNotice /> : null}
          <dl className="grid gap-2">
            {ORDER.map(key => {
              const entry = result.draft[key];
              return (
                <div key={key} className="grid gap-x-3 sm:grid-cols-[10rem_1fr_auto]">
                  <dt className="text-label text-fg-2">{fieldLabel[key]}</dt>
                  <dd
                    dir="auto"
                    className={`text-small ${entry.value === null ? 'text-fg-3' : ''} ${key === 'synopsis' ? 'line-clamp-3' : ''}`}
                  >
                    {entry.value === null ? '—' : display(key, entry.value)}
                  </dd>
                  <dd className="flex items-center gap-2">
                    <Badge tone={tone(entry.source)}>{t(`autofill.source.${entry.source}`)}</Badge>
                    {entry.source === FieldSource.enum.model &&
                    entry.confidence < LOW_CONFIDENCE ? (
                      <span className="text-meta text-danger">{t('autofill.check')}</span>
                    ) : null}
                  </dd>
                  {key === 'publishedYear' && result.draft.publishedYear.conflict ? (
                    <dd className="flex flex-wrap items-center gap-2 sm:col-start-2">
                      <span className="text-small">
                        {t('autofill.aiSays', { year: result.draft.publishedYear.conflict.value })}
                      </span>
                      <Badge tone="danger">{t('autofill.check')}</Badge>
                      <Button
                        variant="quiet"
                        aria-pressed={takeAiYear}
                        onClick={() => setTakeAiYear(!takeAiYear)}
                      >
                        {takeAiYear
                          ? t('autofill.keepYear', { year: entry.value })
                          : t('autofill.useYear', {
                              year: result.draft.publishedYear.conflict.value,
                            })}
                      </Button>
                    </dd>
                  ) : null}
                </div>
              );
            })}
          </dl>
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => {
                const values = valuesOf(result.draft);
                const conflict = result.draft.publishedYear.conflict;
                onApply(
                  takeAiYear && conflict ? { ...values, publishedYear: conflict.value } : values
                );
                setResult(null);
              }}
            >
              {t('autofill.apply')}
            </Button>
            <Button variant="quiet" onClick={() => setResult(null)}>
              {t('autofill.discard')}
            </Button>
            {ai.line ? <span className="text-meta text-fg-3">{ai.line}</span> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
};
