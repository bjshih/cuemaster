const http = require('http');
const fs = require('fs');
const path = require('path');
const { WebSocketServer, WebSocket } = require('ws');

const PORT = process.env.PORT || 8080;
const PUBLIC_DIR = path.join(__dirname, 'public');
const PROJECT_FILE = path.join(__dirname, '示範專案', '星星月月.json');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.gif': 'image/gif',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.aac': 'audio/aac',
  '.svg': 'image/svg+xml'
};

function serveFileWithRange(req, res, filePath) {
  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      return res.end('404 Not Found');
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';
    const total = stats.size;
    const range = req.headers.range;

    if (range) {
      const parts = range.replace(/bytes=/, "").split("-");
      const partialStart = parts[0];
      const partialEnd = parts[1];

      const start = parseInt(partialStart, 10);
      const end = partialEnd ? parseInt(partialEnd, 10) : total - 1;
      const chunkSize = (end - start) + 1;

      res.writeHead(206, {
        'Content-Range': `bytes ${start}-${end}/${total}`,
        'Accept-Ranges': 'bytes',
        'Content-Length': chunkSize,
        'Content-Type': contentType,
        'Access-Control-Allow-Origin': '*'
      });

      const stream = fs.createReadStream(filePath, { start, end });
      stream.pipe(res);
    } else {
      res.writeHead(200, {
        'Content-Length': total,
        'Content-Type': contentType,
        'Accept-Ranges': 'bytes',
        'Access-Control-Allow-Origin': '*'
      });

      const stream = fs.createReadStream(filePath);
      stream.pipe(res);
    }
  });
}

const { handleApiRequest, getMediaDir, MEDIA_BASE } = require('./project_service');

const server = http.createServer((req, res) => {
  const url = decodeURIComponent(req.url.split('?')[0]);

  // Stage Window and Display Query (Fallback for non-Electron standalone server)
  if (url === '/api/stage/open' && req.method === 'POST') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ success: false, inElectron: false }));
  }

  if (url === '/api/stage/displays' && req.method === 'GET') {
    res.writeHead(200, { 'Content-Type': 'application/json' });
    return res.end(JSON.stringify({ inElectron: false, displays: [] }));
  }

  // Project and Media API
  if (url.startsWith('/api/')) {
    return handleApiRequest(req, res);
  }

  // Media files under /media/...
  if (url.startsWith('/media/')) {
    const relPath = url.replace(/^\/media\//, '');
    const mediaDir = getMediaDir();
    let absPath = path.resolve(mediaDir, relPath);
    if (!fs.existsSync(absPath)) {
      // Fallback to sample media directory if not found in current folder
      const fallbackPath = path.resolve(MEDIA_BASE, relPath);
      if (fs.existsSync(fallbackPath)) {
        absPath = fallbackPath;
      }
    }
    return serveFileWithRange(req, res, absPath);
  }

  // Static files in /public
  let staticPath = path.join(PUBLIC_DIR, url === '/' ? 'index.html' : url);
  if (url === '/stage') {
    staticPath = path.join(PUBLIC_DIR, 'stage.html');
  } else if (url === '/simulator') {
    staticPath = path.join(PUBLIC_DIR, 'simulator.html');
  } else if (url === '/subtitles' || url === '/subtitle-deck' || url === '/prompter') {
    staticPath = path.join(PUBLIC_DIR, 'subtitle-deck.html');
  } else if (url === '/subtitle-screen') {
    staticPath = path.join(PUBLIC_DIR, 'subtitle-screen.html');
  }

  fs.stat(staticPath, (err, stats) => {
    if (!err && stats.isFile()) {
      return serveFileWithRange(req, res, staticPath);
    }
    // 404 fallback
    res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
    res.end('Not Found');
  });
});

// WebSocket Server
const wss = new WebSocketServer({ server });

let clients = new Set();
let stageClients = new Set();
let controlClients = new Set();
let subtitleClients = new Set();

