import { LoginBody } from '@library/contracts';
import { useTranslation } from 'react-i18next';
import { Link, useLocation, useNavigate } from 'react-router';
import { routes } from '@/app/routes';
import { APP_NAME } from '@/lib/domain';
import { AuthForm } from './AuthForm';
import { useLogin } from './queries';

export const LoginPage = () => {
  const { t } = useTranslation('auth');
  const login = useLogin();
  const navigate = useNavigate();
  const location = useLocation();
  const from = (location.state as { from?: string } | null)?.from;

  return (
    <div className="mx-auto w-full max-w-md py-6 sm:py-12">
      <div className="rounded-panel border border-line bg-surface p-6 sm:p-10">
        <h1 className="text-[2rem] leading-[1.05] font-bold tracking-[-0.03em]">
          {t('login.title', { app: APP_NAME })}
        </h1>
        <p className="mt-2 mb-8 text-fg-2">{t('login.lede')}</p>
        <AuthForm
          schema={LoginBody}
          fields={[
            { name: 'email', label: t('fields.email'), type: 'email', autoComplete: 'email' },
            {
              name: 'password',
              label: t('fields.password'),
              type: 'password',
              autoComplete: 'current-password',
            },
          ]}
          submitLabel={t('login.submit')}
          onSubmit={async values => {
            await login.mutateAsync(values);
            navigate(from ?? routes.catalog, { replace: true });
          }}
          footer={
            <p className="text-small text-fg-2">
              {t('login.newHere')}{' '}
              <Link
                to={routes.register}
                className="font-semibold text-link hover:underline hover:underline-offset-4"
              >
                {t('register.title')}
              </Link>
            </p>
          }
        />
      </div>
    </div>
  );
};
