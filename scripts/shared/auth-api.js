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

/**
 * Points authored sign-in/sign-out links (`/auth/login`, `/auth/logout`, relative or on the
 * auth origin) at the auth worker; sign-in comes back to the current page unless the link
 * already names a `returnTo`.
 * @param {Element} root
 */
export function decorateAuthLinks(root) {
  root.querySelectorAll('a[href*="/auth/log"]').forEach((a) => {
    const url = new URL(a.getAttribute('href'), window.location.href);
    if (url.origin !== window.location.origin && url.origin !== AUTH_ORIGIN) return;
    if (url.pathname === AUTH_PATHS.login) a.href = getLoginUrl(url.searchParams.get('returnTo') || undefined);
    else if (url.pathname === AUTH_PATHS.logout) a.href = getLogoutUrl();
  });
}

/** Shape aligned with `workers/auth` `/auth/session` JSON (anonymous when not logged in). */
const ANONYMOUS_SESSION = {
  authenticated: false,
  email: '',
  hasJwtAssertion: false,
};


/**
 * Loads `/auth/session` JSON (anonymous on non-OK or failure).
 * `redirect: 'manual'` — Cloudflare Access replies with 302 to *.cloudflareaccess.com;
 */
let sessionPromise;

export function getSessionState() {
  // The Access cookie belongs to the auth origin; elsewhere (localhost, aem.page/live) the
  // browser won't send it cross-site, so asking would only log a cookie issue.
  if (window.location.origin !== AUTH_ORIGIN) {
    return Promise.resolve({ ...ANONYMOUS_SESSION, path: AUTH_PATHS.session });
  }
  sessionPromise ??= fetchSessionState();
  return sessionPromise;
}

async function fetchSessionState() {
  try {
    const response = await fetch(authUrl(AUTH_PATHS.session), {
      method: 'GET',
      credentials: 'include',
      redirect: 'manual',
      headers: { Accept: 'application/json' },
    });
    if (!response.ok) {
      return { ...ANONYMOUS_SESSION, path: AUTH_PATHS.session };
    }
    return await response.json();
  } catch {
    return { ...ANONYMOUS_SESSION, path: AUTH_PATHS.session };
  }
}