// 字幕解析核心 (僅支援 TXT，支援一頁多行與 [歌詞靠右]、[歌詞靠左] 對齊)
function parseSubtitleText(raw) {
  if (!raw) return [];
  const cleaned = raw.replace(/^\uFEFF/, '').trim();
  const hasParagraphs = /\r?\n\s*\r?\n/.test(cleaned);
  const blocks = hasParagraphs ? cleaned.split(/\r?\n\s*\r?\n/) : cleaned.split(/\r?\n/);

  return blocks.map(block => {
    let rawText = block.trim();
    if (!rawText) return null;

    let align = 'center';
    let isLyrics = false;

    if (/(\[|【)歌詞靠右(\]|】)/.test(rawText)) {
      align = 'right';
      isLyrics = true;
      rawText = rawText.replace(/(\[|【)歌詞靠右(\]|】)/g, '').trim();
    } else if (/(\[|【)歌詞靠左(\]|】)/.test(rawText)) {
      align = 'left';
      isLyrics = true;
      rawText = rawText.replace(/(\[|【)歌詞靠左(\]|】)/g, '').trim();
    }

    const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
    if (lines.length === 0) return null;

    return {
      text: lines.join('\n'),
      align,
      isLyrics
    };
  }).filter(Boolean);
}

// 預載示範字幕 (若檔案存在)
function loadInitialSubtitleScript() {
  try {
    const demoPath = path.join(__dirname, '示範專案', '星星月月_字幕.txt');
    if (fs.existsSync(demoPath)) {
      const raw = fs.readFileSync(demoPath, 'utf8');
      return parseSubtitleText(raw);
    }
  } catch (e) {
    console.error('Failed to preload initial subtitle script:', e);
  }
  return [];
}

// 字幕狀態快取 (用於新端點即時無縫同步)
let currentSubtitleState = {
  script: loadInitialSubtitleScript(),
  currentIndex: -1,
  isVisible: false,
  style: {
    position: 'bottom',
    fontSize: 46,
    showBg: true
  }
};

