// Cue Master - 實境演練模擬器核心 (Live Theater Simulator Core)
let audioCtx = null;
let analyserNode = null;
let projectData = null;
let flatCueList = [];
let standbyIndex = 0;
let isAutoPlaying = false;
let autoPlayTimer = null;
let activeAudios = new Map(); // cueId -> { audioEl, sourceNode, gainNode }

// DOM Elements
const cueListContainer = document.getElementById('cue-list-container');
const stageVideo = document.getElementById('stage-video');
const stageImage = document.getElementById('stage-image');
const stageHud = document.getElementById('stage-hud');
const stageStatus = document.getElementById('stage-status');
const opStatus = document.getElementById('op-status');
const vkeySpace = document.getElementById('vkey-space');
const vkeyEsc = document.getElementById('vkey-esc');

const btnAutoPlay = document.getElementById('btn-auto-play');
const btnPause = document.getElementById('btn-pause');
const btnPanic = document.getElementById('btn-panic');
const btnReset = document.getElementById('btn-reset');

const audioFileDisplay = document.getElementById('audio-current-file');
const vuL = document.getElementById('vu-l');
const vuR = document.getElementById('vu-r');
const canvas = document.getElementById('audio-canvas');
const canvasCtx = canvas.getContext('2d');

// Canvas Size
function resizeCanvas() {
  canvas.width = canvas.parentElement.clientWidth;
  canvas.height = canvas.parentElement.clientHeight || 90;
}
window.addEventListener('resize', resizeCanvas);
setTimeout(resizeCanvas, 100);

// Initialize Web Audio API & Analyser
function initAudio() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
    analyserNode = audioCtx.createAnalyser();
    analyserNode.fftSize = 64;
    analyserNode.smoothingTimeConstant = 0.8;
    analyserNode.connect(audioCtx.destination);
    startVisualizerLoop();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
}

// Live Visualizer Loop (Draws waveform & bounces VU meters)
function startVisualizerLoop() {
  const bufferLength = analyserNode.frequencyBinCount;
  const dataArray = new Uint8Array(bufferLength);

  function draw() {
    requestAnimationFrame(draw);
    analyserNode.getByteFrequencyData(dataArray);

    canvasCtx.fillStyle = '#0b0c0e';
    canvasCtx.fillRect(0, 0, canvas.width, canvas.height);

    const barWidth = (canvas.width / bufferLength) * 2.2;
    let x = 0;
    let totalVolume = 0;

    for (let i = 0; i < bufferLength; i++) {
      const barHeight = (dataArray[i] / 255) * canvas.height;
      totalVolume += dataArray[i];

      // Green to Cyan gradient
      canvasCtx.fillStyle = `rgb(${dataArray[i] / 2}, ${Math.min(255, 100 + dataArray[i])}, 240)`;
      canvasCtx.fillRect(x, canvas.height - barHeight, barWidth - 2, barHeight);
      x += barWidth;
    }

    // VU Meters
    const avgLevel = (totalVolume / bufferLength) / 255;
    const pct = Math.min(100, Math.round(avgLevel * 140));
    vuL.style.width = `${pct}%`;
    vuR.style.width = `${Math.max(0, pct + (Math.random() * 6 - 3))}%`;
  }

  draw();
}

// Load Show Data
async function loadShow() {
  try {
    const res = await fetch('/api/project');
    projectData = await res.json();
    buildCueList();
  } catch (e) {
    console.error('Failed to load show:', e);
  }
}

