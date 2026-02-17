const express = require('express');
const router = express.Router();
const { webSearch } = require('../services/webScraper');

// Main search endpoint - real web scraping
router.post('/search', async (req, res) => {
  try {
    const { query, mode } = req.body;

    if (!query || query.trim().length === 0) {
      return res.status(400).json({ error: 'Query is required' });
    }

    let searchQuery = query;

    // Adjust query based on mode
    switch (mode) {
      case 'compare':
        if (!query.toLowerCase().includes(' vs ') && !query.toLowerCase().includes('compare')) {
          searchQuery = `compare ${query}`;
        }
        break;
      case 'troubleshoot':
        if (!query.toLowerCase().includes('fix') && !query.toLowerCase().includes('solve')) {
          searchQuery = `how to fix ${query}`;
        }
        break;
      case 'recommend':
        if (!query.toLowerCase().includes('best') && !query.toLowerCase().includes('recommend')) {
          searchQuery = `best ${query} recommendations`;
        }
        break;
      case 'news':
        searchQuery = `${query} latest news ${new Date().getFullYear()}`;
        break;
    }

    const result = await webSearch(searchQuery);

    console.log(`[Route] Sending response, answer length: ${result.answer?.length}, sources: ${result.sources?.length}`);
    
    // Sanitize the result to ensure clean JSON
    const cleanResult = {
      answer: String(result.answer || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''),
      sources: (result.sources || []).map(s => ({
        name: String(s.name || ''),
        url: String(s.url || ''),
        title: String(s.title || ''),
        index: Number(s.index) || 0,
      })),
      related: (result.related || []).map(r => String(r)),
      title: String(result.title || ''),
    };

    const payload = { success: true, data: cleanResult };
    res.status(200).json(payload);
    console.log(`[Route] Response sent successfully`);

  } catch (error) {
    console.error('Search error:', error);
    res.status(500).json({ error: 'Internal server error' });
  }
});

// Get suggestions/autocomplete
router.get('/suggestions', (req, res) => {
  const suggestions = [
    "What is artificial intelligence?",
    "Explain quantum computing",
    "Latest technology trends",
    "How does machine learning work?",
    "Climate change effects",
    "Space exploration breakthroughs",
    "Mental health tips",
    "History of ancient civilizations",
    "Web development best practices",
    "Cybersecurity best practices"
  ];

  const query = (req.query.q || '').toLowerCase();
  const filtered = query
    ? suggestions.filter(s => s.toLowerCase().includes(query))
    : suggestions.slice(0, 5);

  res.json({ suggestions: filtered });
});

// Health check
router.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

module.exports = router;
