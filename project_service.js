const fs = require('fs');
const path = require('path');
const { execFile, exec } = require('child_process');

const BASE_DIR = path.resolve(__dirname);
const MEDIA_BASE = path.join(BASE_DIR, '示範專案', 'media');
const DEFAULT_PROJECT_FILE = path.join(BASE_DIR, '示範專案', '星星月月.json');
const PYTHON_SCRIPT = path.join(BASE_DIR, 'src', 'qlab_bridge.py');

// 動態專案與媒體目錄狀態
let currentMediaDir = MEDIA_BASE;
let currentProject = null;
let folderPickerFn = null;

function getMediaDir() {
  return currentMediaDir;
}

function setMediaDir(folderPath) {
  if (!folderPath || typeof folderPath !== 'string') {
    return currentMediaDir;
  }
  let resolved = folderPath;
  if (!path.isAbsolute(resolved)) {
    resolved = path.resolve(BASE_DIR, folderPath);
  }
  if (!fs.existsSync(resolved)) {
    try {
      fs.mkdirSync(resolved, { recursive: true });
    } catch (e) {
      console.warn(`[ProjectService] 無法建立目錄 ${resolved}:`, e.message);
    }
  }
  currentMediaDir = resolved;
  if (currentProject) {
    currentProject.mediaBasePath = currentMediaDir;
  }
  return currentMediaDir;
}

function getCurrentProject() {
  return currentProject;
}

function setCurrentProject(proj) {
  currentProject = proj;
  if (proj && proj.mediaBasePath) {
    let mb = proj.mediaBasePath;
    if (!path.isAbsolute(mb)) {
      mb = path.resolve(BASE_DIR, mb);
    }
    if (fs.existsSync(mb)) {
      currentMediaDir = mb;
    }
  }
}

let stageOpenerFn = null;

function setFolderPicker(fn) {
  folderPickerFn = fn;
}

function setStageWindowOpener(fn) {
  stageOpenerFn = fn;
}

const BROWSE_SCRIPT = path.join(BASE_DIR, 'src', 'browse_folder.ps1');

async function browseFolder() {
  if (typeof folderPickerFn === 'function') {
    try {
      const selected = await folderPickerFn();
      if (selected) {
        setMediaDir(selected);
        return selected;
      }
    } catch (e) {
      console.warn('[browseFolder] folderPickerFn failed:', e.message);
    }
  }

  // macOS 平台原生對話框 (AppleScript)
  if (process.platform === 'darwin') {
    return new Promise((resolve) => {
      exec('osascript -e \'POSIX path of (choose folder with prompt "選擇專案素材資料夾 (Select Media Folder)")\'', (err, stdout) => {
        if (err) return resolve(null);
        const folder = (stdout || '').trim();
        if (folder && fs.existsSync(folder)) {
          setMediaDir(folder);
          resolve(folder);
        } else {
          resolve(null);
        }
      });
    });
  }

  // Windows 平台原生對話框 (PowerShell STA 置頂視窗)
  return new Promise((resolve) => {
    execFile('powershell.exe', [
      '-NoProfile',
      '-STA',
      '-ExecutionPolicy', 'Bypass',
      '-File', BROWSE_SCRIPT
    ], { encoding: 'utf-8' }, (err, stdout, stderr) => {
      if (err) {
        console.warn('[browseFolder] PowerShell 對話框呼叫失敗:', stderr || err.message);
        return resolve(null);
      }
      const folder = (stdout || '').trim();
      if (folder && fs.existsSync(folder)) {
        setMediaDir(folder);
        resolve(folder);
      } else {
        resolve(null);
      }
    });
  });
}

/**
 * 遞迴搜尋媒體目錄下的所有可用音訊、視訊、圖片檔案
 */
