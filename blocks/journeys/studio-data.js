/** Path prefix up to and including `/studio`, so drafts and markets resolve their own data. */
export const STUDIO_ROOT = window.location.pathname.match(/^.*?\/studio(?=\/|$)/)?.[0] || '/studio';

/** Studio reference data: <studio>/capabilities.json (capabilities, statuses, groups, labels). */
const SOURCE = `${STUDIO_ROOT}/capabilities.json`;
let request;

const key = (value) => String(value || '').trim().toLowerCase();

export default function loadStudioData() {
  if (!request) {
    request = fetch(SOURCE).then((resp) => {
      if (!resp.ok) throw new Error(`${SOURCE}: HTTP ${resp.status}`);
      return resp.json();
    }).then((json) => {
      const rows = (name) => json[name]?.data || [];
      const labels = Object.fromEntries(rows('labels').map((r) => [r.key, r.value]));
      const capabilities = rows('capabilities').map((c) => ({
        ...c, products: String(c.products || '').split(',').map((p) => p.trim()).filter(Boolean),
      }));
      const byName = new Map(capabilities.map((c) => [key(c.name), c]));
      return {
        capabilities,
        statuses: rows('statuses'),
        groups: rows('groups'),
        status: (id) => rows('statuses').find((s) => s.id === id),
        capability: (name) => byName.get(key(name)),
        label: (k, vars = {}) => Object.entries(vars)
          .reduce((str, [n, v]) => str.replace(`{${n}}`, v), labels[k] || k),
      };
    });
  }
  return request;
}