// Build Cue List
function buildCueList() {
  cueListContainer.innerHTML = '';
  flatCueList = [];

  const root = projectData.rootCue;
  if (!root || !root.children) return;

  let topItems = root.children;
  if (topItems.length === 1 && topItems[0].name === 'Main Cue List' && topItems[0].children) {
    topItems = topItems[0].children;
  }

  function traverse(cue, depth = 0) {
    flatCueList.push(cue);
    cue._depth = depth;

    const row = document.createElement('div');
    row.className = 'cue-row';
    row.id = `sim-row-${cue.id}`;
    cue._rowEl = row;

    let tagClass = 'group';
    let typeLabel = 'GRP';
    if (cue.type === 'AudioCue') { tagClass = 'audio'; typeLabel = 'AUD'; }
    else if (cue.type === 'VideoCue') { tagClass = 'video'; typeLabel = 'VID'; }
    else if (cue.type === 'FadeCue') { tagClass = 'fade'; typeLabel = 'FAD'; }

    const numStr = cue.number ? `#${cue.number}` : '';
    const preStr = cue.preWait > 0 ? `${cue.preWait.toFixed(1)}s` : '-';
    const durStr = cue.duration > 0 ? `${cue.duration.toFixed(1)}s` : '-';

    row.innerHTML = `
      <div><span id="sim-status-${cue.id}">⏸️</span></div>
      <div style="font-family: monospace; font-weight: 700; color: #93c5fd;">${numStr}</div>
      <div><span class="cue-tag ${tagClass}">${typeLabel}</span></div>
      <div style="font-family: monospace; color: #94a3b8;">${preStr}</div>
      <div style="font-family: monospace; color: #94a3b8;">${durStr}</div>
      <div style="padding-left: ${depth * 14}px; overflow: hidden; text-overflow: ellipsis; white-space: nowrap;">
        ${cue.children && cue.children.length ? '▼' : '•'} ${cue.name || '(未命名)'}
      </div>
    `;

    row.title = '雙擊立刻播放 (緊急處置)';

    row.addEventListener('click', () => {
      setStandbyIndex(flatCueList.indexOf(cue));
    });

    row.addEventListener('dblclick', () => {
      // 演出模擬中雙擊：先清除所有正在執行的音訊、視訊、畫面狀態
      activeAudios.forEach(({ audioEl }) => {
        try {
          audioEl.pause();
          audioEl.currentTime = 0;
        } catch(e) {}
      });
      activeAudios.clear();

      stageVideo.pause();
      stageVideo.style.opacity = '0';
      stageVideo.src = '';
      stageImage.style.opacity = '0';
      stageImage.src = '';

      flatCueList.forEach(c => {
        if (c._rowEl) {
          c._rowEl.classList.remove('running');
          const st = document.getElementById(`sim-status-${c.id}`);
          if (st) st.textContent = '⏸️';
        }
      });

      const cueIdx = flatCueList.indexOf(cue);
      if (cueIdx !== -1) {
        setStandbyIndex(cueIdx);
        executeCue(cue);
        const nextIdx = cueIdx + 1;
        if (nextIdx < flatCueList.length) {
          setStandbyIndex(nextIdx);
        }
      }
    });

    cueListContainer.appendChild(row);

    if (cue.children && cue.children.length) {
      cue.children.forEach(child => traverse(child, depth + 1));
    }
  }

  topItems.forEach(c => traverse(c, 0));

  if (flatCueList.length > 0) {
    setStandbyIndex(0);
  }
}

// Set Standby
function setStandbyIndex(idx) {
  if (idx < 0 || idx >= flatCueList.length) return;

  if (flatCueList[standbyIndex] && flatCueList[standbyIndex]._rowEl) {
    flatCueList[standbyIndex]._rowEl.classList.remove('standby');
  }

  standbyIndex = idx;
  const cue = flatCueList[standbyIndex];

  if (cue && cue._rowEl) {
    cue._rowEl.classList.add('standby');
    cue._rowEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
  }
}

// Flash Virtual Key
function flashKey(el) {
  el.classList.add('active');
  setTimeout(() => el.classList.remove('active'), 250);
}

// Execute Cue
function executeCue(cue) {
  if (!cue) return;
  initAudio();

  if (cue._rowEl) {
    cue._rowEl.classList.add('running');
    const st = document.getElementById(`sim-status-${cue.id}`);
    if (st) st.textContent = '▶️';
  }

  const delayMs = (cue.preWait || 0) * 1000;
  setTimeout(() => {
    runCueAction(cue);
  }, delayMs);
}

function runCueAction(cue) {
  if (cue.type === 'GroupCue') {
    if (cue.children && cue.children.length) {
      cue.children.forEach(child => executeCue(child));
    }
  } else if (cue.type === 'AudioCue') {
    playLiveAudio(cue);
  } else if (cue.type === 'VideoCue') {
    playLiveVideo(cue);
  } else if (cue.type === 'FadeCue') {
    executeLiveFade(cue);
  }

  if (cue.duration > 0) {
    setTimeout(() => {
      if (cue._rowEl) {
        cue._rowEl.classList.remove('running');
        const st = document.getElementById(`sim-status-${cue.id}`);
        if (st) st.textContent = '✅';
      }
    }, cue.duration * 1000);
  }
}

