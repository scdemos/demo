export const Alignment = Object.freeze({ YES: 'YES', NO: 'NO', NA: 'NA' });

export function result({
  id, title, alignment, reasoning, suggestions,
}) {
  const out = {
    id, title, alignment, reasoning,
  };
  if (suggestions) out.suggestions = suggestions;
  return out;
}

const CHECKS = [];

async function runCheck({ id, title, run }, doc) {
  try {
    return result({ id, title, ...(await run(doc)) });
  } catch (error) {
    return result({
      id,
      title,
      alignment: Alignment.NA,
      reasoning: `Check could not run: ${error.message}`,
    });
  }
}

export default async function preflight(doc = document, checks = CHECKS) {
  return Promise.all(checks.map((check) => runCheck(check, doc)));
}
