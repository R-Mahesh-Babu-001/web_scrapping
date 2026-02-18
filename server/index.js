'use strict';
// =============================================================================
// PRODUCTION SERVER — index.js
// =============================================================================
// Express server with:
//  • In-memory LRU cache with TTL
//  • Rate limiting (per-IP)
//  • Request timeout middleware
//  • Graceful shutdown (SIGTERM for Render)
//  • In-process async search (no child process overhead)
//  • Custom API endpoints: search, instant, scrape, health
//  • Child-process isolation for image & news workers
//  • Memory monitoring
// =============================================================================

const express = require('express');
const cors = require('cors');
const path = require('path');
const { execFile } = require('child_process');
const multer = require('multer');
const fs = require('fs');

const { webSearch, instantAnswer, scrapeUrl, destroyAgents } = require('./services/webScraper');

const app = express();
const PORT = process.env.PORT || 5000;
const IS_PRODUCTION = process.env.NODE_ENV === 'production';

// =============================================================================
// UPLOADS DIRECTORY
// =============================================================================

const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) fs.mkdirSync(uploadsDir, { recursive: true });

const storage = multer.diskStorage({
  destination: (req, file, cb) => cb(null, uploadsDir),
  filename: (req, file, cb) => {
    const unique = Date.now() + '-' + Math.round(Math.random() * 1e9) + path.extname(file.originalname);
    cb(null, unique);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 10 * 1024 * 1024 },
  fileFilter: (req, file, cb) => {
    const allowed = /jpeg|jpg|png|gif|webp|bmp|tiff/;
    const ok = allowed.test(path.extname(file.originalname).toLowerCase()) && allowed.test(file.mimetype);
    cb(ok ? null : new Error('Only image files are allowed'), ok);
  },
});

// =============================================================================
// IN-MEMORY LRU CACHE (TTL-based, capped)
// =============================================================================

function createCache(maxSize = 80, ttlMs = 10 * 60 * 1000) {
  const store = new Map();

  // Periodic cleanup every 5 minutes
  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (now - entry.time > ttlMs) store.delete(key);
    }
  }, 5 * 60 * 1000);
  if (cleanupTimer.unref) cleanupTimer.unref();

  return {
    get(key) {
      const entry = store.get(key);
      if (!entry) return null;
      if (Date.now() - entry.time > ttlMs) { store.delete(key); return null; }
      return entry.value;
    },
    set(key, value) {
      // Evict oldest if at capacity
      if (store.size >= maxSize) {
        const oldest = store.keys().next().value;
        store.delete(oldest);
      }
      store.set(key, { value, time: Date.now() });
    },
    size() { return store.size; },
    clear() { store.clear(); },
  };
}

const searchCache = createCache(80, 10 * 60 * 1000);   // 10 min TTL
const instantCache = createCache(100, 15 * 60 * 1000);  // 15 min TTL

// =============================================================================
// RATE LIMITER (per-IP, sliding window)
// =============================================================================

function createRateLimiter(windowMs = 60000, maxHits = 30) {
  const hits = new Map();

  const cleanupTimer = setInterval(() => {
    const now = Date.now();
    for (const [ip, data] of hits) {
      if (now - data.start > windowMs) hits.delete(ip);
    }
  }, windowMs);
  if (cleanupTimer.unref) cleanupTimer.unref();

  return function rateLimitMiddleware(req, res, next) {
    const ip = req.ip || req.connection?.remoteAddress || 'unknown';
    const now = Date.now();

    if (!hits.has(ip) || now - hits.get(ip).start > windowMs) {
      hits.set(ip, { start: now, count: 1 });
      return next();
    }

    const data = hits.get(ip);
    data.count++;

    if (data.count > maxHits) {
      return res.status(429).json({
        error: 'Too many requests. Please wait a moment and try again.',
        retryAfter: Math.ceil((windowMs - (now - data.start)) / 1000),
      });
    }

    next();
  };
}

