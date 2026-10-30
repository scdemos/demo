export default function validate(source) {
  const issues = [];
  if (!source.querySelector('h1')) {
    issues.push({
      message: 'Hero block has no H1.',
      hint: 'Format the hero title as Heading 1.',
    });
  }
  const pictures = source.querySelectorAll('picture').length;
  if (pictures > 2) {
    issues.push({
      message: `Hero block has ${pictures} images; only the first two are used.`,
      hint: 'Use one image, or two for a light and dark mode pair.',
    });
  }
  return issues;
}
