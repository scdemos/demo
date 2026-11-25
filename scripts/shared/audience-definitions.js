/** Normalize sheet column names, retaining only rows with safe audience names and labels. */
export function parseAudienceDefinitions(json) {
  const seen = new Set();
  return (Array.isArray(json?.data) ? json.data : []).map((row) => {
    const fields = Object.fromEntries(Object.entries(row || {}).map(([key, value]) => [key.toLowerCase(), String(value ?? '').trim()]));
    return { name: fields.name, label: fields.label, rule: fields.rule, description: fields.description || '' };
  }).filter(({ name, label, rule }) => {
    if (!name || !/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name) || !label || !rule || seen.has(name)
      || ['constructor', 'prototype'].includes(name)) return false;
    seen.add(name);
    return true;
  });
}