function scanMediaFiles(dir = currentMediaDir, baseDir = currentMediaDir) {
  let results = [];
  if (!fs.existsSync(dir)) return results;

  const validExts = new Set(['.mp4', '.mov', '.webm', '.png', '.jpg', '.jpeg', '.webp', '.bmp', '.svg', '.wav', '.mp3', '.m4a', '.aac']);
  const list = fs.readdirSync(dir, { withFileTypes: true });

  for (const item of list) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      if (item.name === '幸福三姊妹（正式演出版）V2 backups' || item.name === 'backups' || item.name === 'node_modules' || item.name === '.git') {
        continue;
      }
      results = results.concat(scanMediaFiles(fullPath, baseDir));
    } else if (item.isFile()) {
      const ext = path.extname(item.name).toLowerCase();
      if (validExts.has(ext)) {
        const rel = path.relative(baseDir, fullPath).replace(/\\/g, '/');
        const stat = fs.statSync(fullPath);
        results.push({
          path: rel,
          name: item.name,
          size: stat.size,
          ext: ext
        });
      }
    }
  }
  return results;
}

/**
 * 儲存專案至 JSON/cuemaster 檔案，並自動備份
 */
function saveProject(projectData, targetPath = DEFAULT_PROJECT_FILE) {
  if (!projectData || !projectData.rootCue) {
    throw new Error('專案資料格式錯誤：缺少 rootCue');
  }

  // 自動備份舊檔
  if (fs.existsSync(targetPath)) {
    try {
      const backupDir = path.join(BASE_DIR, 'backups');
      if (!fs.existsSync(backupDir)) fs.mkdirSync(backupDir, { recursive: true });
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
      const backupName = `${path.basename(targetPath, path.extname(targetPath))}_${timestamp}.json`;
      fs.copyFileSync(targetPath, path.join(backupDir, backupName));
    } catch (e) {
      console.warn('[ProjectService] 備份失敗:', e.message);
    }
  }

  setCurrentProject(projectData);
  fs.writeFileSync(targetPath, JSON.stringify(projectData, null, 2), 'utf-8');
  return { success: true, path: targetPath };
}

/**
 * 導出為相容 QLab 5 二進位檔
 */
function getPythonCommand() {
  if (process.platform === 'win32') return 'python';
  return 'python3';
}

function exportQLab5(projectData, outputQLabPath) {
  return new Promise((resolve, reject) => {
    const tempDir = path.join(BASE_DIR, 'backups');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
    
    const tempJson = path.join(tempDir, `temp_export_${Date.now()}.json`);
    fs.writeFileSync(tempJson, JSON.stringify(projectData, null, 2), 'utf-8');

    execFile(getPythonCommand(), [PYTHON_SCRIPT, '--export', tempJson, outputQLabPath], (err, stdout, stderr) => {
      try { fs.unlinkSync(tempJson); } catch (e) {}
      if (err) {
        return reject(new Error(`導出 QLab5 失敗: ${stderr || err.message}`));
      }
      resolve({ success: true, path: outputQLabPath, size: fs.statSync(outputQLabPath).size });
    });
  });
}

/**
 * 匯入 QLab 5 二進位檔
 */
function importQLab5(qlabFilePath) {
  return new Promise((resolve, reject) => {
    const tempDir = path.join(BASE_DIR, 'backups');
    if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });

    const tempJson = path.join(tempDir, `temp_import_${Date.now()}.json`);
    execFile(getPythonCommand(), [PYTHON_SCRIPT, '--import', qlabFilePath, tempJson], (err, stdout, stderr) => {
      if (err) {
        try { fs.unlinkSync(tempJson); } catch (e) {}
        return reject(new Error(`匯入 QLab5 失敗: ${stderr || err.message}`));
      }
      try {
        const data = JSON.parse(fs.readFileSync(tempJson, 'utf-8'));
        fs.unlinkSync(tempJson);
        setCurrentProject(data);
        resolve(data);
      } catch (e) {
        reject(e);
      }
    });
  });
}

/**
 * 建立全新空白專案範本
 */
