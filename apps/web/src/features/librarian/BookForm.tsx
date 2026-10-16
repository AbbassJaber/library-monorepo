import { useTranslation } from 'react-i18next';
import type { Book, CreateBookBody, Genre } from '@library/contracts';
import {
  CreateBookBody as CreateBookSchema,
  GENRES_PER_BOOK_MAX,
  ApiErrorCode,
} from '@library/contracts';
import { useState } from 'react';
import { Controller, useForm } from 'react-hook-form';
import type { z } from 'zod';
import { CONTENT_LANGUAGES } from '@library/domain-config';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { useFormat } from '@/i18n/format';
import { describeError } from '@/i18n/errors';
import { useLabels } from '@/i18n/useLabels';
import { localizedResolver } from '@/i18n/zodResolver';
import { isApiError } from '@/lib/api';
import { AutofillPanel } from './AutofillPanel';
import type { DraftValues } from './AutofillPanel';
import { VersionConflictDialog } from './VersionConflictDialog';

type FormInput = z.input<typeof CreateBookSchema>;
const emptyAsUndefined = (value: unknown) => (value === '' ? undefined : value);

export interface BookFormProps {
  genres: Genre[];
  initial?: Book;
  submitLabel: string;
  onSubmit: (body: CreateBookBody, version: number) => Promise<unknown>;
}

const toDefaults = (book: Book | undefined): FormInput =>
  book
    ? {
        title: book.title,
        author: book.author,
        publishedYear: book.publishedYear,
        synopsis: book.synopsis,
        isbn: book.isbn ?? '',
        coverUrl: book.coverUrl ?? '',
        language: book.language ?? '',
        rating: book.rating,
        genreIds: book.genres.map(g => g.id),
      }
    : {
        title: '',
        author: '',
        publishedYear: new Date().getFullYear(),
        synopsis: '',
        isbn: '',
        coverUrl: '',
        language: '',
        rating: 0,
        genreIds: [],
      };

