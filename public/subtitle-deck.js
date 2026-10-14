// Cue Master - 舞台即時字幕控制台邏輯 (Subtitle Deck)

let ws = null;
let script = [];
let currentIndex = -1;
let isVisible = false;
let currentStyle = {
  position: 'bottom',
  fontSize: 46,
  showBg: true
};

// DOM 元素快取
const badgeWs = document.getElementById('badge-ws');
const badgeStage = document.getElementById('badge-stage');
const statIndex = document.getElementById('stat-index');
const statTotal = document.getElementById('stat-total');

const hudPrevText = document.getElementById('hud-prev-text');
const hudOnAirRow = document.getElementById('hud-on-air-row');
const badgeOnAirStatus = document.getElementById('badge-onair-status');
const hudCurrentMain = document.getElementById('hud-current-main');
const hudCurrentSub = document.getElementById('hud-current-sub');
const hudNextText = document.getElementById('hud-next-text');

const scriptListEl = document.getElementById('script-list');
const btnGo = document.getElementById('btn-go');
const btnBlank = document.getElementById('btn-blank');
const labelBlank = document.getElementById('label-blank');
const btnBack = document.getElementById('btn-back');

const selectPos = document.getElementById('select-pos');
const rangeFontSize = document.getElementById('range-font-size');
const valFontSize = document.getElementById('val-font-size');
const checkBg = document.getElementById('check-bg');

const modalLoad = document.getElementById('modal-load');
const btnOpenLoadModal = document.getElementById('btn-open-load-modal');
const btnCloseModal = document.getElementById('btn-close-modal');
const btnCancelModal = document.getElementById('btn-cancel-modal');
const btnConfirmLoad = document.getElementById('btn-confirm-load');
const btnLoadDemo = document.getElementById('btn-load-demo');
const fileInput = document.getElementById('file-input');
const textareaScript = document.getElementById('textarea-script');

// 示範劇本 (純台詞與歌詞，支援一頁多行與 [歌詞靠右]、[歌詞靠左])
const DEMO_SCRIPT_TEXT = `今晚的夜空格外澄澈
你看，天上的星光正在閃爍

是啊，月亮也慢慢升起來了
照亮了整座沉睡的城市

[歌詞靠右]
夜空中的那顆星
指引著我們前行
穿越漫長的黑夜
尋找心中的約定

月光輕輕灑落在你的肩膀
就像溫柔的歌聲陪伴在身旁

[歌詞靠左]
風在林梢低吟
水在溪谷流淌
我們攜手走過
四季的變換

[歌詞靠右]
無論夜有多深
無論路有多遠
只要星月相伴
光芒永遠不滅

當第一道曙光劃破夜空
我們將迎來全新的黎明`;

// 1. 初始化 WebSocket
function initWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    badgeWs.textContent = 'WS: 已連線';
    badgeWs.classList.add('connected');
    ws.send(JSON.stringify({ type: 'REGISTER', role: 'subtitle-deck' }));
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleServerMessage(msg);
    } catch (e) {
      console.error('[Subtitle Deck] Parse error:', e);
    }
  };

  ws.onclose = () => {
    badgeWs.textContent = 'WS: 斷線重連中';
    badgeWs.classList.remove('connected');
    setTimeout(initWebSocket, 1500);
  };
}

function handleServerMessage(msg) {
  switch (msg.type) {
    case 'SYSTEM_STATUS':
      if (msg.stageConnected) {
        badgeStage.textContent = '舞台投影: 已連線';
        badgeStage.classList.add('connected');
      } else {
        badgeStage.textContent = '舞台投影: 離線';
        badgeStage.classList.remove('connected');
      }
      break;

    case 'SUBTITLE_STATE_SYNC':
      if (msg.state) {
        if (msg.state.script && msg.state.script.length > 0) {
          script = msg.state.script;
          renderScriptList();
        }
        if (msg.state.style) {
          currentStyle = Object.assign(currentStyle, msg.state.style);
          updateStyleUI();
        }
        currentIndex = msg.state.currentIndex ?? -1;
        isVisible = !!msg.state.isVisible;
        updateDisplayHUD();
      }
      break;

    case 'SUBTITLE_SHOW':
      currentIndex = msg.index ?? currentIndex;
      isVisible = true;
      updateDisplayHUD();
      break;

    case 'SUBTITLE_CLEAR':
    case 'STAGE_PANIC':
      isVisible = false;
      updateDisplayHUD();
      break;

    case 'SUBTITLE_STYLE':
      currentStyle = Object.assign(currentStyle, msg);
      updateStyleUI();
      break;
  }
}

