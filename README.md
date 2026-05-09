# wick_city - Intelligent Search Engine PWA

A full-stack Progressive Web App search engine with web scraping, image analysis, voice search, and Indian news aggregation.

<div align="center">
<b>Live Link:</b><br>
<a href="https://web-scrapping-erwz.onrender.com" target="_blank">
https://web-scrapping-erwz.onrender.com
</a>
    <br><br>
<b>Important Notice</b><br>

This project is hosted on <b>Render (Free Tier)</b>.<br>
Since it uses a free hosting service, the server may go to sleep after a period of inactivity.<br>

If the application does not load immediately, please wait <b>30–60 seconds</b><br>
for the server to wake up.
<br>

Open the live link → Wait for the server → Click <b>Install App</b>


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