// =============================================================================
// REQUEST TIMEOUT MIDDLEWARE
// =============================================================================

function requestTimeout(ms) {
  return function (req, res, next) {
    const timer = setTimeout(() => {
      if (!res.headersSent) {
        res.status(504).json({ error: 'Request timed out. Please try a simpler query.' });
      }
    }, ms);
    res.on('finish', () => clearTimeout(timer));
    res.on('close', () => clearTimeout(timer));
    next();
  };
}

// =============================================================================
// MIDDLEWARE
// =============================================================================

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use('/uploads', express.static(uploadsDir));

// Rate limit on search endpoints
const searchRateLimit = createRateLimiter(60000, 25);  // 25 searches per minute per IP
const generalRateLimit = createRateLimiter(60000, 60);  // 60 req/min general

app.use('/api/search', searchRateLimit);
app.use('/api/instant', searchRateLimit);
app.use('/api/scrape', searchRateLimit);
app.use('/api', generalRateLimit);

// =============================================================================
// API: POST /api/search — Main search (in-process, cached)
// =============================================================================

app.post('/api/search', requestTimeout(120000), async function (req, res) {
  const startTime = Date.now();
  console.log('[Server] POST /api/search');

  const query = (req.body.query || '').trim();
  const rawMode = req.body.mode || '';

  if (!query) return res.status(400).json({ error: 'Query is required.' });
  if (query.length > 500) return res.status(400).json({ error: 'Query too long (max 500 chars).' });

  // Map client modes to scraper modes
  let mode = 'default';
  let searchQuery = query;

  switch (rawMode) {
    case 'detailed': mode = 'detailed'; break;
    case 'concise':  mode = 'concise'; break;
    case 'compare':
      if (!/\bvs\b|\bcompare/i.test(query)) searchQuery = `compare ${query}`;
      break;
    case 'troubleshoot':
      if (!/\bfix\b|\bsolve/i.test(query)) searchQuery = `how to fix ${query}`;
      break;
    case 'recommend':
      if (!/\bbest\b|\brecommend/i.test(query)) searchQuery = `best ${query} recommendations`;
      break;
    case 'news':
      searchQuery = `${query} latest news ${new Date().getFullYear()}`;
      break;
  }

  // Check cache
  const cacheKey = `${mode}:${searchQuery.toLowerCase()}`;
  const cached = searchCache.get(cacheKey);
  if (cached) {
    console.log(`[Server] Cache hit for "${searchQuery}" (${Date.now() - startTime}ms)`);
    return res.json({ success: true, data: { ...cached, cached: true } });
  }

  try {
    const result = await webSearch(searchQuery, mode);
    const clean = sanitizeResult(result);

    // Cache the result
    searchCache.set(cacheKey, clean);

    console.log(`[Server] Search done: ${clean.answer.length} chars, ${clean.sources.length} sources (${Date.now() - startTime}ms)`);
    res.json({ success: true, data: clean });
  } catch (err) {
    console.error('[Server] Search error:', err.message);
    res.status(500).json({ error: 'Search failed. Please try again.' });
  }
});

// Also support GET /api/search?q=...&mode=...
app.get('/api/search', requestTimeout(120000), async function (req, res) {
  req.body = { query: req.query.q || '', mode: req.query.mode || '' };
  app.handle(req, res);
});

// =============================================================================
// API: GET /api/instant?q=... — Quick instant answer
// =============================================================================

app.get('/api/instant', requestTimeout(15000), async function (req, res) {
  const query = (req.query.q || '').trim();
  if (!query) return res.status(400).json({ error: 'Query parameter "q" is required.' });

  const cacheKey = `instant:${query.toLowerCase()}`;
  const cached = instantCache.get(cacheKey);
  if (cached) return res.json({ success: true, data: cached });

  try {
    const result = await instantAnswer(query);
    instantCache.set(cacheKey, result);
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[Server] Instant answer error:', err.message);
    res.status(500).json({ error: 'Instant answer failed.' });
  }
});

