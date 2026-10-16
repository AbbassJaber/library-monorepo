import type { ReactNode } from 'react';
import { useForm } from 'react-hook-form';
import type { DefaultValues, FieldValues, Path } from 'react-hook-form';
import type { z } from 'zod';
import { Button, Field, Input } from '@/components/ui';
import { describeError } from '@/i18n/errors';
import { localizedResolver } from '@/i18n/zodResolver';

export interface AuthFieldSpec<T extends FieldValues> {
  name: Path<T>;
  label: string;
  type: 'email' | 'password' | 'text';
  autoComplete: string;
  hint?: string;
}

interface AuthFormProps<TIn extends FieldValues, TOut extends FieldValues> {
  schema: z.ZodType<TOut, TIn>;
  fields: AuthFieldSpec<TIn>[];
  submitLabel: string;
  onSubmit: (values: TOut) => Promise<unknown>;
  footer?: ReactNode;
  defaultValues?: DefaultValues<TIn>;
}

export const AuthForm = <TIn extends FieldValues, TOut extends FieldValues>({
  schema,
  fields,
  submitLabel,
  onSubmit,
  footer,
  defaultValues,
}: AuthFormProps<TIn, TOut>) => {
  const form = useForm<TIn, unknown, TOut>({
    resolver: localizedResolver(schema),
    ...(defaultValues !== undefined ? { defaultValues } : {}),
  });
  const submit = form.handleSubmit(async values => {
    try {
      await onSubmit(values);
    } catch (error) {
      form.setError('root', { message: describeError(error) });
    }
  });
  const rootError = form.formState.errors.root?.message;

  return (
    <form onSubmit={submit} noValidate className="flex flex-col gap-5">
      {fields.map(field => {
        const message = form.formState.errors[field.name]?.message;
        return (
          <Field
            key={String(field.name)}
            label={field.label}
            error={typeof message === 'string' ? message : undefined}
            hint={field.hint}
            required
          >
            {({ id, describedBy, invalid }) => (
              <Input
                id={id}
                type={field.type}
                autoComplete={field.autoComplete}
                aria-describedby={describedBy}
                aria-invalid={invalid}
                {...form.register(field.name)}
              />
            )}
          </Field>
        );
      })}
      {rootError ? (
        <p
          role="alert"
          className="rounded-control border border-danger/40 bg-danger-soft px-3.5 py-2.5 text-small text-fg"
        >
          {rootError}
        </p>
      ) : null}
      <Button type="submit" loading={form.formState.isSubmitting} className="mt-1 w-full">
        {submitLabel}
      </Button>
      {footer}
    </form>
  );
};
