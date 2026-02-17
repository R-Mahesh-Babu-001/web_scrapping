/**
 * News Worker - runs in child process to fetch latest Indian news
 */

// Redirect console.log to stderr
var origLog = console.log;
console.log = function() {
  process.stderr.write(Array.prototype.slice.call(arguments).join(' ') + '\n');
};

var newsScraper = require('./services/newsScraper');

try {
  console.log('[NewsWorker] Starting news fetch...');
  var result = newsScraper.fetchLatestNews();
  console.log('[NewsWorker] Done. Articles: ' + (result.newsArticles || []).length);
  process.stdout.write(JSON.stringify(result));
  process.exit(0);
} catch (err) {
  console.log('[NewsWorker] Error: ' + err.message);
  process.stdout.write(JSON.stringify({
    answer: 'Failed to fetch news: ' + err.message,
    sources: [],
    related: [],
    title: 'News Error',
    newsArticles: []
  }));
  process.exit(1);
}
