// OpenStage Cue - Client Controller, Audio Engine & Show Editor
let ws = null;
let audioCtx = null;
let projectData = null;
let flatCueList = [];
let standbyIndex = 0;
let lastEscTime = 0;
let runningAudios = new Map(); // cueId -> audio
let allActiveAudios = new Set(); // 追蹤所有實際建立並播放中的 HTMLAudioElement 實例
let activeTimers = new Set(); // set of active setTimeout IDs
let activeIntervals = new Set(); // set of active setInterval IDs
let currentMode = 'show'; // 'show' | 'edit'
let mediaFilesList = [];
let auditionAudio = null;

// DOM Elements - Navigation & Transport
const btnModeShow = document.getElementById('btn-mode-show');
const btnModeEdit = document.getElementById('btn-mode-edit');
const transportControls = document.getElementById('transport-controls');
const btnGo = document.getElementById('btn-go');
const btnPanic = document.getElementById('btn-panic');
const btnStop = document.getElementById('btn-stop');
const btnOpenStage = document.getElementById('btn-open-stage');
const stageDot = document.getElementById('stage-status-dot');
const stageText = document.getElementById('stage-status-text');
const clockDisplay = document.getElementById('clock-display');
const projectTitle = document.getElementById('project-title');
const cueListContainer = document.getElementById('cue-list-container');
const toastEl = document.getElementById('toast');
const fileInputProject = document.getElementById('file-input-project');

// Project Launcher DOM Elements
const btnSwitchProject = document.getElementById('btn-switch-project');
const projectLauncherModal = document.getElementById('project-launcher-modal');
const btnCloseLauncherModal = document.getElementById('btn-close-launcher-modal');
const btnLauncherNew = document.getElementById('btn-launcher-new');
const btnLauncherOpen = document.getElementById('btn-launcher-open');
const btnLauncherSample = document.getElementById('btn-launcher-sample');

// New Project Modal DOM Elements
const newProjectModal = document.getElementById('new-project-modal');
const btnCloseNewProjectModal = document.getElementById('btn-close-new-project-modal');
const btnCancelNewProject = document.getElementById('btn-cancel-new-project');
const btnConfirmNewProject = document.getElementById('btn-confirm-new-project');
const newProjectTitleInput = document.getElementById('new-project-title-input');
const newProjectFolderInput = document.getElementById('new-project-folder-input');
const btnBrowseNewProjectFolder = document.getElementById('btn-browse-new-project-folder');

// Edit Toolbar DOM Elements
const btnProjNew = document.getElementById('btn-proj-new');
const btnProjOpen = document.getElementById('btn-proj-open');
const btnProjSave = document.getElementById('btn-proj-save');
const btnProjExportQLab = document.getElementById('btn-proj-export-qlab');
const btnProjReloadSample = document.getElementById('btn-proj-reload-sample');
const btnToolbarMedia = document.getElementById('btn-toolbar-media');

const btnAddGroup = document.getElementById('btn-add-group');
const btnAddAudio = document.getElementById('btn-add-audio');
const btnAddVideo = document.getElementById('btn-add-video');
const btnAddImage = document.getElementById('btn-add-image');
const btnAddFade = document.getElementById('btn-add-fade');
const btnAddStop = document.getElementById('btn-add-stop');

const btnCueMoveUp = document.getElementById('btn-cue-move-up');
const btnCueMoveDown = document.getElementById('btn-cue-move-down');
const btnCueIndent = document.getElementById('btn-cue-indent');
const btnCueOutdent = document.getElementById('btn-cue-outdent');
const btnCueDuplicate = document.getElementById('btn-cue-duplicate');
const btnCueDelete = document.getElementById('btn-cue-delete');
const btnCueAudition = document.getElementById('btn-cue-audition');
const btnCueAuditionStop = document.getElementById('btn-cue-audition-stop');

// Inspector Views
const inspShowView = document.getElementById('inspector-show-view');
const inspEditView = document.getElementById('inspector-edit-view');

// Inspector Show View DOM Elements
const inspName = document.getElementById('inspector-name');
const inspType = document.getElementById('inspector-type');
const inspPrewait = document.getElementById('inspector-prewait');
const inspDuration = document.getElementById('inspector-duration');
const inspContinue = document.getElementById('inspector-continue');
const inspTarget = document.getElementById('inspector-target');

// Inspector Edit View DOM Elements
const editCueNumber = document.getElementById('edit-cue-number');
const editCueName = document.getElementById('edit-cue-name');
const editCueType = document.getElementById('edit-cue-type');
const editCuePrewait = document.getElementById('edit-cue-prewait');
const editCueDuration = document.getElementById('edit-cue-duration');
const editCuePostwait = document.getElementById('edit-cue-postwait');
const editCueContinue = document.getElementById('edit-cue-continue');
const editCueGroupMode = document.getElementById('edit-cue-groupmode');
const rowGroupMode = document.getElementById('row-group-mode');
const editCueTarget = document.getElementById('edit-cue-target');
const btnBrowseMedia = document.getElementById('btn-browse-media');
const btnInspAudition = document.getElementById('btn-insp-audition');
const fadeOptionsContainer = document.getElementById('fade-options-container');
const editFadeMode = document.getElementById('edit-fade-mode');
const rowFadeStopTarget = document.getElementById('row-fade-stop-target');
const editFadeStopTarget = document.getElementById('edit-fade-stop-target');

// Audition Preview Box DOM Elements
const auditionPreviewBox = document.getElementById('audition-preview-box');
const previewVideo = document.getElementById('preview-video');
const previewImage = document.getElementById('preview-image');
const previewTitle = document.getElementById('preview-title');
const btnClosePreview = document.getElementById('btn-close-preview');

// Media Browser Modal DOM Elements
const mediaModal = document.getElementById('media-modal');
const btnCloseMediaModal = document.getElementById('btn-close-media-modal');
const btnCancelMediaModal = document.getElementById('btn-cancel-media-modal');
const mediaSearchInput = document.getElementById('media-search-input');
const mediaFileList = document.getElementById('media-file-list');
const mediaModalCount = document.getElementById('media-modal-count');

// Media Folder Banner DOM Elements
const mediaFolderPath = document.getElementById('media-folder-path');
const btnChangeMediaFolder = document.getElementById('btn-change-media-folder');
const btnApplyMediaFolder = document.getElementById('btn-apply-media-folder');
const btnRefreshMediaFolder = document.getElementById('btn-refresh-media-folder');

// Helper: Normalize & Encode Media URL
function getMediaUrl(fileTarget) {
  if (!fileTarget || fileTarget === '$null') return '';
  const clean = fileTarget.replace(/\\/g, '/').replace(/^\/+/, '');
  return '/media/' + clean.split('/').map(encodeURIComponent).join('/');
}

// Clock Update
setInterval(() => {
  const d = new Date();
  clockDisplay.textContent = d.toTimeString().split(' ')[0];
}, 1000);

// Toast Notification
function showToast(message, duration = 3000) {
  if (!toastEl) return;
  toastEl.textContent = message;
  toastEl.classList.add('show');
  setTimeout(() => {
    toastEl.classList.remove('show');
  }, duration);
}