// Live Audio Playback (Routes to speakers + Analyser)
function playLiveAudio(cue) {
  if (!cue.fileTarget) return;

  const url = `/media/${encodeURIComponent(cue.fileTarget)}`;
  const audio = new Audio(url);
  audio.crossOrigin = 'anonymous';

  audio.addEventListener('canplay', () => {
    try {
      if (audioCtx && !audio._connected) {
        const source = audioCtx.createMediaElementSource(audio);
        const gainNode = audioCtx.createGain();
        source.connect(gainNode);
        gainNode.connect(analyserNode);
        audio._connected = true;
        activeAudios.set(cue.id, { audio, gainNode });
      }
    } catch (e) {}
  }, { once: true });

  audio.play().then(() => {
    audioFileDisplay.textContent = `▶️ ${cue.name || cue.fileTarget}`;
  }).catch(e => {
    console.warn('Audio play error:', e);
  });

  audio.onended = () => {
    activeAudios.delete(cue.id);
    if (activeAudios.size === 0) {
      audioFileDisplay.textContent = '無音訊輸出 (Idle)';
    }
  };
}

// Live Video / Image Projection
function playLiveVideo(cue) {
  if (!cue.fileTarget) return;

  const target = cue.fileTarget.toLowerCase();
  const url = `/media/${encodeURIComponent(cue.fileTarget)}`;

  if (target.endsWith('.mp4') || target.endsWith('.mov')) {
    stageImage.style.opacity = '0';
    stageVideo.style.transition = 'none';
    stageVideo.style.opacity = '0';
    stageVideo.src = url;
    stageVideo.currentTime = 0;

    stageVideo.play().then(() => {
      requestAnimationFrame(() => {
        stageVideo.style.transition = 'opacity 1.5s ease-in-out';
        stageVideo.style.opacity = '1';
        stageStatus.textContent = `播放視訊: ${cue.name || cue.fileTarget}`;
        stageHud.textContent = `影像: ${cue.fileTarget} (Alpha: 100%)`;
      });
    }).catch(e => {
      stageHud.textContent = `視訊載入中 / 舞台黑幕 (Alpha: 0%)`;
    });
  } else if (target.endsWith('.png') || target.endsWith('.jpg') || target.endsWith('.jpeg')) {
    const isBlackout = target.includes('黑色') || target.includes('黑幕') || target.includes('black');
    if (isBlackout) {
      stageVideo.pause();
      stageVideo.style.opacity = '0';
      stageVideo.src = '';
      stageImage.style.opacity = '0';
      stageImage.src = '';
      stageStatus.textContent = '舞台黑幕 (Blackout)';
      stageHud.textContent = '舞台全黑 (Alpha: 0%)';
      return;
    }

    stageVideo.style.opacity = '0';
    stageImage.style.transition = 'none';
    stageImage.style.opacity = '0';
    stageImage.src = url;

    requestAnimationFrame(() => {
      stageImage.style.transition = 'opacity 1.5s ease-in-out';
      stageImage.style.opacity = '1';
      stageStatus.textContent = `展示圖片: ${cue.name || cue.fileTarget}`;
      stageHud.textContent = `靜態圖: ${cue.fileTarget} (Alpha: 100%)`;
    });
  }
}

// Live Fade
function executeLiveFade(cue) {
  const isFadeIn = cue.fadeMode === 'fade-in' || (cue.name || '').toLowerCase().includes('fade in') || (cue.name || '').includes('淡入');
  const isFadeOut = !isFadeIn;
  const duration = cue.duration || 3.0;

  if (isFadeOut) {
    stageVideo.style.transition = `opacity ${duration}s ease-in-out`;
    stageImage.style.transition = `opacity ${duration}s ease-in-out`;
    stageVideo.style.opacity = '0';
    stageImage.style.opacity = '0';
    stageStatus.textContent = '舞台黑幕 (Blackout)';
    stageHud.textContent = `過渡: 淡出至全黑 (0%) - 耗時 ${duration}s`;

    // Fade Audio
    activeAudios.forEach((item, id) => {
      if (item.gainNode && audioCtx) {
        item.gainNode.gain.setValueAtTime(item.gainNode.gain.value, audioCtx.currentTime);
        item.gainNode.gain.linearRampToValueAtTime(0.001, audioCtx.currentTime + duration);
        setTimeout(() => {
          item.audio.pause();
          activeAudios.delete(id);
        }, duration * 1000);
      }
    });
  } else {
    // Fade In
    stageVideo.style.transition = `opacity ${duration}s ease-in-out`;
    stageImage.style.transition = `opacity ${duration}s ease-in-out`;
    stageVideo.style.opacity = '1';
    stageImage.style.opacity = '1';
    stageStatus.textContent = '舞台播放中 (Live)';
    stageHud.textContent = `過渡: 淡入至 100% - 耗時 ${duration}s`;

    // Fade In Audio
    activeAudios.forEach((item, id) => {
      if (item.gainNode && audioCtx) {
        if (item.audio.paused) {
          item.audio.play().catch(e => console.warn('Simulator audio play failed:', e));
        }
        item.gainNode.gain.setValueAtTime(item.gainNode.gain.value, audioCtx.currentTime);
        item.gainNode.gain.linearRampToValueAtTime(1.0, audioCtx.currentTime + duration);
      }
    });
  }
}

