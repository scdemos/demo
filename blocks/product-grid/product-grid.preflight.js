export default function validate(source) {
  if (source.querySelector('a[href]') || source.textContent.trim()) return [];
  return [{
    message: 'Product grid block has no product index.',
    hint: 'Add a link or path to the product index JSON.',
  }];
}
