/**
 * Parser: logo-wall
 * Extracts award/partner logo images from imagegallery containers.
 */
export default function parse(element, { document }) {
  const cells = [];

  // Find all images within the imagegallery
  const images = element.querySelectorAll('.cmp-image__image, img');

  if (images.length > 0) {
    images.forEach((img) => {
      const clone = document.createElement('img');
      clone.src = img.src || img.getAttribute('src') || '';
      clone.alt = img.alt || '';
      cells.push([clone]);
    });
  }

  return cells;
}
