import { AUDIT_ACTIONS, AuditEntityType, Role, apiPaths, AuditSource } from '@library/contracts';
import type { AuditListResponse, AuditLogEntry, AuditQuery } from '@library/contracts';
import { keepPreviousData, queryOptions, useQuery } from '@tanstack/react-query';
import { useId } from 'react';
import { Trans, useTranslation } from 'react-i18next';
import { Link, useSearchParams } from 'react-router';
import { routes } from '@/app/routes';
import { Badge, EmptyState, ErrorState, PageHeading, Select, Skeleton } from '@/components/ui';
import { Paginator } from '@/features/catalog/Paginator';
import { describeError } from '@/i18n/errors';
import { useFormat } from '@/i18n/format';
import { useLabels } from '@/i18n/useLabels';
import { api } from '@/lib/api';
import { cn } from '@/lib/cn';
import { qk, staleTimes } from '@/lib/queryKeys';

const ACTIVITY_PAGE_SIZE = 30;
const PARAMS = { type: 'type', page: 'page' } as const;
const VALUE_MAX = 80;

const auditOptions = (query: Partial<AuditQuery>) =>
  queryOptions({
    queryKey: qk.audit.list(query),
    queryFn: ({ signal }) => {
      const params = new URLSearchParams();
      if (query.entityType) params.set('entityType', query.entityType.join(','));
      if (query.page && query.page > 1) params.set('page', String(query.page));
      params.set('pageSize', String(query.pageSize ?? ACTIVITY_PAGE_SIZE));
      return api
        .get<AuditListResponse>(`${apiPaths.auditLogs}?${params.toString()}`, signal)
        .then(r => r.data);
    },
    staleTime: staleTimes.audit,
  });

const ACTION_KEY = {
  [AUDIT_ACTIONS.bookCreate]: 'bookCreate',
  [AUDIT_ACTIONS.bookUpdate]: 'bookUpdate',
  [AUDIT_ACTIONS.bookArchive]: 'bookArchive',
  [AUDIT_ACTIONS.bookRestore]: 'bookRestore',
  [AUDIT_ACTIONS.genreCreate]: 'genreCreate',
  [AUDIT_ACTIONS.genreRename]: 'genreRename',
  [AUDIT_ACTIONS.genreArchive]: 'genreArchive',
  [AUDIT_ACTIONS.genreRestore]: 'genreRestore',
  [AUDIT_ACTIONS.shelfAdd]: 'shelfAdd',
  [AUDIT_ACTIONS.shelfUpdate]: 'shelfUpdate',
  [AUDIT_ACTIONS.shelfRemove]: 'shelfRemove',
  [AUDIT_ACTIONS.favoritesSet]: 'favoritesSet',
  [AUDIT_ACTIONS.userRegister]: 'userRegister',
  [AUDIT_ACTIONS.userDisable]: 'userDisable',
  [AUDIT_ACTIONS.seedRun]: 'seedRun',
} as const satisfies Record<AuditLogEntry['action'], string>;

const ENTITY_TYPES = AuditEntityType.options;
const VIEWS = { catalog: 'catalog', all: 'all' } as const;
const CATALOG: AuditLogEntry['entityType'][] = [
  AuditEntityType.enum.book,
  AuditEntityType.enum.genre,
];

const kindsFor = (param: string | null): AuditLogEntry['entityType'][] | undefined => {
  if (param === VIEWS.all) return undefined;
  const one = AuditEntityType.safeParse(param);
  return one.success ? [one.data] : CATALOG;
};

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const show = (value: unknown): string => {
  if (value === undefined) return '—';
  const text = typeof value === 'string' ? value : JSON.stringify(value);
  return text.length > VALUE_MAX ? `${text.slice(0, VALUE_MAX)}…` : text;
};

const changesOf = (entry: AuditLogEntry) => {
  const before = isRecord(entry.before) ? entry.before : {};
  const after = isRecord(entry.after) ? entry.after : {};
  return [...new Set([...Object.keys(before), ...Object.keys(after)])]
    .filter(key => JSON.stringify(before[key]) !== JSON.stringify(after[key]))
    .map(key => ({ key, before: before[key], after: after[key] }));
};

