// Demo access app (opened from da.live): the signed-in user enters their GitHub username, the access
// worker adds them to the scdemos GitHub team and the CAS Hub group da-demosite-authors.
const DA_SDK_URL = 'https://da.live/nx/utils/sdk.js';
const params = new URLSearchParams(window.location.search);
// ?worker= is only honored for local testing
const WORKER = params.get('worker')?.startsWith('http://localhost') ? params.get('worker') : 'https://demo.bbird.live/access';
const GH_USER_RE = /^[a-z\d](?:[a-z\d]|-(?=[a-z\d])){0,38}$/i;

const MESSAGES = {
  sign_in_required: 'Open this page from da.live while signed in with your Adobe account.',
  token_not_accepted: 'Open this page from da.live while signed in with your Adobe account.',
  token_invalid: 'Your Adobe sign-in expired. Reload the page.',
  no_email_on_account: 'Your Adobe account has no email address.',
  invalid_github_user: 'That isn\'t a valid GitHub username.',
  github_user_not_found: 'GitHub has no user with that name. Check the spelling.',
  not_configured: 'Access requests aren\'t set up yet. Ask a demo admin.',
};
const say = (code) => MESSAGES[code] || code;

const $ = (id) => document.getElementById(id);

let imsToken = '';

function setStatus(text, error = false) {
  const el = $('status');
  el.hidden = !text;
  el.textContent = text || '';
  el.classList.toggle('error', error);
}

async function post(path, body = {}) {
  const res = await fetch(`${WORKER}/${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${imsToken}` },
    body: JSON.stringify(body),
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(data.error || `HTTP ${res.status}`);
  return data;
}

function li(text, ok = true) {
  const el = document.createElement('li');
  el.textContent = `${ok ? '✓' : '✕'} ${text}`;
  if (!ok) el.className = 'fail';
  return el;
}

function link(href, text) {
  const a = document.createElement('a');
  a.href = href;
  a.target = '_top';
  a.textContent = text;
  return a;
}

function showResult(r) {
  const steps = $('result-steps');
  const next = $('result-next');
  steps.replaceChildren();
  next.replaceChildren();
  if (!r.automatic) {
    $('result-title').textContent = 'Request sent';
    steps.append(li(r.steps[0].alreadyRequested
      ? `You already asked for access as ${r.email}. A demo admin will add you.`
      : `A demo admin will review your request for ${r.email} and add you.`));
  } else {
    const failed = r.steps.filter((s) => !s.ok);
    $('result-title').textContent = failed.length ? 'Almost there' : 'You have access';
    r.steps.forEach((s) => {
      if (s.step === 'github') {
        steps.append(s.ok
          ? li(s.state === 'pending'
            ? `GitHub: invitation to scdemos sent to ${s.login}. Accept it in the email or at github.com/scdemos.`
            : `GitHub: ${s.login} added to the demo's GitHub group.`)
          : li(`GitHub: not added (${say(s.error)})`, false));
      }
      if (s.step === 'adminConsole') {
        steps.append(s.ok
          ? li(`Experience Workspace: ${r.email} added to the demo authors in the CAS Hub org.`)
          : li(`Experience Workspace: not added (${say(s.error)})`, false));
      }
    });
    const p = document.createElement('p');
    p.append(
      'Next: sign out of da.live and back in, choose the CAS Hub organization, then open ',
      link('https://da.live/#/scdemos/demo', 'the demo site'),
      ' or ',
      link('https://da.live/app/scdemos/demo/tools/cloneit/cloneit', 'CloneIt'),
      '.',
    );
    next.append(p);
    if (failed.length) {
      const f = document.createElement('p');
      f.textContent = 'Fix what failed and submit again, or ask a demo admin.';
      next.append(f);
    }
  }
  $('result').hidden = false;
}

async function init() {
  try {
    const { default: DA_SDK } = await import(DA_SDK_URL);
    const sdk = await Promise.race([DA_SDK, new Promise((_, no) => { setTimeout(() => no(new Error('sign_in_required')), 8000); })]);
    imsToken = sdk.token || '';
    if (!imsToken) throw new Error('sign_in_required');
    const me = await post('whoami');
    $('who').textContent = me.name ? `${me.name} (${me.email})` : me.email;
    if (!me.automatic) {
      $('submit').textContent = 'Ask for access';
      $('github-help').textContent = 'A demo admin reviews requests from outside Adobe and adds you.';
    }
    setStatus('');
    $('form').hidden = false;
  } catch (e) {
    setStatus(say(e.message), true);
  }
}

$('form').addEventListener('submit', async (e) => {
  e.preventDefault();
  const githubUser = $('github-user').value.trim();
  if (!GH_USER_RE.test(githubUser)) { setStatus(say('invalid_github_user'), true); return; }
  $('submit').disabled = true;
  setStatus('Setting up your access…');
  try {
    showResult(await post('request', { githubUser }));
    setStatus('');
  } catch (err) {
    setStatus(say(err.message), true);
  } finally {
    $('submit').disabled = false;
  }
});

init();
