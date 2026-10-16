import { zodResolver } from '@hookform/resolvers/zod';
import type { FieldValues, Resolver } from 'react-hook-form';
import type { ZodType } from 'zod';
import { translateValidationMessage } from './zod';

const translateErrors = (value: unknown): void => {
  if (value === null || typeof value !== 'object') return;
  const record = value as Record<string, unknown>;
  if (typeof record['message'] === 'string')
    record['message'] = translateValidationMessage(record['message']);
  for (const child of Object.values(record)) if (child !== record['ref']) translateErrors(child);
};

export const localizedResolver = <TIn extends FieldValues, TOut extends FieldValues>(
  schema: ZodType<TOut, TIn>
): Resolver<TIn, unknown, TOut> => {
  const base = zodResolver(schema) as Resolver<TIn, unknown, TOut>;
  return async (values, context, options) => {
    const result = await base(values, context, options);
    translateErrors(result.errors);
    return result;
  };
};
