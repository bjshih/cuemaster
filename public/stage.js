const videoEl = document.getElementById('video-player');
const imageEl = document.getElementById('image-viewer');
const fsBtn = document.getElementById('fs-hint');
const subtitleLayer = document.getElementById('subtitle-layer');
const subtitleBox = document.getElementById('subtitle-box');
const subtitleMain = document.getElementById('subtitle-main');

let ws = null;
let currentFadeAnim = null;

// 判斷是否為歌詞（歌詞靠右對齊）
function isLyricsText(text) {
  if (!text) return false;
  return /^[♪♫]|(?:[♪♫]|【歌詞?】|\[歌詞?\]|（唱|歌詞?）|\(唱|歌詞?\))/.test(text);
}

// Fullscreen Toggle
fsBtn.addEventListener('click', () => {
  if (!document.fullscreenElement) {
    document.documentElement.requestFullscreen().catch(() => {});
  } else {
    document.exitFullscreen().catch(() => {});
  }
});

function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const wsUrl = `${protocol}//${window.location.host}`;
  ws = new WebSocket(wsUrl);

  ws.onopen = () => {
    console.log('[Stage] WebSocket Connected');
    ws.send(JSON.stringify({ type: 'REGISTER', role: 'stage' }));
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      handleStageCommand(msg);
    } catch (e) {
      console.error('[Stage] Message error:', e);
    }
  };

  ws.onclose = () => {
    console.warn('[Stage] WebSocket Closed, reconnecting in 1.5s...');
    setTimeout(connectWebSocket, 1500);
  };
}

function handleStageCommand(msg) {
  switch (msg.type) {
    case 'STAGE_VIDEO_PLAY':
      playVideo(msg.src, msg.opacity ?? 1, msg.fadeInDuration ?? 0);
      break;

    case 'STAGE_IMAGE_SHOW':
      showImage(msg.src, msg.opacity ?? 1, msg.fadeInDuration ?? 0);
      break;

    case 'STAGE_FADE':
      fadeMedia(msg.targetType, msg.targetOpacity, msg.duration, msg.stopWhenDone);
      break;

    case 'STAGE_STOP':
      stopAllMedia(msg.fadeDuration ?? 0);
      break;

    case 'STAGE_PANIC':
      panicStop();
      break;

    case 'SUBTITLE_SHOW':
      showSubtitle(msg);
      break;

    case 'SUBTITLE_CLEAR':
      clearSubtitle();
      break;

    case 'SUBTITLE_STYLE':
      applySubtitleStyle(msg);
      break;
  }
}

function showSubtitle(data) {
  if (!subtitleLayer) return;
  if (!data || !data.text) {
    clearSubtitle();
    return;
  }

  // 樣式更新
  applySubtitleStyle(data);

  // 畫面排版對齊：靠右對齊 (歌詞)、靠左對齊 (歌詞)、或預設居中
  subtitleLayer.classList.remove('align-center', 'align-right', 'align-left');
  if (data.align === 'right') {
    subtitleLayer.classList.add('align-right');
    subtitleBox.classList.add('no-bg');
  } else if (data.align === 'left') {
    subtitleLayer.classList.add('align-left');
    subtitleBox.classList.add('no-bg');
  } else {
    subtitleLayer.classList.add('align-center');
    if (data.showBg !== false) {
      subtitleBox.classList.remove('no-bg');
    }
  }

  subtitleMain.textContent = data.text || '';
  subtitleLayer.style.opacity = '1';
}

function clearSubtitle() {
  if (!subtitleLayer) return;
  subtitleLayer.style.opacity = '0';
  setTimeout(() => {
    if (subtitleLayer.style.opacity === '0') {
      subtitleMain.textContent = '';
    }
  }, 100);
}

function applySubtitleStyle(style = {}) {
  if (!subtitleLayer || !subtitleBox) return;

  if (style.position) {
    subtitleLayer.classList.remove('pos-bottom', 'pos-center', 'pos-top');
    subtitleLayer.classList.add(`pos-${style.position}`);
  }

  if (style.fontSize && subtitleMain) {
    subtitleMain.style.fontSize = `${style.fontSize}px`;
  }

  if (typeof style.showBg === 'boolean') {
    if (style.showBg) {
      subtitleBox.classList.remove('no-bg');
    } else {
      subtitleBox.classList.add('no-bg');
    }
  }
}

