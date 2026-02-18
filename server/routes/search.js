'use strict';
// =============================================================================
// SEARCH ROUTE — routes/search.js
// =============================================================================
// Alternative Express route (can be mounted if needed).
// The main search is handled directly in index.js for simplicity.
// =============================================================================

const express = require('express');
const router = express.Router();
const { webSearch } = require('../services/webScraper');

router.post('/search', async (req, res) => {
  try {
    const { query, mode } = req.body;
    if (!query || !query.trim()) {
      return res.status(400).json({ error: 'Query is required.' });
    }

    let searchQuery = query.trim();
    let searchMode = 'default';

    switch (mode) {
      case 'detailed': searchMode = 'detailed'; break;
      case 'concise':  searchMode = 'concise'; break;
      case 'compare':
        if (!/\bvs\b|\bcompare/i.test(searchQuery)) searchQuery = `compare ${searchQuery}`;
        break;
      case 'troubleshoot':
        if (!/\bfix\b|\bsolve/i.test(searchQuery)) searchQuery = `how to fix ${searchQuery}`;
        break;
      case 'recommend':
        if (!/\bbest\b|\brecommend/i.test(searchQuery)) searchQuery = `best ${searchQuery} recommendations`;
        break;
      case 'news':
        searchQuery = `${searchQuery} latest news ${new Date().getFullYear()}`;
        break;
    }

    const result = await webSearch(searchQuery, searchMode);

    const clean = {
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

    res.json({ success: true, data: clean });
  } catch (error) {
    console.error('[Route] Search error:', error.message);
    res.status(500).json({ error: 'Search failed. Please try again.' });
  }
});

module.exports = router;
