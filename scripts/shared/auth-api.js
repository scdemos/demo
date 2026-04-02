const AUTH_ORIGIN = 'https://demo.bbird.live';
const AUTH_PATHS = {
  login: '/auth/login',
  logout: '/auth/logout',
  session: '/auth/session',
};

const AUTH_LABELS = {
  login: 'Login',
  logout: 'Logout',
};

function authUrl(path) {
  return new URL(path, AUTH_ORIGIN).toString();
}

export function getDefaultAuthLabel(type) {
  return AUTH_LABELS[type] || '';
}

export function getLoginUrl(returnTo = window.location.href) {
  const target = new URL(AUTH_PATHS.login, AUTH_ORIGIN);
  target.searchParams.set('returnTo', returnTo);
  return target.toString();
}

export function getLogoutUrl() {
  return authUrl(AUTH_PATHS.logout);
}

/** Shape aligned with `workers/auth` `/auth/session` JSON (anonymous when not logged in). */
const ANONYMOUS_SESSION = {
  authenticated: false,
  email: '',
  hasJwtAssertion: false,
};


/**
 * Loads `/auth/session` JSON. Any failure (non-OK, network, CORS after a redirect) → anonymous session.
 * Older pattern used `redirect: 'manual'` when Access 302s broke `fetch`; treating errors as logged-out is enough for the header UI.
 */
export async function getSessionState() {
  try {
    const response = await fetch(authUrl(AUTH_PATHS.session), {
      method: 'GET',
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      return { ...ANONYMOUS_SESSION, path: AUTH_PATHS.session };
    }
    return response.json();
  } catch {
    return { ...ANONYMOUS_SESSION, path: AUTH_PATHS.session };
  }
}
