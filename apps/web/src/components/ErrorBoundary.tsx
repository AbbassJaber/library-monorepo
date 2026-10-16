import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { ErrorState } from '@/components/ui';

interface State {
  error: Error | null;
}

const RenderError = ({ error, onRetry }: { error: Error; onRetry: () => void }) => {
  const { t } = useTranslation();
  return (
    <div className="mx-auto max-w-2xl px-4 py-16">
      <ErrorState title={t('errors.renderTitle')} message={error.message} onRetry={onRetry} />
    </div>
  );
};

export class ErrorBoundary extends Component<{ children: ReactNode }, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('render error', error, info.componentStack);
  }

  override render(): ReactNode {
    if (this.state.error) {
      return (
        <RenderError error={this.state.error} onRetry={() => this.setState({ error: null })} />
      );
    }
    return this.props.children;
  }
}
