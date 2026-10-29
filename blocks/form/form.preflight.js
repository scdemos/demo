export default function validate(source) {
  if (source.querySelectorAll('a[href]').length >= 2) return [];
  return [{
    message: 'Form block needs two links.',
    hint: 'Add a link to the form fields spreadsheet, then a link to the submit URL.',
  }];
}
