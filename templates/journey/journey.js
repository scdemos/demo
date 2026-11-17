/**
 * Journey template: a single-column talk track for solution consultants.
 * Layout only; content comes from the authored page (quote and journey-steps blocks).
 * @param {Document} [root] the template loader passes the document, like the other templates
 */
export default function decorate(root = document) {
  root.querySelector('main')?.classList.add('journey-main');
}