wss.on('connection', (ws, req) => {
  clients.add(ws);

  ws.on('message', (message) => {
    try {
      const data = JSON.parse(message);
      
      if (data.type === 'REGISTER') {
        if (data.role === 'stage') {
          stageClients.add(ws);
          console.log('[WS] Stage Screen connected');
          // 若目前有正在亮起的字幕，立即補發給新連線的舞台螢幕
          if (currentSubtitleState.isVisible && currentSubtitleState.currentIndex >= 0) {
            const curLine = currentSubtitleState.script[currentSubtitleState.currentIndex];
            if (curLine) {
              ws.send(JSON.stringify({
                type: 'SUBTITLE_SHOW',
                index: currentSubtitleState.currentIndex,
                text: curLine.text,
                align: curLine.align || 'center',
                ...currentSubtitleState.style
              }));
            }
          }
        } else if (data.role === 'subtitle-deck') {
          subtitleClients.add(ws);
          console.log('[WS] Subtitle Deck connected');
          // 回傳當前完整字幕狀態給字幕員終端
          ws.send(JSON.stringify({
            type: 'SUBTITLE_STATE_SYNC',
            state: currentSubtitleState
          }));
        } else {
          controlClients.add(ws);
          console.log('[WS] Control Console connected');
          // 即時同步字幕狀態給控制台主畫面
          ws.send(JSON.stringify({
            type: 'SUBTITLE_STATE_SYNC',
            state: currentSubtitleState
          }));
        }
        // Broadcast current connection status
        broadcast({
          type: 'SYSTEM_STATUS',
          stageConnected: stageClients.size > 0,
          controlCount: controlClients.size,
          subtitleCount: subtitleClients.size
        });
        return;
      }

      // 來自各視窗 (控制台或舞台全螢幕) 的鍵盤直接換行推進
      if (data.type === 'SUBTITLE_KEY') {
        if (data.action === 'next') {
          if (currentSubtitleState.script.length > 0 && currentSubtitleState.currentIndex < currentSubtitleState.script.length - 1) {
            currentSubtitleState.currentIndex++;
            currentSubtitleState.isVisible = true;
            const curLine = currentSubtitleState.script[currentSubtitleState.currentIndex];
            broadcast({
              type: 'SUBTITLE_SHOW',
              index: currentSubtitleState.currentIndex,
              text: curLine.text,
              align: curLine.align || 'center',
              ...currentSubtitleState.style
            });
          }
        } else if (data.action === 'prev') {
          if (currentSubtitleState.script.length > 0 && currentSubtitleState.currentIndex > 0) {
            currentSubtitleState.currentIndex--;
            currentSubtitleState.isVisible = true;
            const curLine = currentSubtitleState.script[currentSubtitleState.currentIndex];
            broadcast({
              type: 'SUBTITLE_SHOW',
              index: currentSubtitleState.currentIndex,
              text: curLine.text,
              align: curLine.align || 'center',
              ...currentSubtitleState.style
            });
          }
        } else if (data.action === 'toggleBlank') {
          currentSubtitleState.isVisible = !currentSubtitleState.isVisible;
          if (currentSubtitleState.isVisible && currentSubtitleState.currentIndex >= 0) {
            const curLine = currentSubtitleState.script[currentSubtitleState.currentIndex];
            if (curLine) {
              broadcast({
                type: 'SUBTITLE_SHOW',
                index: currentSubtitleState.currentIndex,
                text: curLine.text,
                align: curLine.align || 'center',
                ...currentSubtitleState.style
              });
            }
          } else {
            broadcast({ type: 'SUBTITLE_CLEAR' });
          }
        }
        return;
      }

      // 字幕事件狀態追蹤
      if (data.type === 'SUBTITLE_LOAD') {
        currentSubtitleState.script = Array.isArray(data.script) ? data.script : [];
        currentSubtitleState.currentIndex = -1;
        currentSubtitleState.isVisible = false;
        broadcast({
          type: 'SUBTITLE_STATE_SYNC',
          state: currentSubtitleState
        });
        return;
      }

      if (data.type === 'SUBTITLE_SHOW') {
        currentSubtitleState.currentIndex = data.index ?? currentSubtitleState.currentIndex;
        currentSubtitleState.isVisible = true;
        if (data.style) {
          currentSubtitleState.style = Object.assign(currentSubtitleState.style, data.style);
        }
      }

      if (data.type === 'SUBTITLE_CLEAR') {
        currentSubtitleState.isVisible = false;
      }

      if (data.type === 'SUBTITLE_STYLE') {
        currentSubtitleState.style = Object.assign(currentSubtitleState.style, data);
      }

      if (data.type === 'STAGE_PANIC') {
        currentSubtitleState.isVisible = false;
      }

      // Broadcast all control events (GO, STOP, PANIC, STAGE_VIDEO, STAGE_FADE, SUBTITLE_*, etc.)
      broadcast(data, ws);

    } catch (e) {
      console.error('[WS] Parse error:', e);
    }
  });

  ws.on('close', () => {
    clients.delete(ws);
    stageClients.delete(ws);
    controlClients.delete(ws);
    subtitleClients.delete(ws);
    broadcast({
      type: 'SYSTEM_STATUS',
      stageConnected: stageClients.size > 0,
      controlCount: controlClients.size,
      subtitleCount: subtitleClients.size
    });
  });
});

function broadcast(data, senderWs = null) {
  const jsonStr = JSON.stringify(data);
  for (const client of clients) {
    if (client.readyState === WebSocket.OPEN) {
      client.send(jsonStr);
    }
  }
}

server.on('error', (err) => {
  if (err.code === 'EADDRINUSE') {
    console.warn(`[Server] 連接埠 ${PORT} 已被其他執行中的服務佔用，請確認是否有先前未關閉的行程。`);
  } else {
    console.error('[Server] 伺服器異常:', err);
  }
});

server.listen(PORT, () => {
  console.log(`=======================================================`);
  console.log(`🎭 Cue Master Server running at:`);
  console.log(`👉 控制台介面 (Control Console):   http://localhost:${PORT}`);
  console.log(`👉 舞台投影螢幕 (Stage Output):     http://localhost:${PORT}/stage`);
  console.log(`👉 字幕控制台 (Subtitle Deck):     http://localhost:${PORT}/subtitle-deck`);
  console.log(`=======================================================`);
});