// =============================================================================
// API: POST /api/scrape — Scrape a single URL
// =============================================================================

app.post('/api/scrape', requestTimeout(20000), async function (req, res) {
  const url = (req.body.url || '').trim();
  if (!url || !url.startsWith('http')) return res.status(400).json({ error: 'Valid URL is required.' });

  try {
    const result = await scrapeUrl(url);
    if (result.error) return res.status(422).json({ error: result.error });
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[Server] Scrape error:', err.message);
    res.status(500).json({ error: 'Scrape failed.' });
  }
});

// =============================================================================
// API: POST /api/image-search — Image upload + analysis
// =============================================================================

function runImageWorker(imagePath, additionalQuery) {
  return new Promise(function (resolve, reject) {
    const workerPath = path.join(__dirname, 'imageWorker.js');
    const args = [workerPath, imagePath];
    if (additionalQuery) args.push(additionalQuery);
    execFile('node', args, {
      timeout: 120000,
      maxBuffer: 5 * 1024 * 1024,
      env: process.env,
    }, function (error, stdout, stderr) {
      if (stderr) console.error('[ImageWorker stderr]', stderr.substring(0, 500));
      try { fs.unlinkSync(imagePath); } catch (_) {}
      if (error) return reject(error);
      try { resolve(JSON.parse(stdout)); }
      catch (e) { reject(new Error('Failed to parse image worker output')); }
    });
  });
}

app.post('/api/image-search', upload.single('image'), async function (req, res) {
  console.log('[Server] POST /api/image-search');
  if (!req.file) return res.status(400).json({ error: 'No image uploaded.' });

  const imagePath = req.file.path;
  const additionalQuery = (req.body.query || '').trim();

  try {
    const result = await runImageWorker(imagePath, additionalQuery);
    console.log('[Server] ImageWorker done, answer:', (result.answer || '').length, 'chars');
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[Server] ImageWorker error:', err.message);
    res.status(500).json({ error: 'Image search failed: ' + err.message });
  }
});

// =============================================================================
// API: GET /api/news — Indian news scraping
// =============================================================================

function runNewsWorker() {
  return new Promise(function (resolve, reject) {
    const workerPath = path.join(__dirname, 'newsWorker.js');
    execFile('node', [workerPath], {
      timeout: 90000,
      maxBuffer: 5 * 1024 * 1024,
      env: process.env,
    }, function (error, stdout, stderr) {
      if (stderr) console.error('[NewsWorker stderr]', stderr.substring(0, 500));
      if (error) return reject(error);
      try { resolve(JSON.parse(stdout)); }
      catch (e) { reject(new Error('Failed to parse news worker output')); }
    });
  });
}

app.get('/api/news', requestTimeout(90000), async function (req, res) {
  console.log('[Server] GET /api/news');
  try {
    const result = await runNewsWorker();
    console.log('[Server] News:', (result.newsArticles || []).length, 'articles');
    res.json({ success: true, data: result });
  } catch (err) {
    console.error('[Server] News error:', err.message);
    res.status(500).json({ error: 'Failed to fetch news.' });
  }
});

// =============================================================================
// API: GET /api/suggestions — Search suggestions
// =============================================================================

app.get('/api/suggestions', function (req, res) {
  const suggestions = [
    'What is artificial intelligence?',
    'Explain quantum computing',
    'Latest technology trends',
    'How does machine learning work?',
    'Climate change effects',
    'Space exploration breakthroughs',
    'Mental health tips',
    'History of ancient civilizations',
    'Web development best practices',
    'Cybersecurity best practices',
    'How to learn programming',
    'Best laptops 2026',
  ];
  const q = (req.query.q || '').toLowerCase();
  const filtered = q
    ? suggestions.filter(s => s.toLowerCase().includes(q))
    : suggestions.slice(0, 6);
  res.json({ suggestions: filtered });
});

// =============================================================================
// API: GET /api/health — Enhanced health check
// =============================================================================

