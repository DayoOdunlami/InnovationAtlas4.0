import SignIn from "@/components/auth/sign-in";
import { getAuthConfig } from "lib/auth/config";
import { getIsFirstUser } from "lib/auth/server";
import {
  getDevBypassPasswordHints,
  isDevTestLoginEnabled,
} from "lib/auth/dev-test-login";

export default async function SignInPage() {
  const isFirstUser = await getIsFirstUser();
  const {
    emailAndPasswordEnabled,
    signUpEnabled,
    socialAuthenticationProviders,
  } = getAuthConfig();
  const enabledProviders = (
    Object.keys(
      socialAuthenticationProviders,
    ) as (keyof typeof socialAuthenticationProviders)[]
  ).filter((key) => socialAuthenticationProviders[key]);

  const showDevLogin = isDevTestLoginEnabled();
  const devBypassHints = showDevLogin ? getDevBypassPasswordHints() : null;

  return (
    <SignIn
      emailAndPasswordEnabled={emailAndPasswordEnabled}
      signUpEnabled={signUpEnabled}
      socialAuthenticationProviders={enabledProviders}
      isFirstUser={isFirstUser}
      showDevLogin={showDevLogin}
      devBypassHints={devBypassHints}
    />
  );
}
