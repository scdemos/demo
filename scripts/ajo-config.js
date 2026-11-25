// Site datastream: Analytics, Target, and Experience Platform with Adobe Journey Optimizer.
// frescopa-sandbox datastream, Frescopa sandbox (report suite ccsfrescopa-demo).
export const MARTECH_DATASTREAM_ID = '1745a516-afcc-4432-bc75-06a017965561';

export const AJO_CONFIG = {
  // Journey Optimizer code-based channel configurations name pages on this host. Every host
  // the site runs on (localhost, .aem.page, .aem.live, demo.bbird.live) asks for the same
  // surfaces, so one channel configuration covers preview and production.
  surfaceHost: 'main--demo--scdemos.aem.live',
  // Longest the first section waits for Journey Optimizer before the authored content shows.
  timeout: 1500,
};
