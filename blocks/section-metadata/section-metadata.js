export default function decorate(block) {
  const section = block.closest('.section');
  if (!section) return;

  const rows = [...block.children];
  rows.forEach((row) => {
    const key = row.children[0]?.textContent?.trim().toLowerCase();
    const value = row.children[1]?.textContent?.trim();
    if (key && value) {
      section.classList.add(...value.split(',').map((v) => v.trim().toLowerCase()));
    }
  });

  block.closest('.section-metadata-wrapper')?.remove();
}
