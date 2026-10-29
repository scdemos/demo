export default function validate(source) {
  const next = source.closest('.section')?.nextElementSibling;
  if (next?.hasAttribute('data-tab-id')) return [];
  return [{
    message: 'Tabs block is not followed by any tab sections.',
    hint: 'Add sections with a Tab ID in their section metadata right after the tabs block section.',
  }];
}
