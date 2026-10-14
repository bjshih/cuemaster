const { app, BrowserWindow, screen, ipcMain, dialog } = require('electron');
const path = require('path');
const http = require('http');
const fs = require('fs');
const { WebSocketServer, WebSocket } = require('ws');

let mainWindow = null;
let stageWindow = null;
let server = null;
let wss = null;
const PORT = 8080;

const MEDIA_BASE = path.join(__dirname, '示範專案', 'media');
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
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.wav': 'audio/wav',
  '.mp3': 'audio/mpeg',
  '.m4a': 'audio/mp4',
  '.txt': 'text/plain; charset=utf-8',
  '.srt': 'text/plain; charset=utf-8'
};

const { handleApiRequest, getMediaDir, setFolderPicker, setStageWindowOpener } = require('./project_service');

// 註冊 Electron 原生資料夾挑選對話框
setFolderPicker(async () => {
  const win = mainWindow || BrowserWindow.getFocusedWindow();
  const res = await dialog.showOpenDialog(win, {
    title: '選擇專案素材資料夾 (Select Media Folder)',
    properties: ['openDirectory', 'createDirectory']
  });
  if (res.canceled || !res.filePaths || res.filePaths.length === 0) {
    return null;
  }
  return res.filePaths[0];
});

// 註冊 Electron 原生舞台視窗副螢幕智慧偵測開啟器
setStageWindowOpener(() => createStageWindow());

function startInternalServer() {
  server = http.createServer((req, res) => {
    const url = decodeURIComponent(req.url.split('?')[0]);

    if (url === '/api/stage/open' && req.method === 'POST') {
      const resData = createStageWindow();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify(resData));
    }

    if (url === '/api/stage/displays' && req.method === 'GET') {
      const displays = screen.getAllDisplays().map(d => ({
        id: d.id,
        bounds: d.bounds,
        isPrimary: d.bounds.x === 0 && d.bounds.y === 0
      }));
      res.writeHead(200, { 'Content-Type': 'application/json' });
      return res.end(JSON.stringify({ inElectron: true, displays }));
    }

    if (url.startsWith('/api/')) {
      return handleApiRequest(req, res);
    }

    let filePath = '';
    if (url.startsWith('/media/')) {
      const rel = url.replace(/^\/media\//, '');
      const mediaDir = getMediaDir();
      filePath = path.resolve(mediaDir, rel);
      if (!fs.existsSync(filePath)) {
        const fallback = path.resolve(MEDIA_BASE, rel);
        if (fs.existsSync(fallback)) {
          filePath = fallback;
        }
      }
    } else {
      let relFile = url === '/' ? 'index.html' : url;
      if (url === '/stage') {
        relFile = 'stage.html';
      } else if (url === '/simulator') {
        relFile = 'simulator.html';
      } else if (url === '/subtitle-deck' || url === '/subtitles' || url === '/prompter') {
        relFile = 'subtitle-deck.html';
      } else if (url === '/subtitle-screen') {
        relFile = 'subtitle-screen.html';
      }
      filePath = path.join(PUBLIC_DIR, relFile);
    }

    fs.stat(filePath, (err, stats) => {
      if (err || !stats.isFile()) {
        res.writeHead(404, { 'Content-Type': 'text/plain; charset=utf-8' });
        return res.end('Not found');
      }

      const ext = path.extname(filePath).toLowerCase();
      const contentType = MIME_TYPES[ext] || 'application/octet-stream';
      const range = req.headers.range;

      if (range) {
        const parts = range.replace(/bytes=/, "").split("-");
        const start = parseInt(parts[0], 10);
        const end = parts[1] ? parseInt(parts[1], 10) : stats.size - 1;
        res.writeHead(206, {
          'Content-Range': `bytes ${start}-${end}/${stats.size}`,
          'Accept-Ranges': 'bytes',
          'Content-Length': (end - start) + 1,
          'Content-Type': contentType
        });
        fs.createReadStream(filePath, { start, end }).pipe(res);
      } else {
        res.writeHead(200, { 'Content-Length': stats.size, 'Content-Type': contentType });
        fs.createReadStream(filePath).pipe(res);
      }
    });
  });

  wss = new WebSocketServer({ server });
  const clients = new Set();
  let stageClients = new Set();
  let subtitleClients = new Set();

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

  wss.on('connection', (ws) => {
    clients.add(ws);
    ws.on('message', (msg) => {
      try {
        const d = JSON.parse(msg);
        if (d.type === 'REGISTER') {
          if (d.role === 'stage') {
            stageClients.add(ws);
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
          } else if (d.role === 'subtitle-deck') {
            subtitleClients.add(ws);
            ws.send(JSON.stringify({
              type: 'SUBTITLE_STATE_SYNC',
              state: currentSubtitleState
            }));
          } else {
            ws.send(JSON.stringify({
              type: 'SUBTITLE_STATE_SYNC',
              state: currentSubtitleState
            }));
          }
        }

        // 鍵盤直推換行
        if (d.type === 'SUBTITLE_KEY') {
          if (d.action === 'next') {
            if (currentSubtitleState.script.length > 0 && currentSubtitleState.currentIndex < currentSubtitleState.script.length - 1) {
              currentSubtitleState.currentIndex++;
              currentSubtitleState.isVisible = true;
              const curLine = currentSubtitleState.script[currentSubtitleState.currentIndex];
              for (const c of clients) {
                if (c.readyState === WebSocket.OPEN) {
                  c.send(JSON.stringify({
                    type: 'SUBTITLE_SHOW',
                    index: currentSubtitleState.currentIndex,
                    text: curLine.text,
                    align: curLine.align || 'center',
                    ...currentSubtitleState.style
                  }));
                }
              }
            }
          } else if (d.action === 'prev') {
            if (currentSubtitleState.script.length > 0 && currentSubtitleState.currentIndex > 0) {
              currentSubtitleState.currentIndex--;
              currentSubtitleState.isVisible = true;
              const curLine = currentSubtitleState.script[currentSubtitleState.currentIndex];
              for (const c of clients) {
                if (c.readyState === WebSocket.OPEN) {
                  c.send(JSON.stringify({
                    type: 'SUBTITLE_SHOW',
                    index: currentSubtitleState.currentIndex,
                    text: curLine.text,
                    align: curLine.align || 'center',
                    ...currentSubtitleState.style
                  }));
                }
              }
            }
          } else if (d.action === 'toggleBlank') {
            currentSubtitleState.isVisible = !currentSubtitleState.isVisible;
            if (currentSubtitleState.isVisible && currentSubtitleState.currentIndex >= 0) {
              const curLine = currentSubtitleState.script[currentSubtitleState.currentIndex];
              if (curLine) {
                for (const c of clients) {
                  if (c.readyState === WebSocket.OPEN) {
                    c.send(JSON.stringify({
                      type: 'SUBTITLE_SHOW',
                      index: currentSubtitleState.currentIndex,
                      text: curLine.text,
                      align: curLine.align || 'center',
                      ...currentSubtitleState.style
                    }));
                  }
                }
              }
            } else {
              for (const c of clients) {
                if (c.readyState === WebSocket.OPEN) {
                  c.send(JSON.stringify({ type: 'SUBTITLE_CLEAR' }));
                }
              }
            }
          }
          return;
        }

        // 字幕狀態維護
        if (d.type === 'SUBTITLE_LOAD') {
          currentSubtitleState.script = Array.isArray(d.script) ? d.script : [];
          currentSubtitleState.currentIndex = -1;
          currentSubtitleState.isVisible = false;
          for (const c of clients) {
            if (c.readyState === WebSocket.OPEN) {
              c.send(JSON.stringify({
                type: 'SUBTITLE_STATE_SYNC',
                state: currentSubtitleState
              }));
            }
          }
          return;
        }

        if (d.type === 'SUBTITLE_SHOW') {
          currentSubtitleState.currentIndex = d.index ?? currentSubtitleState.currentIndex;
          currentSubtitleState.isVisible = true;
          if (d.style) {
            currentSubtitleState.style = Object.assign(currentSubtitleState.style, d.style);
          }
        }

        if (d.type === 'SUBTITLE_CLEAR' || d.type === 'STAGE_PANIC') {
          currentSubtitleState.isVisible = false;
        }

        if (d.type === 'SUBTITLE_STYLE') {
          currentSubtitleState.style = Object.assign(currentSubtitleState.style, d);
        }

        for (const c of clients) {
          if (c.readyState === WebSocket.OPEN) c.send(JSON.stringify(d));
        }
      } catch (e) {}
    });
    ws.on('close', () => {
      clients.delete(ws);
      stageClients.delete(ws);
      subtitleClients.delete(ws);
    });
  });

  server.on('error', (err) => {
    if (err.code === 'EADDRINUSE') {
      console.warn(`[Cue Master] 連接埠 ${PORT} 已被先前服務佔用，略過內部重複監聽。`);
    } else {
      console.error('[Cue Master] 伺服器異常:', err);
    }
  });

  server.listen(PORT, () => {
    console.log(`[Cue Master] Core engine listening on port ${PORT}`);
  });
}

