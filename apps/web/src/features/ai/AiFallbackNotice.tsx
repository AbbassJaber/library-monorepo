import { useTranslation } from 'react-i18next';

export const AiFallbackNotice = ({ className }: { className?: string }) => {
  const { t } = useTranslation();
  return (
    <p role="status" className={`text-small text-fg-2 ${className ?? ''}`}>
      {t('ai.unavailable')}
    </p>
  );
};
