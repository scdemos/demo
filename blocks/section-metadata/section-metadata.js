export default function decorate(block) {
  const section = block.closest('.section');
  if (!section) return;

  [...block.children].forEach((row) => {
    const key = row.children[0]?.textContent?.trim().toLowerCase();
    const value = row.children[1]?.textContent?.trim();
    if (key === 'style') {
      value.split(',').map((v) => v.trim()).filter(Boolean).forEach((v) => {
        section.classList.add(v);
      });
    }
  });

  block.remove();
}