export const BookForm = ({ genres, initial, submitLabel, onSubmit }: BookFormProps) => {
  const { t } = useTranslation('librarian');
  const labels = useLabels();
  const format = useFormat();
  const [version, setVersion] = useState(initial?.version ?? 0);
  const [conflict, setConflict] = useState<Book | null>(null);
  const form = useForm<FormInput, unknown, z.output<typeof CreateBookSchema>>({
    resolver: localizedResolver(CreateBookSchema),
    defaultValues: toDefaults(initial),
  });
  const errors = form.formState.errors;
  const err = (name: keyof FormInput) => {
    const m = errors[name]?.message;
    return typeof m === 'string' ? m : undefined;
  };

  const submit = form.handleSubmit(async values => {
    try {
      await onSubmit(values, version);
    } catch (error) {
      if (isApiError(error, ApiErrorCode.enum.VERSION_CONFLICT)) {
        const current = (error.details as { current?: Book } | undefined)?.current;
        if (current) {
          setConflict(current);
          return;
        }
      }
      form.setError('root', { message: describeError(error) });
    }
  });

  const applyDraft = (values: DraftValues) => {
    for (const [name, value] of Object.entries(values) as Array<[keyof DraftValues, unknown]>)
      form.setValue(name, value as never, { shouldDirty: true, shouldValidate: true });
  };

  return (
    <>
      {initial ? null : <AutofillPanel genres={genres} onApply={applyDraft} />}
      <form
        onSubmit={submit}
        noValidate
        className="grid max-w-3xl gap-5 rounded-panel border border-line bg-surface p-5 sm:p-8 md:grid-cols-2"
      >
        <Field
          label={t('form.fields.title')}
          error={err('title')}
          required
          className="md:col-span-2"
        >
          {p => (
            <Input
              id={p.id}
              aria-describedby={p.describedBy}
              aria-invalid={p.invalid}
              dir="auto"
              {...form.register('title')}
            />
          )}
        </Field>
        <Field label={labels.creator} error={err('author')} required>
          {p => (
            <Input
              id={p.id}
              aria-describedby={p.describedBy}
              aria-invalid={p.invalid}
              dir="auto"
              {...form.register('author')}
            />
          )}
        </Field>
        <Field label={labels.year} error={err('publishedYear')} required>
          {p => (
            <Input
              id={p.id}
              type="number"
              inputMode="numeric"
              aria-describedby={p.describedBy}
              aria-invalid={p.invalid}
              {...form.register('publishedYear', { valueAsNumber: true })}
            />
          )}
        </Field>
        <Field label={labels.summary} error={err('synopsis')} required className="md:col-span-2">
          {p => (
            <Textarea
              id={p.id}
              aria-describedby={p.describedBy}
              aria-invalid={p.invalid}
              dir="auto"
              {...form.register('synopsis')}
            />
          )}
        </Field>
        <Field label={labels.externalId} error={err('isbn')} hint={t('form.fields.isbnHint')}>
          {p => (
            <Input
              id={p.id}
              aria-describedby={p.describedBy}
              aria-invalid={p.invalid}
              {...form.register('isbn', { setValueAs: emptyAsUndefined })}
            />
          )}
        </Field>
        <Field label={t('form.fields.rating')} error={err('rating')}>
          {p => (
            <Input
              id={p.id}
              type="number"
              step="0.1"
              min="0"
              max="5"
              aria-describedby={p.describedBy}
              aria-invalid={p.invalid}
              {...form.register('rating', { valueAsNumber: true })}
            />
          )}
        </Field>
        <Field label={t('form.fields.language')} error={err('language')}>
          {p => (
            <Select
              id={p.id}
              aria-describedby={p.describedBy}
              aria-invalid={p.invalid}
              {...form.register('language', { setValueAs: emptyAsUndefined })}
            >
              <option value="">{t('form.fields.languageUnknown')}</option>
              {CONTENT_LANGUAGES.map(code => (
                <option key={code} value={code}>
                  {format.language(code)}
                </option>
              ))}
            </Select>
          )}
        </Field>
        <Field
          label={t('form.fields.coverUrl')}
          error={err('coverUrl')}
          hint={t('form.fields.coverUrlHint')}
          className="md:col-span-2"
        >
          {p => (
            <Input
              id={p.id}
              type="url"
              aria-describedby={p.describedBy}
              aria-invalid={p.invalid}
              {...form.register('coverUrl', { setValueAs: emptyAsUndefined })}
            />
          )}
        </Field>
        <Controller
          control={form.control}
          name="genreIds"
          render={({ field }) => {
            const chosen = new Set(field.value ?? []);
            const full = chosen.size >= GENRES_PER_BOOK_MAX;
            return (
              <fieldset className="md:col-span-2" aria-describedby="genres-hint genres-error">
                <legend className="text-label text-fg">
                  {labels.genres} <span aria-hidden="true">*</span>
                </legend>
                <p id="genres-hint" className="mt-1 text-small text-fg-2">
                  {t('form.fields.genresHint', { max: GENRES_PER_BOOK_MAX })}
                </p>
                <div className="mt-2 grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
                  {genres
                    .filter(g => g.archivedAt === null || chosen.has(g.id))
                    .map(genre => (
                      <label
                        key={genre.id}
                        className="flex min-h-11 cursor-pointer items-center gap-2.5 rounded-control px-2.5 text-small hover:bg-fg/5 has-[:checked]:bg-surface-2 has-[:disabled]:opacity-50"
                      >
                        <input
                          type="checkbox"
                          className="size-4 accent-accent"
                          aria-label={genre.name}
                          checked={chosen.has(genre.id)}
                          disabled={!chosen.has(genre.id) && full}
                          onChange={() => {
                            const next = new Set(chosen);
                            if (next.has(genre.id)) next.delete(genre.id);
                            else next.add(genre.id);
                            field.onChange([...next]);
                          }}
                        />
                        {genre.name}
                        {genre.archivedAt !== null ? (
                          <span className="tabular text-meta text-fg-2">
                            ({t('status.archived').toLowerCase()})
                          </span>
                        ) : null}
                      </label>
                    ))}
                </div>
                {err('genreIds') ? (
                  <p id="genres-error" role="alert" className="mt-1 text-small text-danger">
                    {err('genreIds')}
                  </p>
                ) : null}
              </fieldset>
            );
          }}
        />
        {errors.root?.message ? (
          <p
            role="alert"
            className="rounded-control border border-danger/40 bg-danger-soft px-3.5 py-2.5 text-small text-fg md:col-span-2"
          >
            {errors.root.message}
          </p>
        ) : null}
        <div className="flex items-center gap-4 md:col-span-2">
          <Button type="submit" loading={form.formState.isSubmitting}>
            {submitLabel}
          </Button>
          {initial ? (
            <span className="tabular text-small text-fg-3">
              {t('form.editingVersion', { version })}
            </span>
          ) : null}
        </div>
      </form>
      <VersionConflictDialog
        current={conflict}
        onClose={() => setConflict(null)}
        onRetryWithMine={current => {
          setVersion(current.version);
          setConflict(null);
        }}
        onTakeTheirs={current => {
          form.reset(toDefaults(current));
          setVersion(current.version);
          setConflict(null);
        }}
      />
    </>
  );
};
