const express = require('express');
const cors = require('cors');
const path = require('path');
const { execFile } = require('child_process');
const multer = require('multer');
const fs = require('fs');

const app = express();
const PORT = process.env.PORT || 5000;

// Create uploads directory
const uploadsDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

// Configure multer for image uploads
const storage = multer.diskStorage({
  destination: function(req, file, cb) {
    cb(null, uploadsDir);
  },
  filename: function(req, file, cb) {
    const uniqueName = Date.now() + '-' + Math.round(Math.random() * 1E9) + path.extname(file.originalname);
    cb(null, uniqueName);
  }
});

const upload = multer({
  storage: storage,
  limits: { fileSize: 10 * 1024 * 1024 }, // 10MB max
  fileFilter: function(req, file, cb) {
    const allowedTypes = /jpeg|jpg|png|gif|webp|bmp|tiff/;
    const extname = allowedTypes.test(path.extname(file.originalname).toLowerCase());
    const mimetype = allowedTypes.test(file.mimetype);
    if (extname && mimetype) {
      cb(null, true);
    } else {
      cb(new Error('Only image files are allowed (JPEG, PNG, GIF, WebP, BMP, TIFF)'));
    }
  }
});

app.use(cors());
app.use(express.json({ limit: '15mb' }));
app.use('/uploads', express.static(uploadsDir));

// Run web scraping in a child process to isolate network connections
function runWorker(query, mode) {
  return new Promise(function(resolve, reject) {
    const workerPath = path.join(__dirname, 'worker.js');
    execFile('node', [workerPath, query, mode || 'default'], {
      timeout: 90000,
      maxBuffer: 5 * 1024 * 1024,
      env: process.env,
    }, function(error, stdout, stderr) {
      if (stderr) console.error('[Worker stderr]', stderr.substring(0, 200));
      if (error) {
        console.error('[Worker error]', error.message);
        return reject(error);
      }
      try {
        resolve(JSON.parse(stdout));
      } catch(e) {
        console.error('[Worker parse error]', e.message);
        reject(new Error('Failed to parse worker output'));
      }
    });
  });
}

app.post('/api/search', function(req, res) {
  console.log('[Server] /api/search hit');
  const query = (req.body.query || '').trim();
  const mode = req.body.mode || '';
  
  if (!query) {
    return res.status(400).json({ error: 'Query is required' });
  }

  // Map model modes: default, detailed, concise
  var answerMode = (mode === 'detailed' || mode === 'concise') ? mode : 'default';

  runWorker(query, answerMode)
    .then(function(result) {
      console.log('[Server] Worker returned, answer length:', (result.answer || '').length);
      res.json({ success: true, data: result });
    })
    .catch(function(err) {
      console.error('[Server] Worker failed:', err.message);
      res.status(500).json({ error: 'Search failed' });
    });
});

// Image search endpoint - handles image upload + optional text query
function runImageWorker(imagePath, additionalQuery) {
  return new Promise(function(resolve, reject) {
    var workerPath = path.join(__dirname, 'imageWorker.js');
    var args = [workerPath, imagePath];
    if (additionalQuery) args.push(additionalQuery);
    execFile('node', args, {
      timeout: 120000,
      maxBuffer: 5 * 1024 * 1024,
      env: process.env,
    }, function(error, stdout, stderr) {
      if (stderr) console.error('[ImageWorker stderr]', stderr.substring(0, 500));
      // Clean up uploaded file after processing
      try { fs.unlinkSync(imagePath); } catch(e) {}
      if (error) {
        console.error('[ImageWorker error]', error.message);
        return reject(error);
      }
      try {
        resolve(JSON.parse(stdout));
      } catch(e) {
        console.error('[ImageWorker parse error]', e.message, 'stdout:', stdout.substring(0, 200));
        reject(new Error('Failed to parse image worker output'));
      }
    });
  });
}

app.post('/api/image-search', upload.single('image'), function(req, res) {
  console.log('[Server] /api/image-search hit');

  if (!req.file) {
    return res.status(400).json({ error: 'No image uploaded' });
  }

  var imagePath = req.file.path;
  var additionalQuery = (req.body.query || '').trim();

  console.log('[Server] Image uploaded: ' + req.file.originalname + ' (' + req.file.size + ' bytes)');
  if (additionalQuery) {
    console.log('[Server] Additional query: ' + additionalQuery);
  }

  runImageWorker(imagePath, additionalQuery)
    .then(function(result) {
      console.log('[Server] ImageWorker returned, answer length:', (result.answer || '').length);
      res.json({ success: true, data: result });
    })
    .catch(function(err) {
      console.error('[Server] ImageWorker failed:', err.message);
      res.status(500).json({ error: 'Image search failed: ' + err.message });
    });
});

// News endpoint - fetches latest Indian news
function runNewsWorker() {
  return new Promise(function(resolve, reject) {
    var workerPath = path.join(__dirname, 'newsWorker.js');
    execFile('node', [workerPath], {
      timeout: 90000,
      maxBuffer: 5 * 1024 * 1024,
      env: process.env,
    }, function(error, stdout, stderr) {
      if (stderr) console.error('[NewsWorker stderr]', stderr.substring(0, 500));
      if (error) {
        console.error('[NewsWorker error]', error.message);
        return reject(error);
      }
      try {
        resolve(JSON.parse(stdout));
      } catch(e) {
        console.error('[NewsWorker parse error]', e.message);
        reject(new Error('Failed to parse news worker output'));
      }
    });
  });
}

app.get('/api/news', function(req, res) {
  console.log('[Server] /api/news hit');
  runNewsWorker()
    .then(function(result) {
      console.log('[Server] NewsWorker returned, articles: ' + ((result.newsArticles || []).length));
      res.json({ success: true, data: result });
    })
    .catch(function(err) {
      console.error('[Server] NewsWorker failed:', err.message);
      res.status(500).json({ error: 'Failed to fetch news' });
    });
});

app.get('/api/suggestions', function(req, res) {
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
    'Cybersecurity best practices'
  ];
  const q = (req.query.q || '').toLowerCase();
  const filtered = q
    ? suggestions.filter(function(s) { return s.toLowerCase().indexOf(q) !== -1; })
    : suggestions.slice(0, 5);
  res.json({ suggestions: filtered });
});

app.get('/api/health', function(req, res) {
  res.json({ status: 'ok', timestamp: new Date().toISOString() });
});

// --- Serve React build in production ---
const buildPath = path.join(__dirname, '..', 'client', 'build');
if (fs.existsSync(buildPath)) {
  console.log('[Server] Serving static build from:', buildPath);
  app.use(express.static(buildPath));
  // All non-API routes fall through to React's index.html (SPA routing)
  app.get('*', function(req, res) {
    res.sendFile(path.join(buildPath, 'index.html'));
  });
} else {
  console.log('[Server] No client build found at:', buildPath);
  console.log('[Server] Run "npm run build" from root to create the production build');
}

app.use(function(err, req, res, next) {
  console.error('Express error:', err.message);
  if (!res.headersSent) {
    res.status(500).json({ error: 'Internal server error' });
  }
});

app.listen(PORT, function() {
  console.log('wick_city server running on http://localhost:' + PORT);
});
