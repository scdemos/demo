import cards from '../../blocks/cards/cards.preflight.js';
import columns from '../../blocks/columns/columns.preflight.js';
import embed from '../../blocks/embed/embed.preflight.js';
import form from '../../blocks/form/form.preflight.js';
import fragment from '../../blocks/fragment/fragment.preflight.js';
import hero from '../../blocks/hero/hero.preflight.js';
import productGrid from '../../blocks/product-grid/product-grid.preflight.js';
import relatedArticles from '../../blocks/related-articles/related-articles.preflight.js';
import search from '../../blocks/search/search.preflight.js';
import tabs from '../../blocks/tabs/tabs.preflight.js';

export const GATED_VARIANTS = ['logged-in', 'logged-out'];

export const UTILITY_CLASSES = [/^spacer-(top|bottom)-(s|m|l)$/];

export default {
  'auth-toggle': {},
  cards: { variants: ['default', 'links', 'bento', 'cover'], validate: cards },
  columns: { validate: columns },
  dynamic: { authored: false },
  embed: { variants: [/^(fixedheight-|fixed-height-|h-)?\d+(px)?$/i], validate: embed },
  faq: {},
  footer: { authored: false },
  form: { validate: form },
  fragment: { validate: fragment },
  header: { authored: false },
  hero: { variants: ['gold', 'ink', 'rust'], validate: hero },
  modal: { authored: false },
  'n8n-form': {},
  'product-grid': { validate: productGrid },
  quiz: {},
  'related-articles': { variants: ['bento'], validate: relatedArticles },
  search: { validate: search },
  'social-share': {},
  table: { variants: ['no-header', 'striped', 'bordered'] },
  tabs: { validate: tabs },
  teaser: {},
};