// Panic Function
function panic() {
  flashKey(vkeyEsc);
  console.warn('🚨 PANIC TRIGGERED!');

  stageVideo.style.transition = 'none';
  stageImage.style.transition = 'none';
  stageVideo.style.opacity = '0';
  stageImage.style.opacity = '0';
  stageVideo.pause();
  stageVideo.src = '';
  stageImage.src = '';
  stageStatus.textContent = '🚨 PANIC 緊急煞車純黑';
  stageHud.textContent = '舞台全黑 (Blackout)';

  activeAudios.forEach(item => {
    item.audio.pause();
  });
  activeAudios.clear();
  audioFileDisplay.textContent = '🚨 音訊全數煞車靜音';

  flatCueList.forEach(c => {
    if (c._rowEl) {
      c._rowEl.classList.remove('running');
      const st = document.getElementById(`sim-status-${c.id}`);
      if (st) st.textContent = '⏹️';
    }
  });
}

// Next Top-Level Cue
function getNextExecutableIndex(currIdx) {
  const current = flatCueList[currIdx];
  if (!current) return currIdx + 1;

  for (let i = currIdx + 1; i < flatCueList.length; i++) {
    if (flatCueList[i]._depth <= current._depth) {
      return i;
    }
  }
  return currIdx + 1;
}

// Operator GO Action
function operatorPressGo() {
  flashKey(vkeySpace);

  if (standbyIndex < 0 || standbyIndex >= flatCueList.length) return;

  const cue = flatCueList[standbyIndex];
  executeCue(cue);

  const nextIdx = getNextExecutableIndex(standbyIndex);
  if (nextIdx < flatCueList.length) {
    setStandbyIndex(nextIdx);
  } else {
    stopAutoPlay();
    opStatus.textContent = '演練完畢 (End of Show)';
  }
}

// Auto-Pilot Simulator Loop
function startAutoPlay() {
  if (isAutoPlaying) return;
  initAudio();
  isAutoPlaying = true;
  opStatus.textContent = '🤖 自動排練推進中 (Auto-Pilot Active)';
  btnAutoPlay.textContent = '▶️ 演練進行中...';

  function step() {
    if (!isAutoPlaying) return;
    operatorPressGo();

    // Virtual Operator waits between cues (simulate pacing)
    const currentCue = flatCueList[standbyIndex];
    let waitSeconds = 4.5;
    if (currentCue && currentCue.duration > 0) {
      waitSeconds = Math.min(currentCue.duration + 1.5, 8.0);
    }

    autoPlayTimer = setTimeout(step, waitSeconds * 1000);
  }

  step();
}

function stopAutoPlay() {
  isAutoPlaying = false;
  clearTimeout(autoPlayTimer);
  opStatus.textContent = '已暫停 (Paused)';
  btnAutoPlay.textContent = '▶️ 啟動自動演練 (Auto Run)';
}

// Toolbar Handlers
btnAutoPlay.addEventListener('click', startAutoPlay);
btnPause.addEventListener('click', stopAutoPlay);
btnPanic.addEventListener('click', () => {
  stopAutoPlay();
  panic();
});
btnReset.addEventListener('click', () => {
  stopAutoPlay();
  panic();
  setStandbyIndex(0);
  opStatus.textContent = '已重置回 #0 (Reset)';
});

// Physical Keyboard Shortcuts
window.addEventListener('keydown', (e) => {
  if (e.code === 'Space') {
    e.preventDefault();
    operatorPressGo();
  } else if (e.code === 'Escape') {
    e.preventDefault();
    panic();
  } else if (e.code === 'ArrowDown') {
    e.preventDefault();
    setStandbyIndex(Math.min(flatCueList.length - 1, standbyIndex + 1));
  } else if (e.code === 'ArrowUp') {
    e.preventDefault();
    setStandbyIndex(Math.max(0, standbyIndex - 1));
  }
});

loadShow();