function createNewProject(title = '未命名劇場專案', mediaFolder = null) {
  const chosenMedia = mediaFolder || currentMediaDir;
  const project = {
    format: 'CueMaster',
    version: '2.0.0',
    title: title,
    mediaBasePath: chosenMedia,
    rootCue: {
      id: 'cue_root',
      type: 'GroupCue',
      number: '',
      name: 'Main Cue List',
      preWait: 0.0,
      duration: 0.0,
      postWait: 0.0,
      continueMode: 0,
      groupMode: 1,
      fileTarget: '$null',
      children: [
        {
          id: 'cue_1',
          type: 'GroupCue',
          number: '1',
          name: '第一幕 開場',
          preWait: 0.0,
          duration: 0.0,
          postWait: 0.0,
          continueMode: 0,
          groupMode: 3,
          fileTarget: '$null',
          children: [
            {
              id: 'cue_2',
              type: 'AudioCue',
              number: '1.1',
              name: '開場音樂',
              preWait: 0.0,
              duration: 0.0,
              postWait: 0.0,
              continueMode: 0,
              groupMode: 1,
              fileTarget: '',
              children: []
            },
            {
              id: 'cue_3',
              type: 'VideoCue',
              number: '1.2',
              name: '開場影像',
              preWait: 0.0,
              duration: 0.0,
              postWait: 0.0,
              continueMode: 0,
              groupMode: 1,
              fileTarget: '',
              children: []
            }
          ]
        }
      ]
    }
  };
  setCurrentProject(project);
  return project;
}

/**
 * 讀取 HTTP Request Body 為 Buffer
 */
function readBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    req.on('data', chunk => chunks.push(chunk));
    req.on('end', () => resolve(Buffer.concat(chunks)));
    req.on('error', reject);
  });
}

/**
 * 統一處理所有 /api/* 請求
 */
