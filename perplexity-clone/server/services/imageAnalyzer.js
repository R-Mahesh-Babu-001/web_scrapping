const Tesseract = require('tesseract.js');
const sharp = require('sharp');
const path = require('path');
const fs = require('fs');

/**
 * Analyze an image using OCR and color/metadata analysis
 * Works like Google Lens - extracts text, identifies content, generates search queries
 */

// Extract text from image using Tesseract OCR
async function extractTextFromImage(imagePath) {
  try {
    const result = await Tesseract.recognize(imagePath, 'eng', {
      logger: m => {
        if (m.status === 'recognizing text') {
          process.stderr.write('[OCR] Progress: ' + Math.round(m.progress * 100) + '%\n');
        }
      }
    });
    const text = result.data.text.trim();
    const confidence = result.data.confidence;
    process.stderr.write('[OCR] Extracted text (' + text.length + ' chars, confidence: ' + Math.round(confidence) + '%)\n');
    return { text, confidence };
  } catch (err) {
    process.stderr.write('[OCR] Error: ' + err.message + '\n');
    return { text: '', confidence: 0 };
  }
}

// Get image metadata and dominant colors using sharp
async function analyzeImageProperties(imagePath) {
  try {
    const metadata = await sharp(imagePath).metadata();
    const stats = await sharp(imagePath).stats();

    // Get dominant color from mean values
    const channels = stats.channels || [];
    let dominantColor = '';
    if (channels.length >= 3) {
      const r = Math.round(channels[0].mean);
      const g = Math.round(channels[1].mean);
      const b = Math.round(channels[2].mean);
      dominantColor = identifyColor(r, g, b);
    }

    // Detect if image is mostly text (document-like)
    const isDocumentLike = channels.length > 0 &&
      channels[0].mean > 180 && channels[1].mean > 180 && channels[2].mean > 180;

    return {
      width: metadata.width,
      height: metadata.height,
      format: metadata.format,
      hasAlpha: metadata.hasAlpha || false,
      dominantColor,
      isDocumentLike,
      aspectRatio: (metadata.width / metadata.height).toFixed(2)
    };
  } catch (err) {
    process.stderr.write('[ImageAnalyzer] Metadata error: ' + err.message + '\n');
    return null;
  }
}

// Simple color name identification from RGB
function identifyColor(r, g, b) {
  const colors = [
    { name: 'red', r: 255, g: 0, b: 0 },
    { name: 'green', r: 0, g: 128, b: 0 },
    { name: 'blue', r: 0, g: 0, b: 255 },
    { name: 'yellow', r: 255, g: 255, b: 0 },
    { name: 'orange', r: 255, g: 165, b: 0 },
    { name: 'purple', r: 128, g: 0, b: 128 },
    { name: 'pink', r: 255, g: 192, b: 203 },
    { name: 'brown', r: 139, g: 69, b: 19 },
    { name: 'black', r: 0, g: 0, b: 0 },
    { name: 'white', r: 255, g: 255, b: 255 },
    { name: 'gray', r: 128, g: 128, b: 128 },
    { name: 'cyan', r: 0, g: 255, b: 255 },
    { name: 'teal', r: 0, g: 128, b: 128 },
  ];

  let closest = colors[0];
  let minDist = Infinity;
  for (const c of colors) {
    const dist = Math.sqrt(
      Math.pow(r - c.r, 2) + Math.pow(g - c.g, 2) + Math.pow(b - c.b, 2)
    );
    if (dist < minDist) {
      minDist = dist;
      closest = c;
    }
  }
  return closest.name;
}

// Use Google Reverse Image Search via curl to identify image content
function reverseImageSearch(imagePath) {
  const { execSync } = require('child_process');

  try {
    // Upload image to a temporary image hosting service and get URL
    // We'll use Google's "search by image" with a base64 approach
    // First, let's try to identify using image characteristics
    process.stderr.write('[ImageAnalyzer] Attempting reverse image identification...\n');

    // Read file as base64 for potential API usage
    const imageBuffer = fs.readFileSync(imagePath);
    const base64Image = imageBuffer.toString('base64');
    const mimeType = imagePath.endsWith('.png') ? 'image/png' : 'image/jpeg';

    // Try TinEye/Google-like approach via DuckDuckGo
    // Since we can't directly use Google Lens API, we'll rely on OCR + metadata
    return null;
  } catch (err) {
    process.stderr.write('[ImageAnalyzer] Reverse search error: ' + err.message + '\n');
    return null;
  }
}

// Generate a search query from analyzed image data
function generateSearchQuery(ocrResult, imageProps) {
  const parts = [];

  // If OCR found good text, use it as the primary query
  if (ocrResult.text && ocrResult.text.length > 3 && ocrResult.confidence > 30) {
    // Clean up OCR text - take meaningful lines
    const lines = ocrResult.text.split('\n')
      .map(l => l.trim())
      .filter(l => l.length > 2 && !/^[^a-zA-Z0-9]*$/.test(l));

    if (lines.length > 0) {
      // Take first few meaningful lines as query
      const queryText = lines.slice(0, 5).join(' ');
      // Clean up common OCR artifacts
      const cleaned = queryText
        .replace(/[|{}\\[\]~`<>]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
      if (cleaned.length > 3) {
        return {
          query: cleaned.substring(0, 200),
          type: 'text',
          description: 'Text extracted from image'
        };
      }
    }
  }

  // If it looks like a document
  if (imageProps && imageProps.isDocumentLike) {
    return {
      query: ocrResult.text ? ocrResult.text.substring(0, 200) : 'document image',
      type: 'document',
      description: 'Document-like image detected'
    };
  }

  // Fallback: describe the image properties
  if (imageProps) {
    const aspectDesc = parseFloat(imageProps.aspectRatio) > 1.5 ? 'panoramic' :
      parseFloat(imageProps.aspectRatio) < 0.7 ? 'portrait' : 'standard';
    return {
      query: imageProps.dominantColor + ' ' + aspectDesc + ' image',
      type: 'visual',
      description: 'Image analysis based on visual properties'
    };
  }

  return {
    query: 'image search',
    type: 'unknown',
    description: 'Could not fully analyze image'
  };
}

// Main analysis function
async function analyzeImage(imagePath) {
  process.stderr.write('[ImageAnalyzer] Starting analysis of: ' + imagePath + '\n');

  // Run OCR and image property analysis in parallel
  const [ocrResult, imageProps] = await Promise.all([
    extractTextFromImage(imagePath),
    analyzeImageProperties(imagePath)
  ]);

  const searchQuery = generateSearchQuery(ocrResult, imageProps);

  process.stderr.write('[ImageAnalyzer] Analysis complete. Query type: ' + searchQuery.type + '\n');
  process.stderr.write('[ImageAnalyzer] Generated query: "' + searchQuery.query.substring(0, 100) + '"\n');

  return {
    ocrText: ocrResult.text,
    ocrConfidence: ocrResult.confidence,
    imageProperties: imageProps,
    searchQuery: searchQuery.query,
    searchType: searchQuery.type,
    description: searchQuery.description
  };
}

module.exports = { analyzeImage, extractTextFromImage, analyzeImageProperties };
