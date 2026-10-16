import { useTranslation } from 'react-i18next';
import { X } from 'lucide-react';
import type { ReactNode } from 'react';
import { useEffect, useId, useRef } from 'react';
import { IconButton } from './IconButton';

export interface DialogProps {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
  footer?: ReactNode;
  variant?: 'center' | 'sheet' | 'command';
  onRequestClose?: (() => void) | undefined;
}

export const Dialog = ({
  open,
  title,
  onClose,
  children,
  footer,
  variant = 'center',
  onRequestClose,
}: DialogProps) => {
  const { t } = useTranslation();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();

  useEffect(() => {
    const dialog = ref.current;
    if (!dialog || !open) return;
    if (!dialog.open) dialog.showModal();
    const handleClose = () => {
      if (!dialog.open) onClose();
    };
    const handleClick = (event: MouseEvent) => {
      if (event.target !== dialog) return;
      if (onRequestClose) onRequestClose();
      else dialog.close();
    };
    const handleCancel = (event: Event) => {
      if (!onRequestClose) return;
      event.preventDefault();
      onRequestClose();
    };
    dialog.addEventListener('close', handleClose);
    dialog.addEventListener('click', handleClick);
    dialog.addEventListener('cancel', handleCancel);
    return () => {
      dialog.removeEventListener('close', handleClose);
      dialog.removeEventListener('click', handleClick);
      dialog.removeEventListener('cancel', handleCancel);
      if (dialog.open) dialog.close();
    };
  }, [open, onClose, onRequestClose]);

  if (!open) return null;
  if (variant === 'command')
    return (
      <dialog ref={ref} aria-labelledby={titleId} className="command">
        <h2 id={titleId} className="sr-only">
          {title}
        </h2>
        {children}
      </dialog>
    );
  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      className={variant === 'sheet' ? 'sheet' : undefined}
    >
      <div className="flex items-center justify-between gap-4 px-5 pb-2 pt-4">
        <h2 id={titleId} className="text-h2">
          {title}
        </h2>
        <IconButton
          label={t('actions.close')}
          icon={<X className="size-5" aria-hidden="true" />}
          onClick={() => ref.current?.close()}
        />
      </div>
      <div className={variant === 'sheet' ? 'flex min-h-0 flex-1 flex-col px-3 pb-4' : 'px-5 py-4'}>
        {children}
      </div>
      {footer ? (
        <div className="flex flex-wrap justify-end gap-2 px-5 pb-5 pt-2">{footer}</div>
      ) : null}
    </dialog>
  );
};
