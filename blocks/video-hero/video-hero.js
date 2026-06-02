import decorateHero from '../hero/hero.js';

export default function decorate(block) {
  block.classList.add('hero', 'video');
  decorateHero(block);
}