// 2. 劇本解析核心 (僅支援 TXT，支援一頁多行與 [歌詞靠右]、[歌詞靠左])
function parseScriptText(rawText) {
  if (!rawText) return [];
  const cleaned = rawText.replace(/^\uFEFF/, '').trim();
  const parsed = [];
  const hasParagraphs = /\r?\n\s*\r?\n/.test(cleaned);
  const blocks = hasParagraphs ? cleaned.split(/\r?\n\s*\r?\n/) : cleaned.split(/\r?\n/);

  blocks.forEach((block) => {
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

// 3. UI 渲染與滾動
function renderScriptList() {
  scriptListEl.innerHTML = '';
  statTotal.textContent = script.length.toString();

  script.forEach((item, idx) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'script-item';
    itemEl.id = `script-item-${idx}`;

    if (item.align === 'right') {
      itemEl.classList.add('lyrics-right-item');
    } else if (item.align === 'left') {
      itemEl.classList.add('lyrics-left-item');
    }

    const linesHtml = escapeHtml(item.text).split('\n').join('<br/>');

    let badgeHtml = '';
    if (item.align === 'right') {
      badgeHtml = '<span class="item-badge" style="background:#7e22ce;color:#e9d5ff;">[歌詞靠右]</span>';
    } else if (item.align === 'left') {
      badgeHtml = '<span class="item-badge" style="background:#2563eb;color:#dbeafe;">[歌詞靠左]</span>';
    }

    itemEl.innerHTML = `
      <div class="item-index">${idx + 1}</div>
      <div class="item-content">
        <div class="item-text">
          ${badgeHtml}${linesHtml}
        </div>
      </div>
    `;

    itemEl.title = '雙擊此台詞立刻播放 (緊急處置)';

    itemEl.addEventListener('click', () => {
      jumpTo(idx);
    });

    // 雙擊任意字幕行：立刻播放的臨時緊急處置
    itemEl.addEventListener('dblclick', () => {
      jumpTo(idx);
    });

    scriptListEl.appendChild(itemEl);
  });

  updateDisplayHUD();
}

function updateDisplayHUD() {
  statIndex.textContent = currentIndex >= 0 ? (currentIndex + 1).toString() : '--';

  // 清除舊高亮
  document.querySelectorAll('.script-item').forEach(el => {
    el.classList.remove('current', 'next-up');
  });

  // 更新 HUD 上一句
  if (currentIndex > 0 && script[currentIndex - 1]) {
    const prevLine = script[currentIndex - 1].text.split('\n')[0];
    hudPrevText.textContent = `${currentIndex}. ${prevLine}`;
  } else {
    hudPrevText.textContent = '（無上一句）';
  }

  // 更新 HUD 當前句 (ON-AIR)
  const currentLine = script[currentIndex];
  if (currentLine) {
    hudCurrentMain.textContent = currentLine.text;
    if (hudCurrentSub) hudCurrentSub.style.display = 'none';

    // 當前清單標記
    const curEl = document.getElementById(`script-item-${currentIndex}`);
    if (curEl) {
      curEl.classList.add('current');
      curEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } else {
    hudCurrentMain.textContent = script.length > 0 ? '請按 [PageDown] 開始放映' : '未載入劇本';
    if (hudCurrentSub) hudCurrentSub.style.display = 'none';
  }

  // 更新 HUD 下一句
  const nextIdx = currentIndex + 1;
  if (nextIdx < script.length && script[nextIdx]) {
    hudNextText.textContent = `${nextIdx + 1}. ${script[nextIdx].text}`;
    const nextEl = document.getElementById(`script-item-${nextIdx}`);
    if (nextEl) nextEl.classList.add('next-up');
  } else {
    hudNextText.textContent = '-- 全劇終 --';
  }

  // 更新 ON-AIR 徽章與狀態外框
  if (isVisible && currentLine && !currentLine.isStageDirection) {
    hudOnAirRow.classList.remove('blank');
    hudOnAirRow.classList.add('active');
    badgeOnAirStatus.className = 'badge-onair live';
    badgeOnAirStatus.textContent = 'ON-AIR';
    labelBlank.textContent = 'BLANK 黑幕隱藏';
  } else {
    hudOnAirRow.classList.add('blank');
    hudOnAirRow.classList.remove('active');
    badgeOnAirStatus.className = 'badge-onair blank-mode';
    badgeOnAirStatus.textContent = isVisible && currentLine?.isStageDirection ? 'STAGE DIR' : 'BLANK';
    labelBlank.textContent = 'TAKE 亮出字幕';
  }
}

// 4. 控制指令邏輯
function goNext() {
  if (script.length === 0) return;

  if (currentIndex < script.length - 1) {
    currentIndex++;
    const cur = script[currentIndex];
    if (cur.isStageDirection) {
      // 舞台指示：畫面不投出，清空舞台
      sendClear();
      isVisible = false;
    } else {
      sendShow(currentIndex);
      isVisible = true;
    }
    updateDisplayHUD();
  }
}

function goBack() {
  if (script.length === 0) return;

  if (currentIndex > 0) {
    currentIndex--;
    const cur = script[currentIndex];
    if (cur.isStageDirection) {
      sendClear();
      isVisible = false;
    } else {
      sendShow(currentIndex);
      isVisible = true;
    }
    updateDisplayHUD();
  }
}

function toggleBlank() {
  if (script.length === 0 || currentIndex < 0) return;

  const cur = script[currentIndex];
  if (isVisible) {
    // 目前亮著 -> 黑幕清空
    sendClear();
    isVisible = false;
  } else {
    // 目前黑幕 -> 重新亮起當前句
    if (cur && !cur.isStageDirection) {
      sendShow(currentIndex);
      isVisible = true;
    }
  }
  updateDisplayHUD();
}

function jumpTo(idx) {
  if (idx < 0 || idx >= script.length) return;
  currentIndex = idx;
  const cur = script[currentIndex];
  if (cur.isStageDirection) {
    sendClear();
    isVisible = false;
  } else {
    sendShow(currentIndex);
    isVisible = true;
  }
  updateDisplayHUD();
}

// 5. WebSocket 發送
function sendShow(idx) {
  const line = script[idx];
  if (!line) return;

  const payload = {
    type: 'SUBTITLE_SHOW',
    index: idx,
    text: line.text,
    align: line.align || (isLyricsText(line.text) ? 'right' : 'center'),
    position: currentStyle.position,
    fontSize: currentStyle.fontSize,
    showBg: currentStyle.showBg
  };

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(payload));
  }
}

function sendClear() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'SUBTITLE_CLEAR' }));
  }
}