const Entry = ({ entry }: { entry: AuditLogEntry }) => {
  const { t } = useTranslation('librarian');
  const labels = useLabels();
  const format = useFormat();
  const changes = changesOf(entry);
  const who =
    entry.actor?.displayName ??
    (entry.source === AuditSource.enum.SEED ? t('activity.who.seed') : t('activity.who.unknown'));
  const label = entry.entityLabel ?? `#${entry.entityId}`;
  const item =
    entry.entityType === AuditEntityType.enum.book && entry.entityLabel ? (
      <Link
        to={routes.book(entry.entityId)}
        className="font-semibold text-link hover:underline hover:underline-offset-4"
        dir="auto"
      />
    ) : (
      <span className="font-semibold text-fg" dir="auto" />
    );
  return (
    <li className="flex flex-col gap-1.5 border-b border-line py-3.5 last:border-b-0 md:grid md:grid-cols-[11rem_minmax(0,1fr)_auto] md:items-baseline md:gap-x-6">
      <time dateTime={entry.createdAt} className="tabular text-meta text-fg-2">
        {format.date(entry.createdAt)}
      </time>
      <div className="min-w-0">
        <p className="text-small text-fg">
          <span className="font-semibold" dir="auto">
            {who}
          </span>{' '}
          {entry.actor?.role === Role.enum.LIBRARIAN ? (
            <>
              <Badge className="align-middle">{t('activity.who.librarian')}</Badge>{' '}
            </>
          ) : null}
          <Trans
            t={t}
            i18nKey={`activity.actions.${ACTION_KEY[entry.action]}`}
            values={{
              label,
              item: labels.item.toLowerCase(),
              genre: labels.genre.toLowerCase(),
              shelf: labels.shelf.toLowerCase(),
            }}
            components={{ item }}
          />
        </p>
        {changes.length > 0 ? (
          <details className="mt-1 text-meta text-fg-2">
            <summary className="inline-flex cursor-pointer items-center rounded-control font-semibold text-fg-2 hover:text-fg">
              {t('activity.changes', { count: changes.length })}
            </summary>
            <dl className="mt-1 grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-1">
              {changes.map(change => (
                <div key={change.key} className="contents">
                  <dt className="tabular text-fg-3">{change.key}</dt>
                  <dd className="tabular min-w-0 break-words text-fg-2">
                    {show(change.before)} <span aria-hidden="true">→</span>{' '}
                    <span className="sr-only">{t('activity.to')} </span>
                    {show(change.after)}
                  </dd>
                </div>
              ))}
            </dl>
          </details>
        ) : null}
      </div>
      <p className="text-meta text-fg-2">{t(`activity.via.${entry.source}`)}</p>
    </li>
  );
};

export const ActivityPage = () => {
  const { t } = useTranslation(['librarian', 'common']);
  const [params, setParams] = useSearchParams();
  const filterId = useId();
  const typeParam = params.get(PARAMS.type);
  const entityType = kindsFor(typeParam);
  const selected =
    typeParam === VIEWS.all || AuditEntityType.safeParse(typeParam).success
      ? (typeParam ?? VIEWS.catalog)
      : VIEWS.catalog;
  const page = Math.max(1, Number(params.get(PARAMS.page)) || 1);
  const query = { entityType, page, pageSize: ACTIVITY_PAGE_SIZE };
  const result = useQuery({ ...auditOptions(query), placeholderData: keepPreviousData });

  const update = (next: { type?: string | undefined; page?: number }) => {
    const search = new URLSearchParams(params);
    if ('type' in next) {
      if (next.type) search.set(PARAMS.type, next.type);
      else search.delete(PARAMS.type);
      search.delete(PARAMS.page);
    }
    if (next.page !== undefined) {
      if (next.page > 1) search.set(PARAMS.page, String(next.page));
      else search.delete(PARAMS.page);
    }
    setParams(search);
  };

  return (
    <>
      <PageHeading title={t('activity.title')} lede={t('activity.lede')} />
      <div className="mb-4 flex flex-wrap items-end gap-3">
        <label htmlFor={filterId} className="flex flex-col gap-1.5 text-label text-fg">
          {t('activity.filter')}
          <Select
            id={filterId}
            value={selected}
            onChange={event =>
              update({
                type: event.target.value === VIEWS.catalog ? undefined : event.target.value,
              })
            }
            className="min-w-[14rem]"
          >
            <option value={VIEWS.catalog}>{t('activity.types.catalog')}</option>
            {ENTITY_TYPES.map(type => (
              <option key={type} value={type}>
                {t(`activity.types.${type}`)}
              </option>
            ))}
            <option value={VIEWS.all}>{t('activity.types.all')}</option>
          </Select>
        </label>
        {result.data ? (
          <p className="pb-3 text-meta text-fg-2" role="status">
            {t('activity.count', { count: result.data.meta.total })}
          </p>
        ) : null}
      </div>
      {result.isPending ? (
        <div aria-hidden="true" className="flex flex-col gap-4">
          {Array.from({ length: 8 }, (_, i) => (
            <Skeleton key={i} className="h-10 w-full" />
          ))}
        </div>
      ) : result.isError ? (
        <ErrorState message={describeError(result.error)} onRetry={() => void result.refetch()} />
      ) : result.data.items.length === 0 ? (
        <EmptyState title={t('activity.empty.title')}>{t('activity.empty.hint')}</EmptyState>
      ) : (
        <>
          <ol
            aria-label={t('activity.title')}
            aria-busy={result.isPlaceholderData}
            className={cn(
              'rounded-panel border border-line bg-surface px-4 sm:px-6',
              result.isPlaceholderData && 'opacity-60'
            )}
          >
            {result.data.items.map(entry => (
              <Entry key={entry.id} entry={entry} />
            ))}
          </ol>
          <div className="mt-6">
            <Paginator meta={result.data.meta} onPage={next => update({ page: next })} />
          </div>
        </>
      )}
    </>
  );
};
