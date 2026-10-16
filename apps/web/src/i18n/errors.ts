import { isApiError } from '@/lib/api';
import { i18n } from './index';

export const describeError = (error: unknown): string =>
  isApiError(error) ? i18n.t(`errors.${error.code}`) : i18n.t('errors.network');
