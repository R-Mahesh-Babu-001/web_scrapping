# wick_city - Intelligent Search Engine PWA

A full-stack Progressive Web App search engine with web scraping, image analysis, voice search, and Indian news aggregation.

## Project Structure

```
perplexity-clone/
├── package.json            # Root scripts (build, start, dev)
├── render.yaml             # Render deployment blueprint
├── .gitignore
├── scripts/
│   └── generate-icons.js   # PWA icon generator (uses sharp)
├── server/                 # Express.js backend
│   ├── package.json        # Server dependencies
│   ├── index.js            # Main server (API + static serving)
│   ├── worker.js           # Web search worker (child process)
│   ├── imageWorker.js      # Image analysis worker
│   ├── newsWorker.js       # News scraping worker
│   ├── routes/
│   │   └── search.js       # Search route (unused, routes in index.js)
│   ├── services/
│   │   ├── webScraper.js   # DDG + Wikipedia + HTML scraping
│   │   ├── imageAnalyzer.js# OCR + image metadata (tesseract + sharp)
│   │   ├── newsScraper.js  # Indian news RSS + HTML scraping
│   │   └── searchEngine.js # Alternative search engine
│   ├── data/
│   │   └── knowledge-base.json
│   └── uploads/            # Temp image uploads (gitignored)
└── client/                 # React frontend (PWA)
    ├── package.json        # Client dependencies + proxy config
    ├── public/
    │   ├── index.html      # HTML with PWA meta tags
    │   ├── manifest.json   # PWA manifest
    │   ├── sw.js           # Service worker (offline support)
    │   ├── favicon.png
    │   └── icons/          # PWA icons (72-512px)
    └── src/
        ├── index.js        # Entry + SW registration
        ├── App.js          # Root component + API calls
        ├── components/
        │   ├── HomePage.js
        │   ├── SearchBar.js
        │   ├── ResultsPage.js
        │   ├── AnswerCard.js
        │   ├── SourceCard.js
        │   └── LoadingAnimation.js
        └── styles/
            ├── global.css
            ├── home.css
            ├── searchbar.css
            ├── results.css
            ├── answer.css
            ├── source.css
            └── loading.css
```

## Local Development

```bash
# Install all dependencies
npm run install-all

# Run both server + client in dev mode
npm run dev

# Or run separately:
npm run dev:server   # Backend on http://localhost:5000
npm run dev:client   # Frontend on http://localhost:3000 (proxies API to :5000)
```

## Production Build

```bash
# Build the React app
npm run build

# Start the server (serves API + built frontend)
npm start
# → http://localhost:5000
```

## Deploy to Render (Free Tier)

### Option 1: One-Click with Blueprint

1. Push this repo to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com)
3. Click **New** → **Blueprint**
4. Connect your GitHub repo
5. Render reads `render.yaml` and auto-configures everything
6. Click **Apply** — done!

### Option 2: Manual Setup

1. Push this repo to GitHub
2. Go to [Render Dashboard](https://dashboard.render.com)
3. Click **New** → **Web Service**
4. Connect your GitHub repo
5. Configure:
   - **Name**: `wick-city`
   - **Runtime**: Node
   - **Build Command**: `npm run render-build`
   - **Start Command**: `npm start`
   - **Plan**: Free
6. Add environment variable:
   - `NODE_ENV` = `production`
7. Click **Create Web Service**

### How It Works on Render

- **Build step**: Installs server deps → installs client deps → builds React app
- **Start step**: Runs `node server/index.js`
- The Express server serves both the API (`/api/*`) and the React build (static files)
- No separate frontend deployment needed — it's a single service

## PWA Features

- **Installable**: Users can "Add to Home Screen" on mobile/desktop
- **Offline support**: Static assets cached via Service Worker
- **App-like experience**: Standalone display mode, custom theme color
- **Auto-update**: Service Worker detects and applies updates

## API Endpoints

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/search` | Web search (query + mode) |
| POST | `/api/image-search` | Image upload + analysis |
| GET | `/api/news` | Latest Indian news |
| GET | `/api/suggestions` | Search suggestions |
| GET | `/api/health` | Health check |
