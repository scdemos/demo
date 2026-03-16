let defined;

function toggleExp() {
  if (defined) {
    defined.remove();
    defined = undefined;
    return;
  }
  import('https://da.live/nx/public/plugins/exp/exp.js').then((mod) => {
    defined = mod;
  });
}

const sk = document.querySelector('aem-sidekick');
if (sk) {
  sk.addEventListener('custom:experimentation', toggleExp);
} else {
  document.addEventListener('sidekick-ready', () => {
    document.querySelector('aem-sidekick')
      .addEventListener('custom:experimentation', toggleExp);
  }, { once: true });
}
