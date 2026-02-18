'use strict';
// =============================================================================
// ASYNC WORKER — worker.js
// =============================================================================
// Runs webSearch in a child process for isolation.
// Redirects console.log to stderr, writes JSON result to stdout.
// =============================================================================

// Redirect all console.log to stderr so stdout is clean JSON
const _origLog = console.log;
console.log = function () { console.error.apply(console, arguments); };

const { webSearch, destroyAgents } = require('./services/webScraper');

const query = process.argv[2] || 'test';
const mode  = process.argv[3] || 'default';

// Force-exit safety net (in case async hangs)
const forceExitTimer = setTimeout(() => {
  console.error('[Worker] Force exit after timeout');
  process.exit(2);
}, 85000);
forceExitTimer.unref();

(async () => {
  try {
    const result = await webSearch(query, mode);
    const json = JSON.stringify(result);
    process.stdout.write(json);
    destroyAgents();
    process.exit(0);
  } catch (err) {
    console.error('[Worker] Fatal error:', err.message);
    const errJson = JSON.stringify({
      answer: 'Search encountered an error. Please try again.',
      sources: [],
      related: [],
      title: 'Error',
    });
    process.stdout.write(errJson);
    destroyAgents();
    process.exit(1);
  }
})();
