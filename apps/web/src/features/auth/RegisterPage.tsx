import { RegisterBody } from '@library/contracts';
import { useTranslation } from 'react-i18next';
import { Link, useNavigate } from 'react-router';
import { routes } from '@/app/routes';
import { AuthForm } from './AuthForm';
import { useRegister } from './queries';

export const RegisterPage = () => {
  const { t } = useTranslation('auth');
  const register = useRegister();
  const navigate = useNavigate();

  return (
    <div className="mx-auto w-full max-w-md py-6 sm:py-12">
      <div className="rounded-panel border border-line bg-surface p-6 sm:p-10">
        <h1 className="text-[2rem] leading-[1.05] font-bold tracking-[-0.03em]">
          {t('register.title')}
        </h1>
        <p className="mt-2 mb-8 text-fg-2">{t('register.lede')}</p>
        <AuthForm
          schema={RegisterBody}
          fields={[
            { name: 'displayName', label: t('fields.name'), type: 'text', autoComplete: 'name' },
            { name: 'email', label: t('fields.email'), type: 'email', autoComplete: 'email' },
            {
              name: 'password',
              label: t('fields.password'),
              type: 'password',
              autoComplete: 'new-password',
              hint: t('fields.passwordHint'),
            },
          ]}
          submitLabel={t('register.submit')}
          onSubmit={async values => {
            await register.mutateAsync(values);
            navigate(routes.catalog, { replace: true });
          }}
          footer={
            <p className="text-small text-fg-2">
              {t('register.haveAccount')}{' '}
              <Link
                to={routes.login}
                className="font-semibold text-link hover:underline hover:underline-offset-4"
              >
                {t('login.submit')}
              </Link>
            </p>
          }
        />
      </div>
    </div>
  );
};
