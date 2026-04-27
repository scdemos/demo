export default async function decorate(main) {
  document.body.classList.add('copenhagen');

  const metaBlock = main.querySelector('.metadata');
  if (metaBlock) metaBlock.closest('.section')?.remove();
}
