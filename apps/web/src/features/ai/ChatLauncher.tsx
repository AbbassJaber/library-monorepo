import { MessageSquareText } from 'lucide-react';
import { useTranslation } from 'react-i18next';
import { IconButton } from '@/components/ui';
import { useChatStore } from '@/stores/chatStore';

export const ChatLauncher = () => {
  const { t } = useTranslation();
  const setOpen = useChatStore(s => s.setOpen);
  return (
    <IconButton
      label={t('chat.open')}
      icon={<MessageSquareText className="size-5" aria-hidden="true" />}
      onClick={() => setOpen(true)}
    />
  );
};
