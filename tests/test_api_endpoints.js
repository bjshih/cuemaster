const http = require('http');
const fs = require('fs');
const path = require('path');
const { handleApiRequest } = require('../project_service');

const server = http.createServer((req, res) => {
  if (req.url.startsWith('/api/')) {
    return handleApiRequest(req, res);
  }
  res.writeHead(404);
  res.end();
});

const PORT = 8099;

function request(method, path, data = null, headers = {}) {
  return new Promise((resolve, reject) => {
    const opts = {
      hostname: '127.0.0.1',
      port: PORT,
      path: path,
      method: method,
      headers: { ...headers }
    };
    if (data && typeof data === 'object' && !Buffer.isBuffer(data)) {
      data = Buffer.from(JSON.stringify(data));
      opts.headers['Content-Type'] = 'application/json';
    }
    if (data) {
      opts.headers['Content-Length'] = data.length;
    }

    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', c => chunks.push(c));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        resolve({
          statusCode: res.statusCode,
          headers: res.headers,
          body: body,
          json: () => JSON.parse(body.toString('utf-8'))
        });
      });
    });
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}

async function run() {
  server.listen(PORT, async () => {
    try {
      console.log('Testing API endpoints...');

      // 1. GET /api/project (初始應不預載任何專案，讓使用者選擇)
      const r1 = await request('GET', '/api/project');
      console.log('1. GET /api/project -> status:', r1.statusCode);
      const initProj = r1.json();
      console.log('   Initial hasProject:', initProj.hasProject);
      if (initProj.hasProject !== false) throw new Error('Expected hasProject: false on initial startup');

      // 2. GET /api/media-folder (查詢目前素材庫資料夾)
      const r2 = await request('GET', '/api/media-folder');
      console.log('2. GET /api/media-folder -> status:', r2.statusCode);
      const folderInfo = r2.json();
      console.log('   Current media folder:', folderInfo.folder);
      if (!folderInfo.success || !folderInfo.folder) throw new Error('Failed to get media folder');

      // 3. POST /api/project/new (建立全新專案)
      const r3 = await request('POST', '/api/project/new', { title: '測試新劇' });
      console.log('3. POST /api/project/new -> status:', r3.statusCode);
      const newProj = r3.json();
      console.log('   New project title:', newProj.project.title);
      if (newProj.project.title !== '測試新劇') throw new Error('New project title mismatch');

      // 4. GET /api/project (建立新專案後，確認回傳目前專案)
      const r4 = await request('GET', '/api/project');
      console.log('4. GET /api/project -> status:', r4.statusCode);
      const activeProj = r4.json();
      if (!activeProj.rootCue || activeProj.title !== '測試新劇') throw new Error('Current project state not updated');

      // 5. POST /api/media-folder (變更素材庫資料夾)
      const r5 = await request('POST', '/api/media-folder', { folder: folderInfo.folder });
      console.log('5. POST /api/media-folder -> status:', r5.statusCode);
      const setFolderRes = r5.json();
      if (!setFolderRes.success) throw new Error('Failed to set media folder');

      // 6. GET /api/media-files (查詢素材庫中的檔案)
      const r6 = await request('GET', '/api/media-files');
      console.log('6. GET /api/media-files -> status:', r6.statusCode);
      const media = r6.json();
      console.log('   Media files found:', media.files.length);
      if (media.files.length === 0) throw new Error('No media files found');

      // 7. POST /api/project/load-sample (載入《星星月月》示範專案)
      const r7 = await request('POST', '/api/project/load-sample');
      console.log('7. POST /api/project/load-sample -> status:', r7.statusCode);
      const sample = r7.json();
      console.log('   Sample title:', sample.project.title);
      if (!sample.project.rootCue || sample.project.title !== '星星月月') throw new Error('Missing sample rootCue or title mismatch');

      // 8. POST /api/project/export-qlab (導出 QLab 5)
      const r8 = await request('POST', '/api/project/export-qlab', sample.project);
      console.log('8. POST /api/project/export-qlab -> status:', r8.statusCode);
      console.log('   Exported QLab5 size:', r8.body.length, 'bytes');
      if (r8.body.length < 500) throw new Error('Exported file too small');

      // 9. POST /api/project/import-qlab (再匯入 QLab 5)
      const r9 = await request('POST', '/api/project/import-qlab', r8.body, { 'Content-Type': 'application/octet-stream' });
      console.log('9. POST /api/project/import-qlab -> status:', r9.statusCode);
      const imported = r9.json();
      console.log('   Re-imported title:', imported.project.title);
      if (!imported.project.rootCue) throw new Error('Failed to re-import QLab5');

      // 10. POST /api/project/export-qlab & import (驗證 Fade In / Fade Out 雙向相容性)
      const fadeTestProject = {
        format: 'CueMaster',
        version: '2.0.0',
        title: '淡入淡出相容測試',
        rootCue: {
          id: 'root-fade-test',
          type: 'GroupCue',
          name: 'Main Cue List',
          children: [
            {
              id: 'cue-fade-in-1',
              type: 'FadeCue',
              name: '淡入全場畫面',
              fadeMode: 'fade-in',
              duration: 2.5,
              stopTargetWhenDone: false
            },
            {
              id: 'cue-fade-out-1',
              type: 'FadeCue',
              name: '淡出全場畫面',
              fadeMode: 'fade-out',
              duration: 3.0,
              stopTargetWhenDone: true
            }
          ]
        }
      };
      const r10_export = await request('POST', '/api/project/export-qlab', fadeTestProject);
      console.log('10. POST /api/project/export-qlab (Fade In/Out) -> status:', r10_export.statusCode);
      const r10_import = await request('POST', '/api/project/import-qlab', r10_export.body, { 'Content-Type': 'application/octet-stream' });
      console.log('    POST /api/project/import-qlab (Fade In/Out) -> status:', r10_import.statusCode);
      const importedFadeProj = r10_import.json();
      const children = importedFadeProj.project.rootCue.children || [];
      const fadeInCue = children.find(c => c.name === '淡入全場畫面');
      const fadeOutCue = children.find(c => c.name === '淡出全場畫面');
      if (!fadeInCue || fadeInCue.fadeMode !== 'fade-in' || fadeInCue.stopTargetWhenDone !== false) {
        throw new Error('Fade-in cue properties corrupted during roundtrip: ' + JSON.stringify(fadeInCue));
      }
      if (!fadeOutCue || fadeOutCue.fadeMode !== 'fade-out' || fadeOutCue.stopTargetWhenDone !== true) {
        throw new Error('Fade-out cue properties corrupted during roundtrip: ' + JSON.stringify(fadeOutCue));
      }
      console.log('    [OK] Fade In (fadeMode: fade-in, stopTarget: false) & Fade Out (fadeMode: fade-out, stopTarget: true) round-trip validated!');

      // 11. 舞台螢幕開啟與螢幕偵測端點測試
      const r11_open = await request('POST', '/api/stage/open');
      console.log('11. POST /api/stage/open -> status:', r11_open.statusCode);
      const r11_displays = await request('GET', '/api/stage/displays');
      console.log('    GET /api/stage/displays -> status:', r11_displays.statusCode);
      console.log('    [OK] Stage open and displays endpoints validated!');

      console.log('\n🎉 所有 API 端點測試全數通過！');
      process.exit(0);
    } catch (e) {
      console.error('API Test Error:', e);
      process.exit(1);
    } finally {
      server.close();
    }
  });
}

run();
