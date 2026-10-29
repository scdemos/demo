export default function validate(source) {
  if (source.querySelector('a[href]') || source.textContent.trim()) return [];
  return [{
    message: 'Fragment block has no fragment path.',
    hint: 'Add a link to the fragment, e.g. /fragments/name.',
  }];
}