// AudioContext Unlock
function getAudioContext() {
  if (!audioCtx) {
    audioCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  if (audioCtx.state === 'suspended') {
    audioCtx.resume();
  }
  return audioCtx;
}

// Mode Switch Handler
function setMode(mode) {
  currentMode = mode;
  if (mode === 'show') {
    document.body.className = 'mode-show-active';
    btnModeShow.classList.add('active');
    btnModeEdit.classList.remove('active');
    inspShowView.style.display = 'flex';
    inspEditView.style.display = 'none';
  } else {
    document.body.className = 'mode-edit-active';
    btnModeEdit.classList.add('active');
    btnModeShow.classList.remove('active');
    inspShowView.style.display = 'none';
    inspEditView.style.display = 'flex';
  }
  document.querySelectorAll('.cue-row').forEach(r => {
    r.title = mode === 'show' ? '雙擊立刻播放 (緊急處置)' : '雙擊可修改名稱';
  });
  updateInspector();
}

btnModeShow.addEventListener('click', () => setMode('show'));
btnModeEdit.addEventListener('click', () => setMode('edit'));

// Project Title Rename
projectTitle.addEventListener('click', () => {
  if (currentMode !== 'edit') return;
  const newTitle = prompt('請輸入專案名稱:', projectData ? projectData.title : '');
  if (newTitle && newTitle.trim()) {
    projectData.title = newTitle.trim();
    projectTitle.textContent = projectData.title;
    showToast(`專案更名為: ${projectData.title}`);
  }
});

// Stage Window Opener (支援副螢幕智慧偵測與全螢幕啟動，單螢幕自動 PiP)
btnOpenStage.addEventListener('click', async () => {
  try {
    const res = await fetch('/api/stage/open', { method: 'POST' });
    const data = await res.json();
    if (data && data.success) {
      if (data.isExternal) {
        showToast('🖥️ 舞台螢幕已於外接副螢幕 (投影機) 全螢幕啟動！');
      } else {
        showToast('🖥️ 單螢幕模式：舞台視窗已於右下角開啟 (PiP 子母畫面，可按 F11 全螢幕)');
      }
      return;
    }
  } catch (e) {}
  // 瀏覽器模式直接彈出視窗：
  window.open('/stage', 'StageWindow', 'width=1280,height=720');
});

// Subtitle Deck Opener
const btnOpenSubtitles = document.getElementById('btn-open-subtitles');
if (btnOpenSubtitles) {
  btnOpenSubtitles.addEventListener('click', () => {
    window.open('/subtitle-deck', 'SubtitleWindow', 'width=1100,height=750');
  });
}

// Connect WebSocket
function connectWebSocket() {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  ws = new WebSocket(`${protocol}//${window.location.host}`);

  ws.onopen = () => {
    console.log('[Control] WebSocket connected');
    ws.send(JSON.stringify({ type: 'REGISTER', role: 'control' }));
  };

  ws.onmessage = (event) => {
    try {
      const msg = JSON.parse(event.data);
      if (msg.type === 'SYSTEM_STATUS') {
        if (msg.stageConnected) {
          stageDot.className = 'status-dot online';
          stageText.textContent = '舞台螢幕已連線 (Connected)';
        } else {
          stageDot.className = 'status-dot';
          stageText.textContent = '舞台螢幕等待連線';
        }
      }
      // 即時字幕狀態同步
      else if (msg.type === 'SUBTITLE_STATE_SYNC') {
        if (msg.state) {
          if (Array.isArray(msg.state.script) && msg.state.script.length > 0) {
            mainSubScript = msg.state.script;
            renderSubScriptList();
          }
          mainSubIndex = msg.state.currentIndex ?? -1;
          mainSubVisible = !!msg.state.isVisible;
          updateMainSubHUD();
        }
      }
      else if (msg.type === 'SUBTITLE_SHOW') {
        mainSubIndex = msg.index ?? mainSubIndex;
        mainSubVisible = true;
        updateMainSubHUD();
      }
      else if (msg.type === 'SUBTITLE_CLEAR' || msg.type === 'STAGE_PANIC') {
        mainSubVisible = false;
        updateMainSubHUD();
      }
    } catch (e) {
      console.error(e);
    }
  };

  ws.onclose = () => {
    setTimeout(connectWebSocket, 1500);
  };
}

// -----------------------------------------------------------------------------
// Project Launcher & Empty State Management
// -----------------------------------------------------------------------------

function showProjectLauncher() {
  if (projectLauncherModal) projectLauncherModal.style.display = 'flex';
}

function hideProjectLauncher() {
  if (projectLauncherModal) projectLauncherModal.style.display = 'none';
}

if (btnSwitchProject) {
  btnSwitchProject.addEventListener('click', showProjectLauncher);
}

if (btnCloseLauncherModal) {
  btnCloseLauncherModal.addEventListener('click', hideProjectLauncher);
}

// 建立全新空白專案程序 (開啟專案名稱與素材資料夾設定對話框)
async function createNewProjectFlow() {
  hideProjectLauncher();
  if (newProjectTitleInput) newProjectTitleInput.value = '未命名劇場專案';
  
  // 取得目前預設素材庫路徑
  try {
    const res = await fetch('/api/media-folder');
    const data = await res.json();
    if (data.success && newProjectFolderInput) {
      newProjectFolderInput.value = data.folder || '';
    }
  } catch (e) {}

  if (newProjectModal) newProjectModal.style.display = 'flex';
  if (newProjectTitleInput) {
    newProjectTitleInput.focus();
    newProjectTitleInput.select();
  }
}

function hideNewProjectModal() {
  if (newProjectModal) newProjectModal.style.display = 'none';
}

if (btnCloseNewProjectModal) btnCloseNewProjectModal.addEventListener('click', hideNewProjectModal);
if (btnCancelNewProject) btnCancelNewProject.addEventListener('click', hideNewProjectModal);

// 在新專案對話框中點選「選擇資料夾」
if (btnBrowseNewProjectFolder) {
  btnBrowseNewProjectFolder.addEventListener('click', async () => {
    showToast('📂 正在開啟系統資料夾挑選對話框...');
    try {
      const res = await fetch('/api/browse-folder', { method: 'POST' });
      const data = await res.json();
      if (data.success && !data.canceled && data.folder) {
        if (newProjectFolderInput) newProjectFolderInput.value = data.folder;
        showToast(`📁 已選擇素材資料夾: ${data.folder}`);
      } else if (data.canceled) {
        showToast('已取消選擇資料夾');
      }
    } catch (e) {
      showToast(`選擇資料夾失敗: ${e.message}`);
    }
  });
}

// 確認建立新專案
if (btnConfirmNewProject) {
  btnConfirmNewProject.addEventListener('click', async () => {
    const title = (newProjectTitleInput.value || '').trim() || '未命名劇場專案';
    const mediaFolder = (newProjectFolderInput.value || '').trim();
    hideNewProjectModal();

    showToast('⏳ 正在建立全新專案...');
    try {
      const res = await fetch('/api/project/new', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ title, mediaFolder })
      });
      const result = await res.json();
      if (result.success) {
        projectData = result.project;
        projectTitle.textContent = projectData.title;
        buildCueList(false);
        setMode('edit');
        if (typeof refreshMediaFiles === 'function') {
          await refreshMediaFiles();
        }
        showToast(`📄 已建立全新專案: ${projectData.title}！`);
      }
    } catch (e) {
      showToast(`建立專案失敗: ${e.message}`);
    }
  });
}

// 載入《星星月月》示範專案程序
async function loadSampleProjectFlow() {
  hideProjectLauncher();
  showToast('⏳ 正在載入《星星月月》示範專案...');
  try {
    const res = await fetch('/api/project/load-sample', { method: 'POST' });
    const result = await res.json();
    if (result.success) {
      projectData = result.project;
      projectTitle.textContent = projectData.title;
      buildCueList(false);
      showToast('🎉 已成功載入《星星月月》示範專案！');
    }
  } catch (e) {
    showToast(`載入示範專案失敗: ${e.message}`);
  }
}

// 渲染無專案空白狀態畫面
function renderEmptyProjectState() {
  cueListContainer.innerHTML = `
    <div class="empty-project-state">
      <div class="empty-icon">🎭</div>
      <div class="empty-title">尚未載入專案</div>
      <div class="empty-desc">請建立新專案、開啟現有檔案，或載入《星星月月》示範專案以開始使用。</div>
      <div class="empty-actions">
        <button class="tool-btn btn-highlight" id="btn-empty-new">📄 建立全新空白專案</button>
        <button class="tool-btn" id="btn-empty-open">📂 開啟現有專案檔</button>
        <button class="tool-btn" id="btn-empty-sample">🎭 載入《星星月月》示範</button>
      </div>
    </div>
  `;
  const emptyNew = document.getElementById('btn-empty-new');
  const emptyOpen = document.getElementById('btn-empty-open');
  const emptySample = document.getElementById('btn-empty-sample');
  if (emptyNew) emptyNew.addEventListener('click', createNewProjectFlow);
  if (emptyOpen) emptyOpen.addEventListener('click', () => { fileInputProject.value = ''; fileInputProject.click(); });
  if (emptySample) emptySample.addEventListener('click', loadSampleProjectFlow);

  projectTitle.textContent = '尚未載入專案';
  updateInspector();
}

// 綁定 Project Launcher 彈窗按鈕
if (btnLauncherNew) btnLauncherNew.addEventListener('click', createNewProjectFlow);
if (btnLauncherOpen) btnLauncherOpen.addEventListener('click', () => {
  hideProjectLauncher();
  fileInputProject.value = '';
  fileInputProject.click();
});
if (btnLauncherSample) btnLauncherSample.addEventListener('click', loadSampleProjectFlow);

// Fetch Project from Server or Prompt Launcher
async function loadProject() {
  try {
    const res = await fetch('/api/project');
    const data = await res.json();
    if (data && data.hasProject === false) {
      // 開啟程式時不必預載專案，讓使用者選擇
      projectData = null;
      renderEmptyProjectState();
      showProjectLauncher();
    } else if (data && data.rootCue) {
      projectData = data;
      projectTitle.textContent = projectData.title || '未命名專案';
      buildCueList();
    } else {
      projectData = null;
      renderEmptyProjectState();
      showProjectLauncher();
    }
  } catch (e) {
    console.error('Failed to load project:', e);
    projectData = null;
    renderEmptyProjectState();
    showProjectLauncher();
  }
}

// Build Cue List Tree & Flatten
function buildCueList(preserveSelection = true) {
  const prevSelectedCueId = flatCueList[standbyIndex] ? flatCueList[standbyIndex].id : null;
  cueListContainer.innerHTML = '';
  flatCueList = [];

  const root = projectData ? projectData.rootCue : null;
  if (!root) {
    renderEmptyProjectState();
    return;
  }

  function traverse(cue, depth = 0, parentCue = null) {
    cue._depth = depth;
    cue._parent = parentCue;
    if (cue._collapsed === undefined) cue._collapsed = false;

    flatCueList.push(cue);

    const row = document.createElement('div');
    row.className = 'cue-row';
    row.id = `row-${cue.id}`;
    row.title = currentMode === 'show' ? '雙擊立刻播放 (緊急處置)' : '雙擊可修改名稱';
    cue._rowEl = row;

    // Type Badge
    let tagClass = 'group';
    let typeLabel = 'GROUP';
    if (cue.type === 'AudioCue') { tagClass = 'audio'; typeLabel = 'AUDIO'; }
    else if (cue.type === 'VideoCue') { tagClass = 'video'; typeLabel = 'VIDEO'; }
    else if (cue.type === 'ImageCue') { tagClass = 'image'; typeLabel = 'IMAGE'; }
    else if (cue.type === 'FadeCue') { tagClass = 'fade'; typeLabel = 'FADE'; }
    else if (cue.type === 'StopCue') { tagClass = 'stop'; typeLabel = 'STOP'; }

    const numStr = cue.number ? `#${cue.number}` : '';
    const preStr = cue.preWait > 0 ? `${parseFloat(cue.preWait).toFixed(1)}s` : '-';
    const durStr = cue.duration > 0 ? `${parseFloat(cue.duration).toFixed(1)}s` : '-';

    let continueSymbol = '-';
    if (cue.continueMode === 1) continueSymbol = '⏩ 自動';
    else if (cue.continueMode === 2) continueSymbol = '⏭️ 接續';

    const hasChildren = cue.children && cue.children.length > 0;
    const arrowIcon = hasChildren ? (cue._collapsed ? '▶' : '▼') : '•';

    row.innerHTML = `
      <div class="cue-status-icon"><span id="status-${cue.id}">⏸️</span></div>
      <div class="cue-number">${numStr}</div>
      <div><span class="cue-tag ${tagClass}">${typeLabel}</span></div>
      <div class="cue-time">${preStr}</div>
      <div class="cue-time">${durStr}</div>
      <div class="cue-continue-badge">${continueSymbol}</div>
      <div class="cue-name" style="padding-left: ${depth * 18}px">
        <span class="collapse-toggle" data-cueid="${cue.id}">${arrowIcon}</span>
        <span class="cue-name-text">${escapeHtml(cue.name || '(未命名)')}</span>
      </div>
      <div class="cue-target" title="${escapeHtml(cue.fileTarget || '')}">${escapeHtml(cue.fileTarget || '')}</div>
    `;

    // Row Click Selection
    row.addEventListener('click', (e) => {
      // Check if clicking collapse arrow
      if (e.target.classList.contains('collapse-toggle') && hasChildren) {
        cue._collapsed = !cue._collapsed;
        buildCueList(true);
        return;
      }
      setStandbyIndex(flatCueList.indexOf(cue));
    });

    // Double-click: Edit name in edit mode; Emergency play immediately in show mode
    row.addEventListener('dblclick', (e) => {
      if (e.target.classList.contains('collapse-toggle')) return;
      if (currentMode === 'edit') {
        const newName = prompt('修改 Cue 名稱:', cue.name || '');
        if (newName !== null) {
          cue.name = newName;
          updateCueRowUI(cue);
          updateInspector();
        }
      } else {
        // 演出模式 (Show 模式): 滑鼠雙擊任一 Cue -> 緊急處置！
        // 1. 將所有正在執行的狀態清除掉 (包括音訊/視訊/計時器/狀態指示)
        stopRunningStateForEmergency();

        // 2. 待命游標移至該 Cue，並立刻無延遲播放指定 Cue
        const cueIdx = flatCueList.indexOf(cue);
        if (cueIdx !== -1) {
          setStandbyIndex(cueIdx);
          executeCue(cue, true);
          const nextIdx = getNextExecutableIndex(cueIdx);
          if (nextIdx < flatCueList.length) {
            setStandbyIndex(nextIdx);
          }
        }
      }
    });

    cueListContainer.appendChild(row);

    // Recursively process children if not collapsed
    if (hasChildren && !cue._collapsed) {
      cue.children.forEach(child => traverse(child, depth + 1, cue));
    }
  }

  let topItems = root.children || [];
  if (topItems.length === 1 && topItems[0].name === 'Main Cue List' && topItems[0].children) {
    topItems[0]._isMainWrapper = true;
    topItems = topItems[0].children;
  }

  topItems.forEach(c => traverse(c, 0, root.children[0] && root.children[0]._isMainWrapper ? root.children[0] : root));

  // Restore selection
  if (preserveSelection && prevSelectedCueId) {
    const foundIdx = flatCueList.findIndex(c => c.id === prevSelectedCueId);
    if (foundIdx !== -1) {
      setStandbyIndex(foundIdx);
      return;
    }
  }

  if (flatCueList.length > 0) {
    setStandbyIndex(Math.min(standbyIndex, flatCueList.length - 1));
  } else {
    standbyIndex = 0;
    updateInspector();
  }
}

