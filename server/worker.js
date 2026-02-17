// Worker script - runs webSearch in separate process
// Query via argv, JSON result to stdout, logs to stderr
const origLog = console.log;
console.log = function() { console.error.apply(console, arguments); };

const { webSearch } = require('./services/webScraper');

const query = process.argv[2] || 'test';
const mode = process.argv[3] || 'default';

try {
  var result = webSearch(query, mode);
  var json = JSON.stringify(result);
  process.stdout.write(json, function() {
    process.exit(0);
  });
} catch(err) {
  var errJson = JSON.stringify({ 
    answer: 'Search failed: ' + err.message, 
    sources: [], related: [], title: 'Error' 
  });
  process.stdout.write(errJson, function() {
    process.exit(1);
  });
}
