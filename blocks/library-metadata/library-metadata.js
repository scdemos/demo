/** @param {Element} block */
export default async function decorate(block) {
  if (document.body.contains(block)) {
    document.body.classList.add('library');
  }
}