async function handleApiRequest(req, res) {
  const url = decodeURIComponent(req.url.split('?')[0]);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

  if (req.method === 'OPTIONS') {
    res.writeHead(200);
    return res.end();
  }

  try {
    // 取得目前專案 (若尚未選擇則回傳 hasProject: false)
    if (url === '/api/project' && req.method === 'GET') {
      if (currentProject) {
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(currentProject));
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({
        hasProject: false,
        sampleAvailable: fs.existsSync(DEFAULT_PROJECT_FILE)
      }));
    }

    // 儲存目前專案
    if (url === '/api/project' && req.method === 'POST') {
      const body = await readBody(req);
      const projectData = JSON.parse(body.toString('utf-8'));
      const result = saveProject(projectData);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify(result));
    }

    // 取得目前素材庫根目錄路徑
    if (url === '/api/media-folder' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ success: true, folder: getMediaDir() }));
    }

    // 設定目前素材庫根目錄路徑
    if (url === '/api/media-folder' && req.method === 'POST') {
      const body = await readBody(req);
      let newFolder = '';
      if (body.length > 0) {
        try {
          const b = JSON.parse(body.toString('utf-8'));
          newFolder = b.folder;
        } catch (e) {}
      }
      const updated = setMediaDir(newFolder);
      const files = scanMediaFiles();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ success: true, folder: updated, fileCount: files.length }));
    }

    // 開啟系統原生資料夾選擇對話框 (Electron dialog 或 Windows Forms)
    if (url === '/api/browse-folder' && req.method === 'POST') {
      const selected = await browseFolder();
      const files = scanMediaFiles();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({
        success: true,
        canceled: !selected,
        folder: getMediaDir(),
        fileCount: files.length
      }));
    }

    // 舞台螢幕開啟 (Electron 支援副螢幕全螢幕自動彈出，瀏覽器模式返回 fallback 指示)
    if (url === '/api/stage/open' && req.method === 'POST') {
      if (typeof stageOpenerFn === 'function') {
        const result = await stageOpenerFn();
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify(result));
      }
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ success: false, inElectron: false }));
    }

    if (url === '/api/stage/displays' && req.method === 'GET') {
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ inElectron: typeof stageOpenerFn === 'function' }));
    }

    // 取得所有可用素材檔案清單
    if (url === '/api/media-files' && req.method === 'GET') {
      const files = scanMediaFiles();
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ success: true, folder: getMediaDir(), files }));
    }

    // 導出 / 下載為標準 QLab 5 二進位專案檔
    if (url === '/api/project/export-qlab' && req.method === 'POST') {
      const body = await readBody(req);
      let projectData;
      if (body.length > 0) {
        projectData = JSON.parse(body.toString('utf-8'));
      } else if (currentProject) {
        projectData = currentProject;
      } else {
        projectData = JSON.parse(fs.readFileSync(DEFAULT_PROJECT_FILE, 'utf-8'));
      }
      const title = (projectData.title || 'CueMaster_Show').replace(/[\\/:*?"<>|]/g, '_');
      const tempDir = path.join(BASE_DIR, 'backups');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      const tempOut = path.join(tempDir, `${title}_${Date.now()}.qlab5`);

      await exportQLab5(projectData, tempOut);

      const stat = fs.statSync(tempOut);
      res.writeHead(200, {
        'Content-Type': 'application/octet-stream',
        'Content-Disposition': `attachment; filename="${encodeURIComponent(title)}.qlab5"`,
        'Content-Length': stat.size
      });
      const stream = fs.createReadStream(tempOut);
      stream.pipe(res);
      stream.on('close', () => {
        try { fs.unlinkSync(tempOut); } catch (e) {}
      });
      return;
    }

    // 匯入使用者上傳的 .qlab5 二進位檔案
    if (url === '/api/project/import-qlab' && req.method === 'POST') {
      const body = await readBody(req);
      if (!body || body.length === 0) {
        res.writeHead(400, { 'Content-Type': 'application/json; charset=utf-8' });
        return res.end(JSON.stringify({ error: '未接收到 QLab 檔案資料' }));
      }
      const tempDir = path.join(BASE_DIR, 'backups');
      if (!fs.existsSync(tempDir)) fs.mkdirSync(tempDir, { recursive: true });
      const tempIn = path.join(tempDir, `upload_${Date.now()}.qlab5`);
      fs.writeFileSync(tempIn, body);

      try {
        const project = await importQLab5(tempIn);
        setCurrentProject(project);
        res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
        res.end(JSON.stringify({ success: true, project }));
      } finally {
        try { fs.unlinkSync(tempIn); } catch (e) {}
      }
      return;
    }

    // 建立新專案範本
    if (url === '/api/project/new' && req.method === 'POST') {
      const body = await readBody(req);
      let title = '未命名劇場專案';
      let mediaFolder = null;
      if (body.length > 0) {
        try {
          const b = JSON.parse(body.toString('utf-8'));
          if (b.title) title = b.title;
          if (b.mediaFolder) mediaFolder = b.mediaFolder;
        } catch (e) {}
      }
      const project = createNewProject(title, mediaFolder);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ success: true, project }));
    }

    // 載入《星星月月》示範專案檔
    if (url === '/api/project/load-sample' && req.method === 'POST') {
      const sampleQLab = path.join(BASE_DIR, '示範專案', '星星月月.qlab5');
      let project;
      if (fs.existsSync(DEFAULT_PROJECT_FILE)) {
        project = JSON.parse(fs.readFileSync(DEFAULT_PROJECT_FILE, 'utf-8'));
      } else if (fs.existsSync(sampleQLab)) {
        project = await importQLab5(sampleQLab);
      }
      setMediaDir(MEDIA_BASE);
      setCurrentProject(project);
      res.writeHead(200, { 'Content-Type': 'application/json; charset=utf-8' });
      return res.end(JSON.stringify({ success: true, project }));
    }

    res.writeHead(404, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: '找不到該 API 端點' }));
  } catch (err) {
    console.error('[API Error]:', err);
    res.writeHead(500, { 'Content-Type': 'application/json; charset=utf-8' });
    res.end(JSON.stringify({ error: err.message }));
  }
}

module.exports = {
  scanMediaFiles,
  saveProject,
  exportQLab5,
  importQLab5,
  createNewProject,
  handleApiRequest,
  getMediaDir,
  setMediaDir,
  setFolderPicker,
  setStageWindowOpener,
  browseFolder,
  getCurrentProject,
  setCurrentProject,
  DEFAULT_PROJECT_FILE,
  MEDIA_BASE
};