function createMainWindow() {
  mainWindow = new BrowserWindow({
    width: 1280,
    height: 800,
    minWidth: 1000,
    minHeight: 650,
    title: 'Cue Master - 劇場影音播放控制台',
    backgroundColor: '#141416',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadURL(`http://localhost:${PORT}`);

  mainWindow.on('closed', () => {
    mainWindow = null;
    if (stageWindow) stageWindow.close();
  });
}

function createStageWindow() {
  const displays = screen.getAllDisplays();
  const externalDisplay = displays.find((display) => display.bounds.x !== 0 || display.bounds.y !== 0);

  if (stageWindow) {
    stageWindow.focus();
    return { success: true, isExternal: !!externalDisplay, alreadyOpen: true };
  }

  const windowOptions = {
    width: 1280,
    height: 720,
    title: 'Cue Master - 舞台投影輸出 (Stage Output)',
    backgroundColor: '#000000',
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true
    }
  };

  if (externalDisplay) {
    windowOptions.x = externalDisplay.bounds.x;
    windowOptions.y = externalDisplay.bounds.y;
    windowOptions.fullscreen = true;
    windowOptions.frame = false;
  } else {
    // 單螢幕測試時：自動將舞台視窗縮小置於右下角 (PiP 子母畫面)，不遮蔽主控台
    const primary = screen.getPrimaryDisplay();
    const w = 560;
    const h = 315;
    windowOptions.width = w;
    windowOptions.height = h;
    windowOptions.x = Math.max(0, primary.workArea.width - w - 20);
    windowOptions.y = Math.max(0, primary.workArea.height - h - 20);
    windowOptions.alwaysOnTop = true;
  }

  stageWindow = new BrowserWindow(windowOptions);
  stageWindow.loadURL(`http://localhost:${PORT}/stage`);

  stageWindow.on('closed', () => {
    stageWindow = null;
  });

  return { success: true, isExternal: !!externalDisplay, alreadyOpen: false };
}

app.whenReady().then(() => {
  startInternalServer();
  createMainWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createMainWindow();
  });
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});
