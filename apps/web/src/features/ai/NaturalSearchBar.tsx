import { useMutation } from '@tanstack/react-query';
import type { ParsedSearch } from '@library/contracts';
import { useState } from 'react';
import type { FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { Button, Input } from '@/components/ui';
import { useGenres } from '@/features/catalog/queries';
import { describeError } from '@/i18n/errors';
import { AiFallbackNotice } from './AiFallbackNotice';
import { aiMetaOf, isAiUnavailable, parseSearch } from './api';
import { useAiStatus } from './queries';
import { QueryChips } from './QueryChips';
import type { SearchDraft } from './QueryChips';
import { useAiMeta } from './useAiMeta';

const draftFrom = (parsed: ParsedSearch): SearchDraft => ({
  q: parsed.query.q,
  genre: parsed.query.genre,
  yearFrom: parsed.query.yearFrom,
  yearTo: parsed.query.yearTo,
  sort: parsed.query.sort,
});

const asPatch = (draft: SearchDraft) => ({
  q: draft.q,
  genre: draft.genre,
  yearFrom: draft.yearFrom,
  yearTo: draft.yearTo,
  sort: draft.sort,
});

export const NaturalSearchBar = ({
  onApply,
}: {
  onApply: (patch: ReturnType<typeof asPatch>) => void;
}) => {
  const { t } = useTranslation('catalog');
  const status = useAiStatus();
  const genres = useGenres();
  const [text, setText] = useState('');
  const [draft, setDraft] = useState<SearchDraft | null>(null);
  const [confidence, setConfidence] = useState(1);
  const [fellBack, setFellBack] = useState(false);
  const ai = useAiMeta();

  const parse = useMutation({
    mutationFn: (value: string) => parseSearch(value),
    onSuccess: envelope => {
      setFellBack(false);
      setDraft(draftFrom(envelope.data));
      setConfidence(envelope.data.confidence);
      ai.setMeta(aiMetaOf(envelope));
    },
    onError: (error, value) => {
      if (!isAiUnavailable(error)) return;
      setFellBack(true);
      setDraft(null);
      onApply(asPatch({ q: value.trim().length >= 2 ? value.trim() : undefined }));
    },
  });

  if (!status.data?.features.NL_SEARCH) return null;

  const submit = (event: FormEvent) => {
    event.preventDefault();
    if (text.trim().length > 0) parse.mutate(text.trim());
  };

  return (
    <section
      aria-labelledby="ai-search-heading"
      className="mb-6 rounded-panel border border-line bg-surface p-4 sm:p-5"
    >
      <h2 id="ai-search-heading" className="sr-only">
        {t('ai.heading')}
      </h2>
      <form onSubmit={submit} className="flex flex-wrap items-end gap-3">
        <div className="min-w-0 basis-full sm:min-w-64 sm:flex-1 sm:basis-auto">
          <label
            htmlFor="ai-search"
            className="mb-1.5 flex items-center gap-1.5 text-label text-fg"
          >
            {t('ai.label')}
          </label>
          <Input
            id="ai-search"
            dir="auto"
            maxLength={300}
            value={text}
            onChange={e => setText(e.target.value)}
            placeholder={t('ai.placeholder')}
            autoComplete="off"
          />
        </div>
        <Button type="submit" variant="secondary" loading={parse.isPending}>
          {t('ai.submit')}
        </Button>
      </form>

      {fellBack ? <AiFallbackNotice className="mt-3" /> : null}
      {parse.isError && !isAiUnavailable(parse.error) ? (
        <p role="alert" className="mt-3 text-small text-danger">
          {describeError(parse.error)}
        </p>
      ) : null}

      {draft ? (
        <div className="mt-4 flex flex-col gap-3">
          <p className="text-small text-fg-2">
            {confidence < 0.5 ? t('ai.unsure') : t('ai.review')}
          </p>
          <QueryChips draft={draft} genres={genres.data ?? []} onChange={setDraft} />
          <div className="flex flex-wrap items-center gap-3">
            <Button
              onClick={() => {
                onApply(asPatch(draft));
                setDraft(null);
              }}
            >
              {t('ai.apply')}
            </Button>
            <Button variant="quiet" onClick={() => setDraft(null)}>
              {t('ai.discard')}
            </Button>
            {ai.line ? <span className="text-meta text-fg-3">{ai.line}</span> : null}
          </div>
        </div>
      ) : null}
    </section>
  );
};
