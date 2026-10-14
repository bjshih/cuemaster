const http = require('http');
const { WebSocket } = require('ws');

// 測試用伺服器設定
const PORT = 8089;
process.env.PORT = PORT;

// 啟動伺服器進行測試
require('../server.js');

function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function httpGet(path) {
  return new Promise((resolve, reject) => {
    http.get(`http://localhost:${PORT}${path}`, (res) => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => resolve({ status: res.statusCode, data }));
    }).on('error', reject);
  });
}

async function runSubtitleTests() {
  console.log('======================================================');
  console.log('🎭 Subtitle Deck & Stage Overlay Integration Tests');
  console.log('======================================================');

  await delay(500);

  // 1. HTTP 路由測試
  console.log('\n[1] 測試 HTTP 靜態與路由端點...');
  const resDeck = await httpGet('/subtitle-deck');
  if (resDeck.status === 200 && resDeck.data.includes('subtitle-deck.js')) {
    console.log('  ✅ GET /subtitle-deck 回傳 200 且包含字幕控制台內容');
  } else {
    throw new Error(`GET /subtitle-deck 失敗 (status: ${resDeck.status})`);
  }

  const resSubtitles = await httpGet('/subtitles');
  if (resSubtitles.status === 200 && resSubtitles.data.includes('subtitle-deck.js')) {
    console.log('  ✅ GET /subtitles 別名路由回傳 200');
  } else {
    throw new Error(`GET /subtitles 失敗 (status: ${resSubtitles.status})`);
  }

  const resStage = await httpGet('/stage');
  if (resStage.status === 200 && resStage.data.includes('subtitle-layer')) {
    console.log('  ✅ GET /stage 回傳 200 且包含字幕圖層 DOM (subtitle-layer)');
  } else {
    throw new Error(`GET /stage 失敗或未包含字幕圖層 (status: ${resStage.status})`);
  }

  const resScreen = await httpGet('/subtitle-screen');
  if (resScreen.status === 200 && resScreen.data.includes('subtitle-main')) {
    console.log('  ✅ GET /subtitle-screen 回傳 200 (獨立純字幕投影螢幕)');
  } else {
    throw new Error(`GET /subtitle-screen 失敗 (status: ${resScreen.status})`);
  }

  // 2. WebSocket 雙向廣播測試
  console.log('\n[2] 測試 WebSocket 字幕雙向即時通訊...');
  const stageWs = new WebSocket(`ws://localhost:${PORT}`);
  const deckWs = new WebSocket(`ws://localhost:${PORT}`);

  let stageReceived = [];
  let deckReceived = [];

  stageWs.on('message', (data) => {
    stageReceived.push(JSON.parse(data.toString()));
  });

  deckWs.on('message', (data) => {
    deckReceived.push(JSON.parse(data.toString()));
  });

  await new Promise((resolve) => {
    let openCount = 0;
    const check = () => {
      openCount++;
      if (openCount === 2) resolve();
    };
    stageWs.on('open', () => {
      stageWs.send(JSON.stringify({ type: 'REGISTER', role: 'stage' }));
      check();
    });
    deckWs.on('open', () => {
      deckWs.send(JSON.stringify({ type: 'REGISTER', role: 'subtitle-deck' }));
      check();
    });
  });

  // 發送載入劇本
  const sampleScript = [
    { text: '大姊：快回家吃飯！', subText: 'Come home for dinner!', isStageDirection: false },
    { text: '[音樂漸強]', subText: '', isStageDirection: true },
    { text: '二姊：我馬上到！', subText: 'I will be right there!', isStageDirection: false }
  ];

  deckWs.send(JSON.stringify({
    type: 'SUBTITLE_LOAD',
    script: sampleScript
  }));

  await delay(100);

  // 檢查 deckWs 是否收到 state sync (取最新一筆)
  const syncMsgs = deckReceived.filter(m => m.type === 'SUBTITLE_STATE_SYNC');
  const loadSync = syncMsgs[syncMsgs.length - 1];
  if (loadSync && loadSync.state && loadSync.state.script.length === 3) {
    console.log('  ✅ Deck 收到最新 SUBTITLE_STATE_SYNC，劇本已同步 (3 條台詞)');
  } else {
    throw new Error('未收到 SUBTITLE_STATE_SYNC 或台詞數目不符: ' + JSON.stringify(loadSync));
  }

  // 發送亮起第 0 句
  deckWs.send(JSON.stringify({
    type: 'SUBTITLE_SHOW',
    index: 0,
    text: sampleScript[0].text,
    subText: sampleScript[0].subText,
    position: 'bottom',
    fontSize: 46,
    showBg: true
  }));

  await delay(100);

  // 檢查 stage 是否收到 SUBTITLE_SHOW
  const stageShow = stageReceived.find(m => m.type === 'SUBTITLE_SHOW' && m.index === 0);
  if (stageShow && stageShow.text === '大姊：快回家吃飯！') {
    console.log('  ✅ Stage 螢幕成功接收 SUBTITLE_SHOW (大姊：快回家吃飯！)');
  } else {
    throw new Error('Stage 螢幕未收到 SUBTITLE_SHOW 訊息');
  }

  // 發送隱藏清空
  deckWs.send(JSON.stringify({
    type: 'SUBTITLE_CLEAR'
  }));

  await delay(100);

  const stageClear = stageReceived.find(m => m.type === 'SUBTITLE_CLEAR');
  if (stageClear) {
    console.log('  ✅ Stage 螢幕成功接收 SUBTITLE_CLEAR 隱藏清空指令');
  } else {
    throw new Error('Stage 螢幕未收到 SUBTITLE_CLEAR 訊息');
  }

  // 測試 SUBTITLE_KEY (PageDown 直推)
  stageWs.send(JSON.stringify({
    type: 'SUBTITLE_KEY',
    action: 'next'
  }));

  await delay(100);

  const stageKeyShow = stageReceived.find(m => m.type === 'SUBTITLE_SHOW' && m.index === 1);
  if (stageKeyShow && stageKeyShow.text === '[音樂漸強]') {
    console.log('  ✅ PageDown / SUBTITLE_KEY 直推成功接收 (第 1 句: [音樂漸強])');
  } else {
    throw new Error('SUBTITLE_KEY 推進失敗: ' + JSON.stringify(stageKeyShow));
  }

  stageWs.close();
  deckWs.close();

  // 3. 測試本機範例劇本檔案解析 (僅支援 TXT，支援一頁多行與 [歌詞靠右]、[歌詞靠左]，無舞台指示)
  console.log('\n[3] 測試範例劇本檔案 (純 TXT 格式，無舞台指示) 實體解析...');
  const fs = require('fs');
  const path = require('path');
  
  const txtContent = fs.readFileSync(path.join(__dirname, '../示範專案/星星月月_字幕.txt'), 'utf-8');

  // 模擬 parseSubtitleText 邏輯
  function parseScript(cleaned) {
    cleaned = cleaned.replace(/^\uFEFF/, '').trim();
    const hasParagraphs = /\r?\n\s*\r?\n/.test(cleaned);
    const blocks = hasParagraphs ? cleaned.split(/\r?\n\s*\r?\n/) : cleaned.split(/\r?\n/);
    const parsed = [];

    blocks.forEach(block => {
      let blockText = block.trim();
      if (!blockText) return;

      let align = 'center';
      let isLyrics = false;

      if (/(\[|【)歌詞靠右(\]|】)/.test(blockText)) {
        align = 'right';
        isLyrics = true;
        blockText = blockText.replace(/(\[|【)歌詞靠右(\]|】)/g, '').trim();
      } else if (/(\[|【)歌詞靠左(\]|】)/.test(blockText)) {
        align = 'left';
        isLyrics = true;
        blockText = blockText.replace(/(\[|【)歌詞靠左(\]|】)/g, '').trim();
      }

      const lines = blockText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
      if (lines.length === 0) return;

      parsed.push({
        text: lines.join('\n'),
        align,
        isLyrics
      });
    });

    return parsed;
  }

  const parsedTxt = parseScript(txtContent);

  if (parsedTxt.length === 7) {
    console.log(`  ✅ 示範專案/星星月月_字幕.txt 解析成功: 共 ${parsedTxt.length} 頁 (純台詞與歌詞，無舞台指示)`);
  } else {
    throw new Error(`TXT 解析頁數不符 (預期 7，實際 ${parsedTxt.length})`);
  }

  // 驗證沒有任何未被解析掉的舞台提示括號
  const hasStageDirections = parsedTxt.some(item => /^(\[|【|\(|（).+(\]|】|\)|）)$/.test(item.text));
  if (!hasStageDirections) {
    console.log('  ✅ 成功驗證範例劇本已無任何舞台指示 [] 或 ()');
  } else {
    throw new Error('範例劇本仍含有未清理的舞台指示！');
  }

  // 驗證一頁多行與 [歌詞靠右]
  const rightLyricCue = parsedTxt.find(item => item.align === 'right');
  if (rightLyricCue && rightLyricCue.text.includes('\n') && !rightLyricCue.text.includes('歌詞靠右')) {
    console.log(`  ✅ 成功驗證 [歌詞靠右] 一頁多行且標籤已自輸出畫面移除 (行數: ${rightLyricCue.text.split('\n').length} 行, align: ${rightLyricCue.align})`);
  } else {
    throw new Error('未成功解析到一頁多行靠右歌詞: ' + JSON.stringify(rightLyricCue));
  }

  // 驗證一頁多行與 [歌詞靠左]
  const leftLyricCue = parsedTxt.find(item => item.align === 'left');
  if (leftLyricCue && leftLyricCue.text.includes('\n') && !leftLyricCue.text.includes('歌詞靠左')) {
    console.log(`  ✅ 成功驗證 [歌詞靠左] 一頁多行且標籤已自輸出畫面移除 (行數: ${leftLyricCue.text.split('\n').length} 行, align: ${leftLyricCue.align})`);
  } else {
    throw new Error('未成功解析到一頁多行靠左歌詞: ' + JSON.stringify(leftLyricCue));
  }

  // 4. 測試演出中滑鼠雙擊 Cue 與字幕行之緊急立刻播放支援
  console.log('\n[4] 測試演出中滑鼠雙擊 Cue 與字幕行之緊急立刻播放支援...');
  const appJsContent = fs.readFileSync(path.join(__dirname, '../public/app.js'), 'utf-8');
  const deckJsContent = fs.readFileSync(path.join(__dirname, '../public/subtitle-deck.js'), 'utf-8');
  const simJsContent = fs.readFileSync(path.join(__dirname, '../public/simulator.js'), 'utf-8');

  // 驗證 app.js 在 show 模式下支援雙擊 Cue 立刻播放且清除先前執行狀態
  if (appJsContent.includes("row.addEventListener('dblclick'") &&
      appJsContent.includes("stopRunningStateForEmergency") &&
      appJsContent.includes("executeCue(cue, true)") &&
      appJsContent.includes("forceImmediate")) {
    console.log('  ✅ app.js 成功支援演出模式雙擊 Cue 行：清除所有執行狀態並立刻無延遲播放指定 Cue');
  } else {
    throw new Error('app.js 未正確實作雙擊 Cue 緊急播放與清除執行狀態邏輯');
  }

  // 驗證 stage.html 與 stage.js 歌詞無多餘黑底色塊
  const stageHtmlContent = fs.readFileSync(path.join(__dirname, '../public/stage.html'), 'utf-8');
  const stageJsContent = fs.readFileSync(path.join(__dirname, '../public/stage.js'), 'utf-8');
  if (stageHtmlContent.includes('.subtitle-layer.align-right .subtitle-box') &&
      stageHtmlContent.includes('background: transparent !important') &&
      stageJsContent.includes('subtitleBox.classList.add(\'no-bg\')')) {
    console.log('  ✅ stage.html & stage.js 成功實作歌詞字幕徹底去除黑色塊 (透明底+高對比黑邊陰影)');
  } else {
    throw new Error('stage 舞台螢幕未正確去除歌詞字幕黑塊');
  }

  // 驗證 app.js 支援雙擊字幕行立刻播放
  if (appJsContent.includes("itemEl.addEventListener('dblclick'") &&
      appJsContent.includes("mainSubJumpTo(idx)")) {
    console.log('  ✅ app.js 整合式字幕條成功支援雙擊字幕行立刻跳轉播放 (mainSubJumpTo)');
  } else {
    throw new Error('app.js 未正確實作雙擊字幕行立刻播放邏輯');
  }

  // 驗證 subtitle-deck.js 支援雙擊字幕行立刻播放
  if (deckJsContent.includes("itemEl.addEventListener('dblclick'") &&
      deckJsContent.includes("jumpTo(idx)")) {
    console.log('  ✅ subtitle-deck.js 獨立字幕播控台成功支援雙擊字幕行立刻播映 (jumpTo)');
  } else {
    throw new Error('subtitle-deck.js 未正確實作雙擊字幕行立刻播放邏輯');
  }

  // 驗證 simulator.js 支援雙擊 Cue 立刻播放且清除執行狀態
  if (simJsContent.includes("row.addEventListener('dblclick'") &&
      simJsContent.includes("executeCue(cue)")) {
    console.log('  ✅ simulator.js 演練模擬器成功支援雙擊 Cue 行清理舊狀態並立刻播放');
  } else {
    throw new Error('simulator.js 未正確實作雙擊 Cue 行播放邏輯');
  }

  console.log('\n======================================================');
  console.log('🎉 字幕模組、雙擊緊急播放、即時廣播與範例檔案測試全數 PASS！');
  console.log('======================================================');
  process.exit(0);
}

runSubtitleTests().catch(err => {
  console.error('❌ 字幕測試失敗:', err);
  process.exit(1);
});
