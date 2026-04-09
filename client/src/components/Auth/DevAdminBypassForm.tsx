import { useState } from 'react';
import { Button, Spinner } from '@librechat/client';
import { useAuthContext } from '~/hooks/AuthContext';
import { useLocalize } from '~/hooks';

const DevAdminBypassForm = () => {
  const localize = useLocalize();
  const { devAdminBypass, devAdminBypassIsPending } = useAuthContext();
  const [password, setPassword] = useState('');

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || devAdminBypassIsPending) {
      return;
    }
    devAdminBypass(password);
  };

  return (
    <div className="mt-8 border-t border-border-medium pt-6">
      <p className="mb-3 text-center text-xs text-text-secondary">
        {localize('com_auth_dev_admin_description')}
      </p>
      <form
        aria-label={localize('com_auth_dev_admin_button')}
        onSubmit={handleSubmit}
        className="flex flex-col gap-3 sm:flex-row sm:items-end"
      >
        <div className="relative flex-1">
          <input
            type="password"
            id="dev-admin-bypass-password"
            autoComplete="off"
            aria-label={localize('com_auth_dev_admin_password_label')}
            value={password}
            onChange={(ev) => setPassword(ev.target.value)}
            className="webkit-dark-styles transition-color peer w-full rounded-2xl border border-border-light bg-surface-primary px-3.5 pb-2.5 pt-3 text-text-primary duration-200 focus:border-green-500 focus:outline-none"
            placeholder=" "
          />
          <label
            htmlFor="dev-admin-bypass-password"
            className="absolute start-3 top-1.5 z-10 origin-[0] -translate-y-4 scale-75 transform bg-surface-primary px-2 text-sm text-text-secondary-alt duration-200 peer-placeholder-shown:top-1/2 peer-placeholder-shown:-translate-y-1/2 peer-placeholder-shown:scale-100 peer-focus:top-1.5 peer-focus:-translate-y-4 peer-focus:scale-75 peer-focus:px-2 peer-focus:text-green-600 dark:peer-focus:text-green-500"
          >
            {localize('com_auth_dev_admin_password_label')}
          </label>
        </div>
        <Button
          type="submit"
          variant="submit"
          disabled={devAdminBypassIsPending || !password.trim()}
          className="h-12 shrink-0 rounded-2xl px-4 sm:w-auto sm:min-w-[10rem]"
          aria-label={localize('com_auth_dev_admin_button')}
        >
          {devAdminBypassIsPending ? <Spinner /> : localize('com_auth_dev_admin_button')}
        </Button>
      </form>
    </div>
  );
};

export default DevAdminBypassForm;
