export default function validate(source) {
  if (source.querySelector('a[href]')) return [];
  return [{
    message: 'Embed block has no link.',
    hint: 'Add a link to the YouTube, Vimeo, or Twitter content to embed.',
  }];
}