function playVideo(src, targetOpacity, fadeInDuration) {
  // 當新視訊開始播放時，自動隱藏前一張非覆蓋圖片，避免殘留黑塊遮擋影片
  imageEl.style.transition = fadeInDuration > 0 ? `opacity ${fadeInDuration}s ease-in-out` : 'none';
  imageEl.style.opacity = '0';
  setTimeout(() => {
    if (imageEl.style.opacity === '0') imageEl.src = '';
  }, (fadeInDuration || 0.1) * 1000);

  // 重設視訊轉場與載入
  videoEl.style.transition = 'none';
  videoEl.style.opacity = fadeInDuration > 0 ? '0' : targetOpacity.toString();
  videoEl.src = src;
  videoEl.currentTime = 0;

  videoEl.play().then(() => {
    if (fadeInDuration > 0) {
      requestAnimationFrame(() => {
        videoEl.style.transition = `opacity ${fadeInDuration}s ease-in-out`;
        videoEl.style.opacity = targetOpacity.toString();
      });
    }
  }).catch(e => {
    console.error('[Stage] Video play failed:', e);
  });
}

function showImage(src, targetOpacity, fadeInDuration) {
  // 若為純黑圖檔或黑幕指令，直接切換為純黑畫布，不覆蓋小黑塊
  const isBlackout = src.includes('黑色') || src.includes('黑幕') || src.toLowerCase().includes('black');
  if (isBlackout) {
    videoEl.pause();
    videoEl.style.opacity = '0';
    videoEl.src = '';
    imageEl.style.opacity = '0';
    imageEl.src = '';
    return;
  }

  imageEl.style.transition = 'none';
  imageEl.style.opacity = fadeInDuration > 0 ? '0' : targetOpacity.toString();
  imageEl.src = src;

  if (fadeInDuration > 0) {
    requestAnimationFrame(() => {
      imageEl.style.transition = `opacity ${fadeInDuration}s ease-in-out`;
      imageEl.style.opacity = targetOpacity.toString();
    });
  }
}

function fadeMedia(targetType, targetOpacity, duration, stopWhenDone) {
  const elements = [];
  if (targetType === 'video' || !targetType) elements.push(videoEl);
  if (targetType === 'image' || !targetType) elements.push(imageEl);

  elements.forEach(el => {
    el.style.transition = `opacity ${duration}s ease-in-out`;
    el.style.opacity = targetOpacity.toString();
    if (el.tagName === 'VIDEO' && targetOpacity > 0 && el.paused && el.src) {
      el.play().catch(e => console.warn('[Stage] Video play during fade-in:', e));
    }
  });

  if (stopWhenDone && targetOpacity === 0) {
    setTimeout(() => {
      elements.forEach(el => {
        if (el.style.opacity === '0') {
          if (el.tagName === 'VIDEO') {
            el.pause();
            el.src = '';
          } else {
            el.src = '';
          }
        }
      });
    }, duration * 1000);
  }
}

function stopAllMedia(fadeDuration = 0) {
  if (fadeDuration > 0) {
    fadeMedia(null, 0, fadeDuration, true);
  } else {
    videoEl.style.transition = 'none';
    imageEl.style.transition = 'none';
    videoEl.style.opacity = '0';
    imageEl.style.opacity = '0';
    videoEl.pause();
    videoEl.src = '';
    imageEl.src = '';
  }
}

function panicStop() {
  videoEl.style.transition = 'none';
  imageEl.style.transition = 'none';
  videoEl.style.opacity = '0';
  imageEl.style.opacity = '0';
  videoEl.pause();
  videoEl.src = '';
  imageEl.src = '';
  clearSubtitle();
}

// 舞台視窗鍵盤即時直控 (當舞台輸出處於焦點或投影全螢幕時，按 PageDown 亦可直接推進字幕)
window.addEventListener('keydown', (e) => {
  if (e.code === 'PageDown') {
    e.preventDefault();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'SUBTITLE_KEY', action: 'next' }));
    }
  } else if (e.code === 'PageUp') {
    e.preventDefault();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'SUBTITLE_KEY', action: 'prev' }));
    }
  } else if (e.code === 'Backslash' || e.code === 'Backquote') {
    e.preventDefault();
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({ type: 'SUBTITLE_KEY', action: 'toggleBlank' }));
    }
  }
});

connectWebSocket();