function sendStyleUpdate() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'SUBTITLE_STYLE',
      ...currentStyle
    }));
  }
}

function sendLoadScript(newScript) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'SUBTITLE_LOAD',
      script: newScript
    }));
  }
}

// 6. 樣式調整處理
function updateStyleUI() {
  selectPos.value = currentStyle.position || 'bottom';
  rangeFontSize.value = currentStyle.fontSize || 46;
  valFontSize.textContent = rangeFontSize.value;
  checkBg.checked = !!currentStyle.showBg;
}

selectPos.addEventListener('change', () => {
  currentStyle.position = selectPos.value;
  sendStyleUpdate();
});

rangeFontSize.addEventListener('input', () => {
  currentStyle.fontSize = parseInt(rangeFontSize.value, 10);
  valFontSize.textContent = rangeFontSize.value;
  sendStyleUpdate();
});

checkBg.addEventListener('change', () => {
  currentStyle.showBg = checkBg.checked;
  sendStyleUpdate();
});

// 7. 按鈕事件綁定
btnGo.addEventListener('click', goNext);
btnBack.addEventListener('click', goBack);
btnBlank.addEventListener('click', toggleBlank);

// 8. 鍵盤快捷鍵監聽
window.addEventListener('keydown', (e) => {
  // 如果正在輸入 Modal 文字框，不搶鍵盤
  if (modalLoad.classList.contains('show')) return;

  switch (e.code) {
    case 'PageDown':
      e.preventDefault();
      goNext();
      break;

    case 'PageUp':
      e.preventDefault();
      goBack();
      break;

    case 'KeyB':
    case 'Backslash':
    case 'Backquote':
    case 'Escape':
      e.preventDefault();
      toggleBlank();
      break;
  }
});

// 9. 劇本載入 Modal 處理
btnOpenLoadModal.addEventListener('click', () => {
  modalLoad.classList.add('show');
  textareaScript.focus();
});

btnCloseModal.addEventListener('click', () => {
  modalLoad.classList.remove('show');
});

btnCancelModal.addEventListener('click', () => {
  modalLoad.classList.remove('show');
});

btnConfirmLoad.addEventListener('click', () => {
  const text = textareaScript.value.trim();
  if (!text) {
    alert('請輸入或貼上劇本內容！');
    return;
  }
  loadScriptFromRawText(text, '手動輸入');
});

// 通用載入劇本方法
function loadScriptFromRawText(rawText, sourceName = '') {
  const parsed = parseScriptText(rawText);
  if (parsed.length === 0) {
    alert('未解析到有效台詞行，請確認檔案格式！');
    return;
  }
  script = parsed;
  currentIndex = -1;
  isVisible = false;
  renderScriptList();
  sendLoadScript(script);
  if (modalLoad.classList.contains('show')) {
    modalLoad.classList.remove('show');
  }
  showToast(`已成功載入劇本${sourceName ? ' (' + sourceName + ')' : ''}，共 ${script.length} 句`);
}

// 頂部直接載入檔案按鈕
const directFileInput = document.getElementById('direct-file-input');
if (directFileInput) {
  directFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.onload = (evt) => {
      loadScriptFromRawText(evt.target.result, file.name);
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = ''; // 重設以便可重複選同檔名
  });
}

// Modal 內選取檔案
fileInput.addEventListener('change', (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = (evt) => {
    textareaScript.value = evt.target.result;
    loadScriptFromRawText(evt.target.result, file.name);
  };
  reader.readAsText(file, 'UTF-8');
  e.target.value = '';
});

btnLoadDemo.addEventListener('click', () => {
  loadScriptFromRawText(DEMO_SCRIPT_TEXT, '示範劇本');
});

function showToast(msg) {
  const toast = document.getElementById('toast');
  if (!toast) return;
  toast.textContent = msg;
  toast.style.display = 'block';
  toast.style.opacity = '1';
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => {
    toast.style.opacity = '0';
    setTimeout(() => { toast.style.display = 'none'; }, 300);
  }, 2500);
}

function escapeHtml(str) {
  if (!str) return '';
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// 啟動 WebSocket
initWebSocket();