// Update single cue row UI without full list rebuild
function updateCueRowUI(cue) {
  if (!cue || !cue._rowEl) return;
  const row = cue._rowEl;

  const numEl = row.querySelector('.cue-number');
  if (numEl) numEl.textContent = cue.number ? `#${cue.number}` : '';

  const tagEl = row.querySelector('.cue-tag');
  if (tagEl) {
    let tagClass = 'group';
    let typeLabel = 'GROUP';
    if (cue.type === 'AudioCue') { tagClass = 'audio'; typeLabel = 'AUDIO'; }
    else if (cue.type === 'VideoCue') { tagClass = 'video'; typeLabel = 'VIDEO'; }
    else if (cue.type === 'ImageCue') { tagClass = 'image'; typeLabel = 'IMAGE'; }
    else if (cue.type === 'FadeCue') { tagClass = 'fade'; typeLabel = 'FADE'; }
    else if (cue.type === 'StopCue') { tagClass = 'stop'; typeLabel = 'STOP'; }
    tagEl.className = `cue-tag ${tagClass}`;
    tagEl.textContent = typeLabel;
  }

  const times = row.querySelectorAll('.cue-time');
  if (times.length >= 2) {
    times[0].textContent = cue.preWait > 0 ? `${parseFloat(cue.preWait).toFixed(1)}s` : '-';
    times[1].textContent = cue.duration > 0 ? `${parseFloat(cue.duration).toFixed(1)}s` : '-';
  }

  const contEl = row.querySelector('.cue-continue-badge');
  if (contEl) {
    let continueSymbol = '-';
    if (cue.continueMode === 1) continueSymbol = '⏩ 自動';
    else if (cue.continueMode === 2) continueSymbol = '⏭️ 接續';
    contEl.textContent = continueSymbol;
  }

  const nameTextEl = row.querySelector('.cue-name-text');
  if (nameTextEl) nameTextEl.textContent = cue.name || '(未命名)';

  const targetEl = row.querySelector('.cue-target');
  if (targetEl) {
    targetEl.textContent = cue.fileTarget || '';
    targetEl.title = cue.fileTarget || '';
  }
}

// Standby & Selected Cue
function setStandbyIndex(idx) {
  if (idx < 0 || idx >= flatCueList.length) return;

  if (flatCueList[standbyIndex] && flatCueList[standbyIndex]._rowEl) {
    flatCueList[standbyIndex]._rowEl.classList.remove('standby', 'selected');
  }

  standbyIndex = idx;
  const cue = flatCueList[standbyIndex];

  if (cue && cue._rowEl) {
    cue._rowEl.classList.add('standby', 'selected');
    cue._rowEl.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
    updateInspector();
  }
}

// Update Inspector (Show & Edit views)
function updateInspector() {
  const cue = flatCueList[standbyIndex];
  if (!cue) {
    inspName.textContent = '尚未選取';
    inspType.textContent = '-';
    inspPrewait.textContent = '0.0s';
    inspDuration.textContent = '0.0s';
    inspContinue.textContent = '-';
    inspTarget.textContent = '-';
    return;
  }

  // Show Mode View
  inspName.textContent = (cue.number ? `#${cue.number} ` : '') + (cue.name || '未命名 Cue');
  inspType.textContent = cue.type + (cue.groupMode ? ` (GroupMode: ${cue.groupMode})` : '');
  inspPrewait.textContent = cue.preWait > 0 ? `${parseFloat(cue.preWait).toFixed(1)}s` : '0.0s';
  inspDuration.textContent = cue.duration > 0 ? `${parseFloat(cue.duration).toFixed(1)}s` : '0.0s';

  let contStr = '不接續';
  if (cue.continueMode === 1) contStr = '自動接續 (Auto-Continue)';
  else if (cue.continueMode === 2) contStr = '接續後執行 (Auto-Follow)';
  inspContinue.textContent = contStr;
  inspTarget.textContent = cue.fileTarget || (cue.type === 'FadeCue' ? ((cue.fadeMode === 'fade-in' || (cue.name || '').includes('淡入')) ? '淡入至 100%' : '淡出至 0%') : '無實體檔案');

  // Edit Mode View
  if (currentMode === 'edit') {
    editCueNumber.value = cue.number || '';
    editCueName.value = cue.name || '';
    editCueType.value = cue.type || 'GroupCue';
    editCuePrewait.value = parseFloat(cue.preWait || 0);
    editCueDuration.value = parseFloat(cue.duration || 0);
    editCuePostwait.value = parseFloat(cue.postWait || 0);
    editCueContinue.value = String(cue.continueMode || 0);
    editCueGroupMode.value = String(cue.groupMode || 1);
    editCueTarget.value = cue.fileTarget || '';

    // Show/hide type-specific settings
    rowGroupMode.style.display = cue.type === 'GroupCue' ? 'flex' : 'none';
    fadeOptionsContainer.style.display = cue.type === 'FadeCue' ? 'block' : 'none';
    if (cue.type === 'FadeCue') {
      const mode = cue.fadeMode || ((cue.name || '').includes('淡入') || (cue.name || '').toLowerCase().includes('fade in') ? 'fade-in' : 'fade-out');
      editFadeMode.value = mode;
      editFadeStopTarget.checked = cue.stopTargetWhenDone !== undefined ? !!cue.stopTargetWhenDone : (mode === 'fade-out');
      rowFadeStopTarget.style.display = mode === 'fade-in' ? 'none' : 'inline-flex';
    }
  }
}

// Inspector Form Two-way Binding
function bindInspectorFormInputs() {
  const onFieldChange = () => {
    const cue = flatCueList[standbyIndex];
    if (!cue) return;

    cue.number = editCueNumber.value.trim();
    cue.name = editCueName.value.trim();
    cue.type = editCueType.value;
    cue.preWait = parseFloat(editCuePrewait.value) || 0;
    cue.duration = parseFloat(editCueDuration.value) || 0;
    cue.postWait = parseFloat(editCuePostwait.value) || 0;
    cue.continueMode = parseInt(editCueContinue.value, 10) || 0;
    if (cue.type === 'GroupCue') {
      cue.groupMode = parseInt(editCueGroupMode.value, 10) || 1;
    }
    if (cue.type === 'FadeCue') {
      cue.fadeMode = editFadeMode.value;
      cue.stopTargetWhenDone = cue.fadeMode === 'fade-in' ? false : editFadeStopTarget.checked;
      rowFadeStopTarget.style.display = cue.fadeMode === 'fade-in' ? 'none' : 'inline-flex';
    }
    cue.fileTarget = editCueTarget.value.trim();

    // Auto-switch type if GroupCue without children and user typed/pasted a target
    const lower = cue.fileTarget.toLowerCase();
    if (cue.type === 'GroupCue' && (!cue.children || cue.children.length === 0) && lower) {
      if (lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.endsWith('.webm')) {
        cue.type = 'VideoCue';
        editCueType.value = 'VideoCue';
      } else if (lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp') || lower.endsWith('.bmp') || lower.endsWith('.svg')) {
        cue.type = 'ImageCue';
        editCueType.value = 'ImageCue';
      } else if (lower.endsWith('.wav') || lower.endsWith('.mp3') || lower.endsWith('.m4a') || lower.endsWith('.aac')) {
        cue.type = 'AudioCue';
        editCueType.value = 'AudioCue';
      }
    }

    rowGroupMode.style.display = cue.type === 'GroupCue' ? 'flex' : 'none';
    fadeOptionsContainer.style.display = cue.type === 'FadeCue' ? 'block' : 'none';

    updateCueRowUI(cue);
  };

  [editCueNumber, editCueName, editCuePrewait, editCueDuration, editCuePostwait, editCueTarget].forEach(input => {
    input.addEventListener('input', onFieldChange);
  });

  [editCueType, editCueContinue, editCueGroupMode].forEach(sel => {
    sel.addEventListener('change', () => {
      onFieldChange();
      // If type changed, rebuild list to update tag properly
      buildCueList(true);
    });
  });

  editFadeMode.addEventListener('change', () => {
    const cue = flatCueList[standbyIndex];
    if (!cue || cue.type !== 'FadeCue') return;
    cue.fadeMode = editFadeMode.value;
    rowFadeStopTarget.style.display = cue.fadeMode === 'fade-in' ? 'none' : 'inline-flex';
    if (cue.fadeMode === 'fade-in') {
      cue.stopTargetWhenDone = false;
      if (cue.name === '淡出全場畫面' || cue.name === '') {
        cue.name = '淡入全場畫面';
        editCueName.value = '淡入全場畫面';
      }
    } else {
      cue.stopTargetWhenDone = editFadeStopTarget.checked;
      if (cue.name === '淡入全場畫面' || cue.name === '') {
        cue.name = '淡出全場畫面';
        editCueName.value = '淡出全場畫面';
      }
    }
    updateCueRowUI(cue);
  });

  editFadeStopTarget.addEventListener('change', () => {
    const cue = flatCueList[standbyIndex];
    if (!cue || cue.type !== 'FadeCue') return;
    cue.stopTargetWhenDone = editFadeStopTarget.checked;
  });
}
bindInspectorFormInputs();

