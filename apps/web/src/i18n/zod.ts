import { VALIDATION_CODES } from '@library/contracts';
import type { ValidationCode } from '@library/contracts';
import type { UiLocale } from '@library/domain-config';
import { z } from 'zod';
import { en, fr } from 'zod/locales';
import { i18n } from './index';

const locales = { en, fr } satisfies Record<UiLocale, () => z.core.$ZodConfig>;

export const applyZodLocale = (locale: UiLocale): void => {
  z.config(locales[locale]());
};

const CODES = new Set<string>(Object.values(VALIDATION_CODES));

export const translateValidationMessage = (message: string): string =>
  CODES.has(message) ? i18n.t(`zod.${message as ValidationCode}`) : message;
