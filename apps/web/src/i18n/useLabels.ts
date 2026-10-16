import { domain } from '@library/domain-config';
import type { DomainLabels } from '@library/domain-config';
import { useTranslation } from 'react-i18next';
import { isUiLocale } from './index';

export const useLabels = (): DomainLabels => {
  const { i18n } = useTranslation();
  const language = i18n.language;
  return domain.labels[isUiLocale(language) ? language : 'en'];
};
