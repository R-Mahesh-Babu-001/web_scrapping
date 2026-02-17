/**
 * Image Search Worker
 * Runs in a child process to analyze images and search
 * Usage: node imageWorker.js <imagePath> [additionalQuery]
 */

// Redirect console.log to stderr so stdout stays clean for JSON
var origLog = console.log;
console.log = function() {
  process.stderr.write(Array.prototype.slice.call(arguments).join(' ') + '\n');
};

var imagePath = process.argv[2];
var additionalQuery = process.argv[3] || '';

if (!imagePath) {
  process.stdout.write(JSON.stringify({ error: 'No image path provided' }));
  process.exit(1);
}

var imageAnalyzer = require('./services/imageAnalyzer');
var webScraper = require('./services/webScraper');

async function run() {
  try {
    // Step 1: Analyze the image
    console.log('[ImageWorker] Analyzing image: ' + imagePath);
    var analysis = await imageAnalyzer.analyzeImage(imagePath);

    // Step 2: Build search query from analysis + any additional user query
    var searchQuery = '';
    if (additionalQuery && additionalQuery.trim()) {
      searchQuery = additionalQuery.trim();
      console.log('[ImageWorker] Using user query: "' + searchQuery + '"');
    } else if (analysis.searchQuery && analysis.searchQuery.length > 3) {
      searchQuery = analysis.searchQuery;
      console.log('[ImageWorker] Using OCR/analysis query: "' + searchQuery + '"');
    } else {
      // No text found and no user query
      var result = {
        answer: '**Image Analysis Results**\n\n' +
          'I analyzed the uploaded image but could not extract enough text or identify specific content to search for.\n\n' +
          '**What I found:**\n' +
          (analysis.imageProperties ? (
            '- **Image size:** ' + analysis.imageProperties.width + 'x' + analysis.imageProperties.height + ' pixels\n' +
            '- **Format:** ' + (analysis.imageProperties.format || 'unknown') + '\n' +
            '- **Dominant color:** ' + (analysis.imageProperties.dominantColor || 'unknown') + '\n' +
            '- **Aspect ratio:** ' + (analysis.imageProperties.aspectRatio || 'unknown') + '\n'
          ) : '- Could not read image properties\n') +
          (analysis.ocrText ? ('\n**Detected text:**\n' + analysis.ocrText.substring(0, 500)) : '\n- No text detected in image') +
          '\n\n**Tip:** Try adding a question about the image in the search bar for better results.',
        sources: [],
        related: [
          'How to identify objects in images?',
          'What is optical character recognition (OCR)?',
          'Image recognition technology explained',
          'How does Google Lens work?',
          'Computer vision applications'
        ],
        title: 'Image Analysis',
        imageAnalysis: analysis
      };
      process.stdout.write(JSON.stringify(result));
      process.exit(0);
      return;
    }

    // Step 3: Search the web with the generated query
    console.log('[ImageWorker] Searching web for: "' + searchQuery + '"');
    var searchResult = webScraper.webSearch(searchQuery);

    // Step 4: Prepend image analysis info to the answer
    var imageInfo = '';
    if (analysis.ocrText && analysis.ocrText.length > 3) {
      imageInfo = '**Text extracted from image:**\n> ' +
        analysis.ocrText.substring(0, 300).replace(/\n/g, '\n> ') +
        '\n\n---\n\n';
    }

    searchResult.answer = imageInfo + searchResult.answer;
    searchResult.imageAnalysis = analysis;
    searchResult.title = searchQuery;

    process.stdout.write(JSON.stringify(searchResult));
    process.exit(0);
  } catch (err) {
    console.log('[ImageWorker] Error: ' + err.message);
    process.stdout.write(JSON.stringify({
      error: err.message,
      answer: 'Sorry, I encountered an error analyzing the image. Please try again.',
      sources: [],
      related: [],
      title: 'Image Analysis Error'
    }));
    process.exit(1);
  }
}

run();