// -----------------------------------------------------------------------------
// Project Operations (New, Open, Save, Export, Reload Sample)
// -----------------------------------------------------------------------------

// Save Project
async function saveProjectToServer() {
  if (!projectData) return;
  try {
    const res = await fetch('/api/project', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(projectData)
    });
    const result = await res.json();
    if (result.success) {
      showToast('💾 專案已成功儲存！');
    } else {
      showToast(`儲存失敗: ${result.error || '未知錯誤'}`);
    }
  } catch (e) {
    showToast(`儲存失敗: ${e.message}`);
  }
}
btnProjSave.addEventListener('click', saveProjectToServer);

// Export QLab 5
async function exportQLab5() {
  if (!projectData) return;
  showToast('⏳ 正在導出標準 QLab 5 檔案...');
  try {
    const res = await fetch('/api/project/export-qlab', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(projectData)
    });

    if (!res.ok) {
      const err = await res.json();
      throw new Error(err.error || '導出失敗');
    }

    const blob = await res.blob();
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const safeTitle = (projectData.title || 'CueMaster_Show').replace(/[\\/:*?"<>|]/g, '_');
    a.download = `${safeTitle}.qlab5`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
    showToast('⬇️ QLab 5 專案檔已成功導出並下載！');
  } catch (e) {
    showToast(`導出 QLab5 失敗: ${e.message}`);
  }
}
btnProjExportQLab.addEventListener('click', exportQLab5);

// New Project
btnProjNew.addEventListener('click', () => {
  if (projectData && !confirm('建立新專案？尚未儲存的變更將會遺失。')) return;
  createNewProjectFlow();
});

// Open Project (via hidden file input)
btnProjOpen.addEventListener('click', () => {
  fileInputProject.value = '';
  fileInputProject.click();
});

fileInputProject.addEventListener('change', async (e) => {
  const file = e.target.files[0];
  if (!file) return;

  const fileName = file.name.toLowerCase();
  showToast(`⏳ 正在載入: ${file.name}...`);

  if (fileName.endsWith('.qlab5')) {
    // Binary QLab 5 file -> upload to import endpoint
    try {
      const res = await fetch('/api/project/import-qlab', {
        method: 'POST',
        headers: { 'Content-Type': 'application/octet-stream' },
        body: file
      });
      const result = await res.json();
      if (result.success) {
        projectData = result.project;
        projectTitle.textContent = projectData.title;
        hideProjectLauncher();
        buildCueList(false);
        showToast(`🎉 成功匯入 QLab 5 專案: ${file.name}`);
      } else {
        showToast(`匯入 QLab 5 失敗: ${result.error}`);
      }
    } catch (err) {
      showToast(`匯入 QLab 5 失敗: ${err.message}`);
    }
  } else if (fileName.endsWith('.json') || fileName.endsWith('.cuemaster')) {
    // JSON / CueMaster Project
    try {
      const text = await file.text();
      projectData = JSON.parse(text);
      projectTitle.textContent = projectData.title || file.name;
      hideProjectLauncher();
      buildCueList(false);
      showToast(`🎉 成功載入專案: ${file.name}`);
    } catch (err) {
      showToast(`解析專案檔失敗: ${err.message}`);
    }
  } else {
    showToast('不支援的檔案格式，請選擇 .qlab5, .cuemaster 或 .json');
  }
});

// Reload Sample Project
btnProjReloadSample.addEventListener('click', () => {
  if (projectData && !confirm('載入《星星月月》示範專案？目前未儲存的變更將會重置。')) return;
  loadSampleProjectFlow();
});

// -----------------------------------------------------------------------------
// Cue Structure Editing (Add, Delete, Duplicate, Move, Indent, Outdent)
// -----------------------------------------------------------------------------

function getCueParentAndSiblings(cue) {
  if (!cue) return { parent: null, siblings: [] };
  const parent = cue._parent;
  if (!parent) {
    const root = projectData.rootCue;
    let list = root.children;
    if (list.length === 1 && list[0].name === 'Main Cue List' && list[0].children) {
      list = list[0].children;
    }
    return { parent: null, siblings: list };
  }
  return { parent: parent, siblings: parent.children };
}

function addNewCue(type) {
  const selectedCue = flatCueList[standbyIndex];
  const { parent, siblings } = getCueParentAndSiblings(selectedCue);

  const newId = `cue_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
  let defaultName = '未命名 Cue';
  let defaultDuration = 0.0;
  let defaultGroupMode = 1;

  if (type === 'GroupCue') {
    defaultName = '新群組';
    defaultGroupMode = 3; // Default to simultaneous for theater scenes
  } else if (type === 'AudioCue') {
    defaultName = '新音訊 Cue';
  } else if (type === 'VideoCue') {
    defaultName = '新視訊 Cue';
  } else if (type === 'ImageCue') {
    defaultName = '新圖片 Cue';
  } else if (type === 'FadeCue') {
    defaultName = '淡出全場畫面';
    defaultDuration = 3.0;
  } else if (type === 'StopCue') {
    defaultName = '停止播放';
  }

  const newCue = {
    id: newId,
    type: type,
    number: '',
    name: defaultName,
    preWait: 0.0,
    duration: defaultDuration,
    postWait: 0.0,
    continueMode: 0,
    groupMode: defaultGroupMode,
    fileTarget: '',
    children: []
  };

  if (type === 'FadeCue') {
    newCue.fadeMode = 'fade-out';
    newCue.stopTargetWhenDone = true;
  }

  if (siblings.length === 0) {
    siblings.push(newCue);
  } else {
    const curIdx = siblings.indexOf(selectedCue);
    if (curIdx !== -1) {
      siblings.splice(curIdx + 1, 0, newCue);
    } else {
      siblings.push(newCue);
    }
  }

  buildCueList(false);
  const newIndex = flatCueList.findIndex(c => c.id === newId);
  if (newIndex !== -1) setStandbyIndex(newIndex);
  showToast(`已新增 ${type}: ${defaultName}`);
}

btnAddGroup.addEventListener('click', () => addNewCue('GroupCue'));
btnAddAudio.addEventListener('click', () => addNewCue('AudioCue'));
btnAddVideo.addEventListener('click', () => addNewCue('VideoCue'));
if (btnAddImage) btnAddImage.addEventListener('click', () => addNewCue('ImageCue'));
btnAddFade.addEventListener('click', () => addNewCue('FadeCue'));
btnAddStop.addEventListener('click', () => addNewCue('StopCue'));

// Delete Cue
function deleteSelectedCue() {
  const selectedCue = flatCueList[standbyIndex];
  if (!selectedCue) return;

  if (!confirm(`確定要刪除 Cue「${selectedCue.number ? '#' + selectedCue.number + ' ' : ''}${selectedCue.name || '未命名'}」嗎？`)) {
    return;
  }

  const { siblings } = getCueParentAndSiblings(selectedCue);
  const idx = siblings.indexOf(selectedCue);
  if (idx !== -1) {
    siblings.splice(idx, 1);
  }

  const nextIdx = Math.max(0, standbyIndex - 1);
  buildCueList(false);
  if (flatCueList.length > 0) {
    setStandbyIndex(Math.min(nextIdx, flatCueList.length - 1));
  }
  showToast('已刪除 Cue');
}
btnCueDelete.addEventListener('click', deleteSelectedCue);

// Duplicate Cue
function duplicateSelectedCue() {
  const selectedCue = flatCueList[standbyIndex];
  if (!selectedCue) return;

  function cloneNode(node) {
    const copy = JSON.parse(JSON.stringify(node));
    copy.id = `cue_${Date.now()}_${Math.floor(Math.random() * 1000)}`;
    if (copy.name) copy.name += ' (複製)';
    if (copy.children && copy.children.length) {
      copy.children = copy.children.map(cloneNode);
    }
    return copy;
  }

  const cloned = cloneNode(selectedCue);
  const { siblings } = getCueParentAndSiblings(selectedCue);
  const curIdx = siblings.indexOf(selectedCue);
  siblings.splice(curIdx + 1, 0, cloned);

  buildCueList(false);
  const newIndex = flatCueList.findIndex(c => c.id === cloned.id);
  if (newIndex !== -1) setStandbyIndex(newIndex);
  showToast('已複製 Cue');
}
btnCueDuplicate.addEventListener('click', duplicateSelectedCue);

// Move Up
function moveCueUp() {
  const selectedCue = flatCueList[standbyIndex];
  if (!selectedCue) return;
  const { siblings } = getCueParentAndSiblings(selectedCue);
  const idx = siblings.indexOf(selectedCue);
  if (idx > 0) {
    const tmp = siblings[idx - 1];
    siblings[idx - 1] = siblings[idx];
    siblings[idx] = tmp;
    buildCueList(true);
  }
}
btnCueMoveUp.addEventListener('click', moveCueUp);

// Move Down
function moveCueDown() {
  const selectedCue = flatCueList[standbyIndex];
  if (!selectedCue) return;
  const { siblings } = getCueParentAndSiblings(selectedCue);
  const idx = siblings.indexOf(selectedCue);
  if (idx >= 0 && idx < siblings.length - 1) {
    const tmp = siblings[idx + 1];
    siblings[idx + 1] = siblings[idx];
    siblings[idx] = tmp;
    buildCueList(true);
  }
}
btnCueMoveDown.addEventListener('click', moveCueDown);

// Indent (Move into preceding GroupCue)
function indentCue() {
  const selectedCue = flatCueList[standbyIndex];
  if (!selectedCue) return;
  const { siblings } = getCueParentAndSiblings(selectedCue);
  const idx = siblings.indexOf(selectedCue);
  if (idx > 0) {
    const prevSibling = siblings[idx - 1];
    if (prevSibling.type === 'GroupCue') {
      siblings.splice(idx, 1);
      if (!prevSibling.children) prevSibling.children = [];
      prevSibling.children.push(selectedCue);
      prevSibling._collapsed = false;
      buildCueList(true);
      showToast(`已縮排至群組「${prevSibling.name || '未命名'}」中`);
    } else {
      showToast('上一筆項目不是群組，無法縮排');
    }
  }
}
btnCueIndent.addEventListener('click', indentCue);

// Outdent (Move out of current GroupCue)
function outdentCue() {
  const selectedCue = flatCueList[standbyIndex];
  if (!selectedCue || !selectedCue._parent) return;

  const currentParent = selectedCue._parent;
  const { parent: grandParent, siblings: parentSiblings } = getCueParentAndSiblings(currentParent);
  const currentSiblings = currentParent.children;

  const idx = currentSiblings.indexOf(selectedCue);
  if (idx !== -1) {
    currentSiblings.splice(idx, 1);
    const parentIdx = parentSiblings.indexOf(currentParent);
    parentSiblings.splice(parentIdx + 1, 0, selectedCue);
    buildCueList(true);
    showToast('已凸排移出群組');
  }
}
btnCueOutdent.addEventListener('click', outdentCue);

// -----------------------------------------------------------------------------
// Media Browser Modal
// -----------------------------------------------------------------------------

async function refreshMediaFiles() {
  try {
    const res = await fetch('/api/media-files');
    const data = await res.json();
    if (data.success) {
      mediaFilesList = data.files || [];
      if (mediaFolderPath && data.folder) {
        mediaFolderPath.value = data.folder;
      }
    }
  } catch (e) {
    console.error('Fetch media files error:', e);
  }
  renderMediaFileList();
}

async function openMediaModal() {
  mediaModal.style.display = 'flex';
  mediaSearchInput.value = '';

  // 取得目前設定的素材庫路徑
  try {
    const rFolder = await fetch('/api/media-folder');
    const dFolder = await rFolder.json();
    if (dFolder.success && mediaFolderPath) {
      mediaFolderPath.value = dFolder.folder;
    }
  } catch (e) {}

  await refreshMediaFiles();
}

function closeMediaModal() {
  mediaModal.style.display = 'none';
}

btnCloseMediaModal.addEventListener('click', closeMediaModal);
btnCancelMediaModal.addEventListener('click', closeMediaModal);
btnBrowseMedia.addEventListener('click', openMediaModal);
if (btnToolbarMedia) btnToolbarMedia.addEventListener('click', openMediaModal);

// 變更素材資料夾 (呼叫系統原生挑選視窗)
if (btnChangeMediaFolder) {
  btnChangeMediaFolder.addEventListener('click', async () => {
    showToast('📂 正在開啟系統資料夾挑選對話框...');
    try {
      const res = await fetch('/api/browse-folder', { method: 'POST' });
      const data = await res.json();
      if (data.success && !data.canceled && data.folder) {
        if (mediaFolderPath) mediaFolderPath.value = data.folder;
        if (projectData) projectData.mediaBasePath = data.folder;
        await refreshMediaFiles();
        showToast(`📁 已選擇素材資料夾: ${data.folder} (共 ${data.fileCount || 0} 個檔案)`);
      }
    } catch (e) {
      showToast(`變更資料夾失敗: ${e.message}`);
    }
  });
}

// 手動套用輸入的資料夾路徑
if (btnApplyMediaFolder) {
  btnApplyMediaFolder.addEventListener('click', async () => {
    const folder = mediaFolderPath.value.trim();
    if (!folder) return;
    try {
      const res = await fetch('/api/media-folder', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ folder })
      });
      const data = await res.json();
      if (data.success) {
        if (projectData) projectData.mediaBasePath = data.folder;
        await refreshMediaFiles();
        showToast(`📁 已套用素材資料夾: ${data.folder} (共 ${data.fileCount || 0} 個檔案)`);
      }
    } catch (e) {
      showToast(`套用資料夾失敗: ${e.message}`);
    }
  });
}

if (mediaFolderPath) {
  mediaFolderPath.addEventListener('keydown', (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (btnApplyMediaFolder) btnApplyMediaFolder.click();
    }
  });
}

if (btnRefreshMediaFolder) {
  btnRefreshMediaFolder.addEventListener('click', async () => {
    await refreshMediaFiles();
    showToast('🔄 已重新整理素材檔案清單');
  });
}

let currentFilterCategory = 'all';

document.querySelectorAll('.filter-pill').forEach(pill => {
  pill.addEventListener('click', (e) => {
    document.querySelectorAll('.filter-pill').forEach(p => p.classList.remove('active'));
    e.target.classList.add('active');
    currentFilterCategory = e.target.dataset.filter;
    renderMediaFileList();
  });
});

mediaSearchInput.addEventListener('input', () => {
  renderMediaFileList();
});

function renderMediaFileList() {
  const query = mediaSearchInput.value.toLowerCase().trim();
  mediaFileList.innerHTML = '';

  const filtered = mediaFilesList.filter(item => {
    // Category match
    if (currentFilterCategory === 'audio') {
      if (!['.wav', '.mp3', '.m4a', '.aac'].includes(item.ext)) return false;
    } else if (currentFilterCategory === 'video') {
      if (!['.mp4', '.mov', '.webm'].includes(item.ext)) return false;
    } else if (currentFilterCategory === 'image') {
      if (!['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.svg'].includes(item.ext)) return false;
    }
    // Search query match
    if (query && !item.path.toLowerCase().includes(query) && !item.name.toLowerCase().includes(query)) {
      return false;
    }
    return true;
  });

  mediaModalCount.textContent = `共 ${filtered.length} 個素材 (總庫存: ${mediaFilesList.length})`;

  filtered.forEach(item => {
    const el = document.createElement('div');
    el.className = 'media-file-item';
    const sizeStr = item.size > 1048576 ? `${(item.size / 1048576).toFixed(1)} MB` : `${(item.size / 1024).toFixed(0)} KB`;
    el.innerHTML = `
      <div class="media-file-path">${item.path}</div>
      <div class="media-file-meta">${item.ext.toUpperCase()} | ${sizeStr}</div>
    `;
    el.addEventListener('click', () => {
      const cue = flatCueList[standbyIndex];
      if (cue) {
        cue.fileTarget = item.path;
        editCueTarget.value = item.path;

        // Auto-switch type if currently GroupCue without children
        if (cue.type === 'GroupCue' && (!cue.children || cue.children.length === 0)) {
          if (['.mp4', '.mov', '.webm'].includes(item.ext)) {
            cue.type = 'VideoCue';
            editCueType.value = 'VideoCue';
          } else if (['.png', '.jpg', '.jpeg', '.webp', '.bmp', '.svg'].includes(item.ext)) {
            cue.type = 'ImageCue';
            editCueType.value = 'ImageCue';
          } else if (['.wav', '.mp3', '.m4a', '.aac'].includes(item.ext)) {
            cue.type = 'AudioCue';
            editCueType.value = 'AudioCue';
          }
        }

        updateCueRowUI(cue);
        updateInspector();
        showToast(`已套用素材: ${item.name} (${cue.type})`);
      }
      closeMediaModal();
    });
    mediaFileList.appendChild(el);
  });
}

// -----------------------------------------------------------------------------
// Playback Engine (GO, Stop, Panic, Fade, Audio, Video)
// -----------------------------------------------------------------------------

function getNextExecutableIndex(currentIdx) {
  const current = flatCueList[currentIdx];
  if (!current) return currentIdx + 1;

  for (let i = currentIdx + 1; i < flatCueList.length; i++) {
    if (flatCueList[i]._depth <= current._depth) {
      return i;
    }
  }
  return currentIdx + 1;
}

function scheduleTimer(fn, delayMs) {
  const tId = setTimeout(() => {
    activeTimers.delete(tId);
    fn();
  }, delayMs);
  activeTimers.add(tId);
  return tId;
}

function executeCue(cue, forceImmediate = false) {
  if (!cue) return;
  getAudioContext();

  const row = cue._rowEl;
  if (row) {
    row.classList.add('running');
    const statusIcon = document.getElementById(`status-${cue.id}`);
    if (statusIcon) statusIcon.textContent = '▶️';
  }

  const delayMs = forceImmediate ? 0 : ((cue.preWait || 0) * 1000);
  scheduleTimer(() => {
    runCueAction(cue, forceImmediate);
  }, delayMs);
}

function runCueAction(cue, forceImmediate = false) {
  const ctx = getAudioContext();

  const target = (cue.fileTarget || '').trim();
  const lower = target.toLowerCase();
  const isVideo = lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.endsWith('.webm');
  const isImage = lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg');
  const isAudio = lower.endsWith('.wav') || lower.endsWith('.mp3') || lower.endsWith('.m4a') || lower.endsWith('.aac');

  if (cue.type === 'GroupCue') {
    if (cue.children && cue.children.length) {
      if (cue.groupMode === 3) {
        // GroupMode 3: Start all children simultaneously
        cue.children.forEach(child => executeCue(child, forceImmediate));
      } else {
        // GroupMode 1: Sequential - start the first child
        executeCue(cue.children[0], forceImmediate);
      }
    }
    // FALLBACK: If GroupCue also has a fileTarget, play it!
    if (target && target !== '$null') {
      if (isAudio) playAudioCue(cue);
      else if (isVideo || isImage) playVideoCue(cue);
    }
  }
  else if (cue.type === 'AudioCue') {
    playAudioCue(cue);
  }
  else if (cue.type === 'VideoCue') {
    playVideoCue(cue);
  }
  else if (cue.type === 'ImageCue') {
    playImageCue(cue);
  }
  else if (cue.type === 'FadeCue') {
    executeFadeCue(cue);
  }
  else if (cue.type === 'StopCue') {
    executeStopCue(cue);
  }

  // Handle auto-continue (continueMode === 1)
  // 防禦機制：若位於 simultaneous group (groupMode === 3) 內，所有子項目已同步啟動，不進行同層連鎖觸發
  if (cue.continueMode === 1) {
    const isInsideSimultaneousGroup = cue._parent && cue._parent.groupMode === 3;
    if (!isInsideSimultaneousGroup) {
      const postDelayMs = (cue.postWait || 0) * 1000;
      scheduleTimer(() => {
        const nextIdx = getNextExecutableIndex(flatCueList.indexOf(cue));
        if (nextIdx < flatCueList.length) {
          setStandbyIndex(nextIdx);
          executeCue(flatCueList[nextIdx]);
        }
      }, postDelayMs);
    }
  }

  // Auto-finish visual indication after duration
  if (cue.duration > 0) {
    scheduleTimer(() => {
      if (cue._rowEl) {
        cue._rowEl.classList.remove('running');
        const statusIcon = document.getElementById(`status-${cue.id}`);
        if (statusIcon) statusIcon.textContent = '✅';
      }
      // Handle auto-follow (continueMode === 2)
      if (cue.continueMode === 2) {
        const isInsideSimultaneousGroup = cue._parent && cue._parent.groupMode === 3;
        if (!isInsideSimultaneousGroup) {
          const nextIdx = getNextExecutableIndex(flatCueList.indexOf(cue));
          if (nextIdx < flatCueList.length) {
            setStandbyIndex(nextIdx);
            executeCue(flatCueList[nextIdx]);
          }
        }
      }
    }, cue.duration * 1000);
  }
}

function playAudioCue(cue) {
  if (!cue.fileTarget || cue.fileTarget === '$null') return;

  // 若此前已有同 Cue 音訊在播放中，立即停止並釋放舊實例，杜絕聲音重疊堆疊
  if (runningAudios.has(cue.id)) {
    const oldAudio = runningAudios.get(cue.id);
    try {
      oldAudio.pause();
      oldAudio.currentTime = 0;
      oldAudio.src = '';
    } catch (e) {}
    allActiveAudios.delete(oldAudio);
    runningAudios.delete(cue.id);
  }

  const mediaUrl = getMediaUrl(cue.fileTarget);
  const audio = new Audio(mediaUrl);
  allActiveAudios.add(audio);
  runningAudios.set(cue.id, audio);

  audio.play().catch(e => console.warn('Audio play error:', e));

  audio.onended = () => {
    allActiveAudios.delete(audio);
    runningAudios.delete(cue.id);
    if (cue._rowEl) {
      cue._rowEl.classList.remove('running');
      const statusIcon = document.getElementById(`status-${cue.id}`);
      if (statusIcon) statusIcon.textContent = '✅';
    }
  };
}

function playVideoCue(cue) {
  if (!cue.fileTarget || cue.fileTarget === '$null') return;

  const target = cue.fileTarget.toLowerCase();
  const mediaUrl = getMediaUrl(cue.fileTarget);

  if (target.endsWith('.mp4') || target.endsWith('.mov') || target.endsWith('.webm')) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'STAGE_VIDEO_PLAY',
        src: mediaUrl,
        opacity: 1,
        fadeInDuration: 0
      }));
    }
    // If stage screen is not connected, play audio locally so operator hears it
    const isStageConnected = stageDot && stageDot.classList.contains('online');
    if (!isStageConnected) {
      if (runningAudios.has(cue.id)) {
        const oldAudio = runningAudios.get(cue.id);
        try {
          oldAudio.pause();
          oldAudio.currentTime = 0;
          oldAudio.src = '';
        } catch (e) {}
        allActiveAudios.delete(oldAudio);
        runningAudios.delete(cue.id);
      }

      const audio = new Audio(mediaUrl);
      allActiveAudios.add(audio);
      runningAudios.set(cue.id, audio);

      audio.play().catch(e => console.warn('Local video audio fallback warning:', e));
      audio.onended = () => {
        allActiveAudios.delete(audio);
        runningAudios.delete(cue.id);
        if (cue._rowEl) {
          cue._rowEl.classList.remove('running');
          const statusIcon = document.getElementById(`status-${cue.id}`);
          if (statusIcon) statusIcon.textContent = '✅';
        }
      };
    }
  } else if (target.endsWith('.png') || target.endsWith('.jpg') || target.endsWith('.jpeg')) {
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify({
        type: 'STAGE_IMAGE_SHOW',
        src: mediaUrl,
        opacity: 1,
        fadeInDuration: 0
      }));
    }
  }
}

function playImageCue(cue) {
  if (!cue.fileTarget || cue.fileTarget === '$null') return;
  const mediaUrl = getMediaUrl(cue.fileTarget);
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'STAGE_IMAGE_SHOW',
      src: mediaUrl,
      opacity: 1,
      fadeInDuration: 0
    }));
  }
}

function executeFadeCue(cue) {
  const isFadeIn = cue.fadeMode === 'fade-in' ||
    (cue.name || '').toLowerCase().includes('fade in') ||
    (cue.name || '').includes('淡入');
  const targetOpacity = isFadeIn ? 1.0 : (cue.targetOpacity !== undefined ? cue.targetOpacity : 0.0);
  const duration = cue.duration || 3.0;
  const stopWhenDone = isFadeIn ? false : (cue.stopTargetWhenDone !== undefined ? cue.stopTargetWhenDone : true);

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'STAGE_FADE',
      targetOpacity: targetOpacity,
      duration: duration,
      stopWhenDone: stopWhenDone
    }));
  }

  if (isFadeIn) {
    // Fade in audio: increase volume towards 1.0
    runningAudios.forEach((audio, id) => {
      let currentVol = audio.volume;
      const targetVol = 1.0;
      if (currentVol >= targetVol) return;
      const steps = Math.max(1, Math.floor(duration * 20));
      const step = (targetVol - currentVol) / steps;
      if (audio.paused && allActiveAudios.has(audio)) {
        audio.play().catch(e => console.warn('Audio play failed during fade-in:', e));
      }
      const interval = setInterval(() => {
        // 若已觸發 Panic / Stop，立即終止並註銷計時器，絕不可喚醒已停止聲音
        if (!allActiveAudios.has(audio) || audio.paused) {
          clearInterval(interval);
          activeIntervals.delete(interval);
          return;
        }
        if (audio.volume + step < targetVol) {
          audio.volume += step;
        } else {
          audio.volume = targetVol;
          clearInterval(interval);
          activeIntervals.delete(interval);
        }
      }, 50);
      activeIntervals.add(interval);
    });
  } else {
    // Fade out audio
    runningAudios.forEach((audio, id) => {
      let vol = audio.volume;
      const steps = Math.max(1, Math.floor(duration * 20));
      const step = vol / steps;
      const interval = setInterval(() => {
        if (!allActiveAudios.has(audio)) {
          clearInterval(interval);
          activeIntervals.delete(interval);
          return;
        }
        if (audio.volume > step) {
          audio.volume -= step;
        } else {
          audio.volume = 0;
          if (stopWhenDone) {
            audio.pause();
            allActiveAudios.delete(audio);
            runningAudios.delete(id);
          }
          clearInterval(interval);
          activeIntervals.delete(interval);
        }
      }, 50);
      activeIntervals.add(interval);
    });
  }
}

function executeStopCue(cue) {
  // 1. 清除所有漸層調整排程
  activeIntervals.forEach(id => clearInterval(id));
  activeIntervals.clear();

  // 2. 徹底停止所有音訊
  allActiveAudios.forEach(audio => {
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.src = '';
    } catch (e) {}
  });
  allActiveAudios.clear();
  runningAudios.clear();

  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'STAGE_STOP', fadeDuration: 1.0 }));
  }
}

function panic() {
  console.warn('🚨 PANIC TRIGGERED!');
  // 1. 清除所有計時器與間隔任務
  activeTimers.forEach(id => clearTimeout(id));
  activeTimers.clear();
  activeIntervals.forEach(id => clearInterval(id));
  activeIntervals.clear();

  // 2. 徹底終止全系統所有 HTMLAudioElement 實例
  allActiveAudios.forEach(audio => {
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.src = '';
    } catch (e) {}
  });
  allActiveAudios.clear();
  runningAudios.clear();

  // 3. 停止試聽與預覽
  if (currentAuditionElement) {
    try {
      currentAuditionElement.pause();
      currentAuditionElement.currentTime = 0;
      currentAuditionElement.src = '';
    } catch (e) {}
    currentAuditionElement = null;
  }
  if (previewVideo) {
    try { previewVideo.pause(); previewVideo.src = ''; } catch (e) {}
  }
  if (auditionPreviewBox) auditionPreviewBox.style.display = 'none';

  // 4. 通知舞台螢幕立即 Panic 歸零
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'STAGE_PANIC' }));
  }

  // 5. 更新所有行 UI
  flatCueList.forEach(c => {
    if (c._rowEl) {
      c._rowEl.classList.remove('running');
      const statusIcon = document.getElementById(`status-${c.id}`);
      if (statusIcon) statusIcon.textContent = '⏹️';
    }
  });
  showToast('🚨 PANIC: 全場緊急煞車！');
}

function stopRunningStateForEmergency() {
  // 1. 清除所有計時器與間隔任務 (Pre-wait, post-wait, continue, intervals)
  activeTimers.forEach(id => clearTimeout(id));
  activeTimers.clear();
  activeIntervals.forEach(id => clearInterval(id));
  activeIntervals.clear();

  // 2. 徹底終止全系統所有正在播放的音訊實例
  allActiveAudios.forEach(audio => {
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.src = '';
    } catch (e) {}
  });
  allActiveAudios.clear();
  runningAudios.clear();

  // 3. 停止試聽與預覽
  if (currentAuditionElement) {
    try {
      currentAuditionElement.pause();
      currentAuditionElement.currentTime = 0;
      currentAuditionElement.src = '';
    } catch (e) {}
    currentAuditionElement = null;
  }
  if (previewVideo) {
    try { previewVideo.pause(); previewVideo.src = ''; } catch (e) {}
  }
  if (auditionPreviewBox) auditionPreviewBox.style.display = 'none';

  // 4. 通知舞台螢幕立刻清空先前的畫面殘影 (STAGE_STOP，不影響字幕)
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'STAGE_STOP', fadeDuration: 0 }));
  }

  // 5. 清除所有 Cue 列的 running 執行狀態與圖示
  flatCueList.forEach(c => {
    if (c._rowEl) {
      c._rowEl.classList.remove('running');
      const statusIcon = document.getElementById(`status-${c.id}`);
      if (statusIcon) statusIcon.textContent = '⏸️';
    }
  });
}

function stopAndReset() {
  // 1. 清除所有計時器與間隔任務
  activeTimers.forEach(id => clearTimeout(id));
  activeTimers.clear();
  activeIntervals.forEach(id => clearInterval(id));
  activeIntervals.clear();

  // 2. 徹底終止全系統所有音訊實例
  allActiveAudios.forEach(audio => {
    try {
      audio.pause();
      audio.currentTime = 0;
      audio.src = '';
    } catch (e) {}
  });
  allActiveAudios.clear();
  runningAudios.clear();

  // 3. 停止試聽與預覽
  if (currentAuditionElement) {
    try {
      currentAuditionElement.pause();
      currentAuditionElement.currentTime = 0;
      currentAuditionElement.src = '';
    } catch (e) {}
    currentAuditionElement = null;
  }
  if (previewVideo) {
    try { previewVideo.pause(); previewVideo.src = ''; } catch (e) {}
  }
  if (auditionPreviewBox) auditionPreviewBox.style.display = 'none';

  // 4. 通知舞台螢幕
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'STAGE_PANIC' }));
  }

  // 5. 重設 UI
  flatCueList.forEach(c => {
    if (c._rowEl) {
      c._rowEl.classList.remove('running');
      const statusIcon = document.getElementById(`status-${c.id}`);
      if (statusIcon) statusIcon.textContent = '⏸️';
    }
  });

  setStandbyIndex(0);
  showToast('⏹️ 全部停止並重置');
}

function triggerGo() {
  if (standbyIndex < 0 || standbyIndex >= flatCueList.length) return;

  const cueToExecute = flatCueList[standbyIndex];
  executeCue(cueToExecute);

  const nextIdx = getNextExecutableIndex(standbyIndex);
  if (nextIdx < flatCueList.length) {
    setStandbyIndex(nextIdx);
  }
}

btnGo.addEventListener('click', triggerGo);
btnPanic.addEventListener('click', panic);
btnStop.addEventListener('click', stopAndReset);

// Audition Controls
let isAuditioning = false;
let currentAuditionElement = null; // HTMLAudioElement or HTMLVideoElement

function stopAudition() {
  if (currentAuditionElement) {
    try {
      currentAuditionElement.pause();
      currentAuditionElement.currentTime = 0;
    } catch (e) {}
    currentAuditionElement = null;
  }
  isAuditioning = false;
  if (btnCueAudition) {
    btnCueAudition.textContent = '▶️ 試聽';
    btnCueAudition.classList.remove('btn-audition-active');
  }
  if (btnInspAudition) {
    btnInspAudition.textContent = '▶️ 試聽選取 Cue';
    btnInspAudition.classList.remove('btn-audition-active');
  }
  if (auditionPreviewBox) {
    if (previewVideo) {
      try { previewVideo.pause(); previewVideo.src = ''; } catch (e) {}
    }
    auditionPreviewBox.style.display = 'none';
  }
  runningAudios.forEach(a => {
    try { a.pause(); } catch (e) {}
  });
  runningAudios.clear();
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'STAGE_PANIC' }));
  }
}

function auditionCue(cue) {
  if (!cue) return;

  if (isAuditioning) {
    stopAudition();
    showToast('⏹️ 已停止試聽');
    return;
  }

  getAudioContext();
  stopAudition();

  const target = (cue.fileTarget || '').trim();
  const lower = target.toLowerCase();

  // If cue is a GroupCue and has children, and no fileTarget: run children immediately
  if (cue.type === 'GroupCue' && cue.children && cue.children.length > 0 && (!target || target === '$null')) {
    isAuditioning = true;
    if (btnCueAudition) {
      btnCueAudition.textContent = '⏹️ 停止試聽';
      btnCueAudition.classList.add('btn-audition-active');
    }
    if (btnInspAudition) {
      btnInspAudition.textContent = '⏹️ 停止試聽';
      btnInspAudition.classList.add('btn-audition-active');
    }
    cue.children.forEach(child => runCueAction(child));
    showToast(`▶️ 試聽群組: ${cue.name || '未命名'}`);
    return;
  }

  if (!target || target === '$null') {
    showToast('⚠️ 此 Cue 尚未設定素材檔案，無法試聽');
    return;
  }

  const mediaUrl = getMediaUrl(target);
  isAuditioning = true;
  if (btnCueAudition) {
    btnCueAudition.textContent = '⏹️ 停止試聽';
    btnCueAudition.classList.add('btn-audition-active');
  }
  if (btnInspAudition) {
    btnInspAudition.textContent = '⏹️ 停止試聽';
    btnInspAudition.classList.add('btn-audition-active');
  }

  const isVideo = (cue.type === 'VideoCue' || lower.endsWith('.mp4') || lower.endsWith('.mov') || lower.endsWith('.webm')) && cue.type !== 'ImageCue';
  const isImage = cue.type === 'ImageCue' || lower.endsWith('.png') || lower.endsWith('.jpg') || lower.endsWith('.jpeg') || lower.endsWith('.webp') || lower.endsWith('.bmp') || lower.endsWith('.svg');

  // Push to stage screen if stage is open
  if (ws && ws.readyState === WebSocket.OPEN) {
    if (isVideo) {
      ws.send(JSON.stringify({
        type: 'STAGE_VIDEO_PLAY',
        src: mediaUrl,
        opacity: 1,
        fadeInDuration: 0
      }));
    } else if (isImage) {
      ws.send(JSON.stringify({
        type: 'STAGE_IMAGE_SHOW',
        src: mediaUrl,
        opacity: 1,
        fadeInDuration: 0
      }));
    }
  }

  if (isVideo) {
    // Show mini monitor preview box and play video with unmuted audio locally in console
    if (auditionPreviewBox && previewVideo) {
      auditionPreviewBox.style.display = 'flex';
      previewVideo.style.display = 'block';
      if (previewImage) previewImage.style.display = 'none';
      if (previewTitle) previewTitle.textContent = `🎬 監視預覽: ${cue.name || target}`;

      previewVideo.src = mediaUrl;
      previewVideo.volume = 1.0;
      previewVideo.currentTime = 0;
      previewVideo.play().catch(e => {
        console.warn('Video preview play warning:', e);
        const audio = new Audio(mediaUrl);
        audio.play().catch(() => {});
        currentAuditionElement = audio;
      });
      currentAuditionElement = previewVideo;

      previewVideo.onended = () => stopAudition();
    } else {
      const audio = new Audio(mediaUrl);
      audio.play().catch(e => console.warn('Audio play error:', e));
      currentAuditionElement = audio;
      audio.onended = () => stopAudition();
    }
    showToast(`▶️ 正在試聽/預覽視訊: ${cue.name || target}`);
  }
  else if (isImage) {
    if (auditionPreviewBox && previewImage) {
      auditionPreviewBox.style.display = 'flex';
      if (previewVideo) { previewVideo.style.display = 'none'; previewVideo.src = ''; }
      previewImage.style.display = 'block';
      previewImage.src = mediaUrl;
      if (previewTitle) previewTitle.textContent = `🖼️ 圖片預覽: ${cue.name || target}`;
    }
    showToast(`🖼️ 正在預覽圖片: ${cue.name || target}`);
  }
  else {
    // Audio file playback
    if (auditionPreviewBox) auditionPreviewBox.style.display = 'none';
    const audio = new Audio(mediaUrl);
    audio.play().catch(e => console.warn('Audio play error:', e));
    currentAuditionElement = audio;
    audio.onended = () => stopAudition();
    showToast(`🎵 正在試聽音訊: ${cue.name || target}`);
  }
}

btnCueAudition.addEventListener('click', () => {
  auditionCue(flatCueList[standbyIndex]);
});

if (btnInspAudition) {
  btnInspAudition.addEventListener('click', () => {
    auditionCue(flatCueList[standbyIndex]);
  });
}

btnCueAuditionStop.addEventListener('click', () => {
  stopAudition();
  showToast('⏹️ 停止試聽');
});

if (btnClosePreview) {
  btnClosePreview.addEventListener('click', () => {
    stopAudition();
  });
}

// Keyboard Navigation & Shortcuts
window.addEventListener('keydown', (e) => {
  // If typing in input fields, handle Ctrl+S only
  const isTyping = ['INPUT', 'TEXTAREA', 'SELECT'].includes(e.target.tagName);

  if ((e.ctrlKey || e.metaKey) && e.code === 'KeyS') {
    e.preventDefault();
    saveProjectToServer();
    return;
  }

  if (isTyping) return;

  if (currentMode === 'show') {
    // Show Mode Shortcuts
    if (e.code === 'Space') {
      e.preventDefault();
      triggerGo();
    }
    else if (e.code === 'ArrowDown') {
      e.preventDefault();
      setStandbyIndex(Math.min(flatCueList.length - 1, standbyIndex + 1));
    }
    else if (e.code === 'ArrowUp') {
      e.preventDefault();
      setStandbyIndex(Math.max(0, standbyIndex - 1));
    }
    // 🎭 即時字幕換行與推進 (單人執台快捷鍵: PageDown 下一句, PageUp 上一句)
    else if (e.code === 'PageDown') {
      e.preventDefault();
      mainSubGo();
    }
    else if (e.code === 'PageUp') {
      e.preventDefault();
      mainSubBack();
    }
    else if (e.code === 'Backslash' || e.code === 'Backquote') {
      e.preventDefault();
      mainSubToggleBlank();
    }
    else if (e.code === 'Escape') {
      e.preventDefault();
      panic();
    }
  } else {
    // Edit Mode Shortcuts
    if ((e.ctrlKey || e.metaKey) && e.code === 'KeyD') {
      e.preventDefault();
      duplicateSelectedCue();
    }
    else if (e.code === 'Delete' || e.code === 'Backspace') {
      e.preventDefault();
      deleteSelectedCue();
    }
    else if (e.altKey && e.code === 'ArrowUp') {
      e.preventDefault();
      moveCueUp();
    }
    else if (e.altKey && e.code === 'ArrowDown') {
      e.preventDefault();
      moveCueDown();
    }
    else if (e.code === 'ArrowDown') {
      e.preventDefault();
      setStandbyIndex(Math.min(flatCueList.length - 1, standbyIndex + 1));
    }
    else if (e.code === 'ArrowUp') {
      e.preventDefault();
      setStandbyIndex(Math.max(0, standbyIndex - 1));
    }
    else if (e.code === 'Space') {
      e.preventDefault();
      // Space in edit mode: audition
      const cue = flatCueList[standbyIndex];
      if (cue) auditionCue(cue);
    }
  }
});

// Utility
function escapeHtml(str) {
  if (!str) return '';
  return String(str)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

// =============================================================================
// 🎭 即時字幕整合播控模組 (Integrated Live Subtitles Panel System)
// =============================================================================

let mainSubScript = [];
let mainSubIndex = -1;
let mainSubVisible = false;

const panelSubProgress = document.getElementById('panel-sub-progress');
const panelSubFileInput = document.getElementById('panel-sub-file-input');
const panelSubDemoBtn = document.getElementById('panel-sub-demo-btn');
const panelSubPrevText = document.getElementById('panel-sub-prev-text');
const panelSubOnAirBox = document.getElementById('panel-sub-onair-box');
const panelSubOnAirBadge = document.getElementById('panel-sub-onair-badge');
const panelSubCurrentMain = document.getElementById('panel-sub-current-main');
const panelSubCurrentSub = document.getElementById('panel-sub-current-sub');
const panelSubNextText = document.getElementById('panel-sub-next-text');
const panelSubScriptList = document.getElementById('panel-sub-script-list');
const panelSubGoBtn = document.getElementById('panel-sub-go-btn');
const panelSubBlankBtn = document.getElementById('panel-sub-blank-btn');
const panelSubBlankLabel = document.getElementById('panel-sub-blank-label');
const panelSubBackBtn = document.getElementById('panel-sub-back-btn');

function renderSubScriptList() {
  if (!panelSubScriptList) return;
  panelSubScriptList.innerHTML = '';

  mainSubScript.forEach((item, idx) => {
    const itemEl = document.createElement('div');
    itemEl.className = 'sub-panel-item';
    itemEl.id = `sub-item-${idx}`;

    if (item.align === 'right') {
      itemEl.classList.add('lyrics-right-item');
    } else if (item.align === 'left') {
      itemEl.classList.add('lyrics-left-item');
    }

    const linesHtml = escapeHtml(item.text).split('\n').join('<br/>');

    let badgeHtml = '';
    if (item.align === 'right') {
      badgeHtml = '<span class="sub-tag-align-right">[歌詞靠右]</span>';
    } else if (item.align === 'left') {
      badgeHtml = '<span class="sub-tag-align-left">[歌詞靠左]</span>';
    }

    itemEl.innerHTML = `
      <div class="sub-item-idx">${idx + 1}</div>
      <div class="sub-item-body">
        <div class="sub-item-txt">
          ${badgeHtml}${linesHtml}
        </div>
      </div>
    `;

    itemEl.title = '雙擊此台詞立刻播放 (緊急處置)';

    // 點擊任意行跳轉台詞
    itemEl.addEventListener('click', () => {
      mainSubJumpTo(idx);
    });

    // 雙擊任意字幕行：立刻播放的臨時緊急處置
    itemEl.addEventListener('dblclick', () => {
      mainSubJumpTo(idx);
    });

    panelSubScriptList.appendChild(itemEl);
  });

  updateMainSubHUD();
}

function updateMainSubHUD() {
  if (panelSubProgress) {
    panelSubProgress.textContent = `進度: ${mainSubIndex >= 0 ? mainSubIndex + 1 : 0} / ${mainSubScript.length}`;
  }

  // 清除舊高亮
  if (panelSubScriptList) {
    panelSubScriptList.querySelectorAll('.sub-panel-item').forEach(el => {
      el.classList.remove('current', 'next-up');
    });
  }

  // 上一句
  if (panelSubPrevText) {
    if (mainSubIndex > 0 && mainSubScript[mainSubIndex - 1]) {
      const prevLine = mainSubScript[mainSubIndex - 1].text.split('\n')[0];
      panelSubPrevText.textContent = `${mainSubIndex}. ${prevLine}`;
    } else {
      panelSubPrevText.textContent = '（無上一句）';
    }
  }

  // 當前句 (ON-AIR)
  const cur = mainSubScript[mainSubIndex];
  if (cur) {
    if (panelSubCurrentMain) {
      panelSubCurrentMain.textContent = cur.text;
    }
    if (panelSubCurrentSub) {
      panelSubCurrentSub.style.display = 'none';
    }

    // 當前行滾動並高亮
    const curEl = document.getElementById(`sub-item-${mainSubIndex}`);
    if (curEl) {
      curEl.classList.add('current');
      curEl.scrollIntoView({ behavior: 'smooth', block: 'center' });
    }
  } else {
    if (panelSubCurrentMain) {
      panelSubCurrentMain.textContent = mainSubScript.length > 0 ? '請按 [PageDown] 開始' : '請載入字幕檔 (.txt)';
    }
    if (panelSubCurrentSub) panelSubCurrentSub.style.display = 'none';
  }

  // 下一句
  const nextIdx = mainSubIndex + 1;
  if (panelSubNextText) {
    if (nextIdx < mainSubScript.length && mainSubScript[nextIdx]) {
      const nextLine = mainSubScript[nextIdx].text.split('\n')[0];
      panelSubNextText.textContent = `${nextIdx + 1}. ${nextLine}`;
      const nextEl = document.getElementById(`sub-item-${nextIdx}`);
      if (nextEl) nextEl.classList.add('next-up');
    } else {
      panelSubNextText.textContent = '-- 全劇終 --';
    }
  }

  // 狀態徽章與卡片邊框 (區分 一般居中 vs [歌詞靠右] vs [歌詞靠左])
  if (mainSubVisible && cur) {
    if (panelSubOnAirBox) {
      panelSubOnAirBox.classList.remove('blank', 'align-right-mode', 'align-left-mode');
      panelSubOnAirBox.classList.add('active');
      if (cur.align === 'right') {
        panelSubOnAirBox.classList.add('align-right-mode');
      } else if (cur.align === 'left') {
        panelSubOnAirBox.classList.add('align-left-mode');
      }
    }
    if (panelSubOnAirBadge) {
      panelSubOnAirBadge.className = 'badge-onair live';
      if (cur.align === 'right') {
        panelSubOnAirBadge.textContent = 'ON-AIR [歌詞靠右]';
      } else if (cur.align === 'left') {
        panelSubOnAirBadge.textContent = 'ON-AIR [歌詞靠左]';
      } else {
        panelSubOnAirBadge.textContent = 'ON-AIR';
      }
    }
    if (panelSubBlankLabel) panelSubBlankLabel.textContent = 'BLANK 黑幕';
  } else {
    if (panelSubOnAirBox) {
      panelSubOnAirBox.classList.add('blank');
      panelSubOnAirBox.classList.remove('active', 'align-right-mode', 'align-left-mode');
    }
    if (panelSubOnAirBadge) {
      panelSubOnAirBadge.className = 'badge-onair blank-mode';
      panelSubOnAirBadge.textContent = 'BLANK';
    }
    if (panelSubBlankLabel) panelSubBlankLabel.textContent = 'TAKE 亮出';
  }
}

function mainSubGo() {
  if (mainSubScript.length === 0) return;
  if (mainSubIndex < mainSubScript.length - 1) {
    mainSubIndex++;
    sendMainSubShow(mainSubIndex);
    mainSubVisible = true;
    updateMainSubHUD();
  }
}

function mainSubBack() {
  if (mainSubScript.length === 0) return;
  if (mainSubIndex > 0) {
    mainSubIndex--;
    sendMainSubShow(mainSubIndex);
    mainSubVisible = true;
    updateMainSubHUD();
  }
}

function mainSubJumpTo(idx) {
  if (idx < 0 || idx >= mainSubScript.length) return;
  mainSubIndex = idx;
  sendMainSubShow(mainSubIndex);
  mainSubVisible = true;
  updateMainSubHUD();
}

function mainSubToggleBlank() {
  if (mainSubScript.length === 0 || mainSubIndex < 0) return;
  const cur = mainSubScript[mainSubIndex];
  if (mainSubVisible) {
    sendMainSubClear();
    mainSubVisible = false;
  } else {
    if (cur) {
      sendMainSubShow(mainSubIndex);
      mainSubVisible = true;
    }
  }
  updateMainSubHUD();
}

function mainSubClear() {
  sendMainSubClear();
  mainSubVisible = false;
  updateMainSubHUD();
}

function sendMainSubShow(idx) {
  const line = mainSubScript[idx];
  if (!line) return;
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'SUBTITLE_SHOW',
      index: idx,
      text: line.text,
      align: line.align || (isLyricsText(line.text) ? 'right' : 'center')
    }));
  }
}

function sendMainSubClear() {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({ type: 'SUBTITLE_CLEAR' }));
  }
}

function sendMainSubLoad(newScript) {
  if (ws && ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'SUBTITLE_LOAD',
      script: newScript
    }));
  }
}

function parseScriptLines(rawText) {
  if (!rawText) return [];
  const cleaned = rawText.replace(/^\uFEFF/, '').trim();
  const parsed = [];
  const hasParagraphs = /\r?\n\s*\r?\n/.test(cleaned);
  const blocks = hasParagraphs ? cleaned.split(/\r?\n\s*\r?\n/) : cleaned.split(/\r?\n/);

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

function loadScriptIntoMain(rawText, sourceName = '') {
  const parsed = parseScriptLines(rawText);
  if (parsed.length === 0) {
    showToast('⚠️ 未解析到有效台詞行！');
    return;
  }
  mainSubScript = parsed;
  mainSubIndex = -1;
  mainSubVisible = false;
  sendMainSubLoad(mainSubScript);
  renderSubScriptList();
  showToast(`已成功載入劇本 (${sourceName}): 共 ${mainSubScript.length} 句`);
}

// 檔案載入事件
if (panelSubFileInput) {
  panelSubFileInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (evt) => {
      loadScriptIntoMain(evt.target.result, file.name);
    };
    reader.readAsText(file, 'UTF-8');
    e.target.value = '';
  });
}

// 範例劇本按鈕 (純台詞與歌詞，支援一頁多行與 [歌詞靠右]、[歌詞靠左])
if (panelSubDemoBtn) {
  panelSubDemoBtn.addEventListener('click', () => {
    const demo = `今晚的夜空格外澄澈
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
    loadScriptIntoMain(demo, '星星月月範例');
  });
}

// 按鈕事件綁定
if (panelSubGoBtn) panelSubGoBtn.addEventListener('click', mainSubGo);
if (panelSubBlankBtn) panelSubBlankBtn.addEventListener('click', mainSubToggleBlank);
if (panelSubBackBtn) panelSubBackBtn.addEventListener('click', mainSubBack);

// Initialize
connectWebSocket();
loadProject();
