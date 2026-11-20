// Experience Workspace's Experimentation panel, opened from the Sidekick "Experimentation"
// button (https://www.aem.live/docs/ew/developing/set-up-experimentation).
const DA_EXP = 'https://da.live/nx/public/plugins/exp/exp.js';
let expMod;

async function toggleExp() {
  // The first import opens the panel as a side effect; later clicks toggle it.
  const exists = document.querySelector('#aem-sidekick-exp');
  if (!exists) {
    expMod = await import(DA_EXP);
    return;
  }
  if (!expMod) expMod = await import(DA_EXP);
  expMod.default();
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