const serverStartTime = Date.now();

app.get('/api/health', function (req, res) {
  const mem = process.memoryUsage();
  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    uptime: Math.floor((Date.now() - serverStartTime) / 1000),
    memory: {
      rss: Math.round(mem.rss / 1024 / 1024) + 'MB',
      heap: Math.round(mem.heapUsed / 1024 / 1024) + 'MB',
      heapTotal: Math.round(mem.heapTotal / 1024 / 1024) + 'MB',
    },
    cache: {
      search: searchCache.size(),
      instant: instantCache.size(),
    },
    version: '2.0.0',
    node: process.version,
  });
});

// =============================================================================
// STATIC FILE SERVING (React build)
// =============================================================================

const buildPath = path.join(__dirname, '..', 'client', 'build');
if (fs.existsSync(buildPath)) {
  console.log('[Server] Serving static build from:', buildPath);
  app.use(express.static(buildPath));
  app.get('*', function (req, res) {
    res.sendFile(path.join(buildPath, 'index.html'));
  });
} else {
  console.log('[Server] No client build found at:', buildPath);
  console.log('[Server] Run "npm run build" from root to create the production build');
}

// =============================================================================
// GLOBAL ERROR HANDLER
// =============================================================================

app.use(function (err, req, res, _next) {
  console.error('[Server] Express error:', err.message);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error.' });
  }
});

// =============================================================================
// RESULT SANITIZER
// =============================================================================

function sanitizeResult(result) {
  return {
    answer: String(result.answer || '').replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, ''),
    sources: (result.sources || []).map(s => ({
      name: String(s.name || ''),
      url: String(s.url || ''),
      title: String(s.title || '').substring(0, 250),
      index: Number(s.index) || 0,
    })),
    related: (result.related || []).map(r => String(r)),
    title: String(result.title || ''),
  };
}

// =============================================================================
// SERVER START + GRACEFUL SHUTDOWN
// =============================================================================

const server = app.listen(PORT, function () {
  console.log(`wick_city server v2.0 running on http://localhost:${PORT}`);
  console.log(`[Server] Environment: ${IS_PRODUCTION ? 'PRODUCTION' : 'development'}`);
  console.log(`[Server] Node: ${process.version}, PID: ${process.pid}`);
});

// Keep connections alive but don't let them hang forever
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

function gracefulShutdown(signal) {
  console.log(`\n[Server] ${signal} received — shutting down gracefully...`);

  server.close(() => {
    console.log('[Server] HTTP server closed.');
    destroyAgents();
    process.exit(0);
  });

  // Force kill after 15s
  setTimeout(() => {
    console.error('[Server] Forced shutdown after timeout.');
    process.exit(1);
  }, 15000).unref();
}

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT',  () => gracefulShutdown('SIGINT'));

// Prevent unhandled rejections from crashing the server
process.on('unhandledRejection', (reason, promise) => {
  console.error('[Server] Unhandled Rejection:', reason);
});

process.on('uncaughtException', (err) => {
  console.error('[Server] Uncaught Exception:', err.message);
  // Don't crash — log and continue
});

// =============================================================================
// OPTIONAL: Keep-alive pinger for Render free tier
// =============================================================================
// Render free tier sleeps after 15 min of inactivity.
// Set KEEP_ALIVE=true in env vars and RENDER_EXTERNAL_URL to your app URL
// to prevent sleep. Alternatively, use https://uptimerobot.com (free).

if (process.env.KEEP_ALIVE === 'true' && process.env.RENDER_EXTERNAL_URL) {
  const pingUrl = `${process.env.RENDER_EXTERNAL_URL}/api/health`;
  const pingInterval = setInterval(() => {
    require('node-fetch')(pingUrl, { timeout: 10000 })
      .then(() => {})
      .catch(() => {});
  }, 13 * 60 * 1000); // Every 13 minutes
  if (pingInterval.unref) pingInterval.unref();
  console.log('[Server] Keep-alive pinger enabled');
}
