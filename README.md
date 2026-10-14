# 🎭 Cue Master (專業開源跨平台劇場影音播放控制系統)

[![License: MIT](https://img.shields.io/badge/License-MIT-blue.svg)](LICENSE)
[![Platform](https://img.shields.io/badge/Platform-Windows%20%7C%20macOS%20%7C%20Linux-green.svg)](#)
[![Node](https://img.shields.io/badge/Node-%3E%3D18.0.0-brightgreen.svg)](#)
[![Electron](https://img.shields.io/badge/Electron-Desktop%20Ready-blueviolet.svg)](#)

> **擺脫 macOS 與昂貴專用軟體的門檻！**  
> Cue Master 是一套專為中小型劇團、學校劇社、舞監與獨立劇場創作者量身打造的**跨平台開源影音播控與字幕聯控系統**。  
> 兼具**原生桌面程式的順暢、Web 跨裝置無線協同的高靈活性**，以及劇場實戰所需的**極致防呆與緊急應變機制**。

---

## 🌟 核心特色

### 1. 🎭 專為劇場實戰打造的「單人執台雙軌並行」工作流
在許多中小型演出中，音響／影像技術人員常需兼顧現場對白字幕播映：
* **主軌道 (音效 / 影像 / 淡入淡出 Cue)**：
  * `[Space]`（空白鍵）：執行目前 Standby 待命 Cue。
  * `[↑]` / `[↓]`：自由上下選取待命 Cue，完全不干擾當前正在播放的影音。
  * **滑鼠雙擊任一 Cue**：演出中臨時突發狀況（如演員漏詞、跳段），立刻中斷舊狀態並**零延遲直接播放該 Cue**。
  * **快速雙擊 `[Esc]`**：全場 **PANIC 緊急煞車**（1秒平滑淡出所有音效並畫面全黑歸零）。
* **副軌道 (即時台詞字幕推進)**：
  * 主控台 Show 播放模式底部內建 **即時字幕播控橫幅 (Live Subtitle Strip)**。
  * `[PageDown]` 或 `[Enter]`：下一句字幕推進（平滑過渡，完全不影響選 Cue）。
  * `[PageUp]`：上一句字幕回退。
  * `[ \ ]` 鍵：一鍵黑幕隱藏字幕 (Blank / Toggle)。
  * **滑鼠雙擊任一字幕行**：演員臨時搶話或跳詞時，立刻插播該句台詞。

### 2. 📺 智慧雙螢幕與外接投影系統 (`/stage` & `/subtitle-screen`)
* **原生雙螢幕自動偵測**：Electron 桌面模式下，一鍵點擊「開啟舞台投影」，自動識別外接投影螢幕並全螢幕置頂呈現。
* **True Black 純黑畫布**：進入全螢幕後永久純黑，自動隱藏滑鼠游標與作業系統視窗元件，絕不漏光出戲。
* **無黑色塊透明字幕疊加**：支援高對比純淨黑邊陰影文字疊加於舞台影像上方，完美呈現如電影般的透明質感。
* **獨立純字幕投影副螢幕 (`/subtitle-screen`)**：若劇場備有專用字幕機（如觀眾席兩側字幕電視），可單獨投影純字幕畫面。

### 3. 📱 跨裝置多工協同：獨立字幕播控台 (`/subtitle-deck`)
* 支援由專職字幕員透過 **iPad、手機或第二台筆電** 連線至同一區域網路：
  * 網址：`http://主機IP:8080/subtitle-deck`
* 毫秒級 WebSocket 雙向即時廣播同步，主控台與平板字幕員任一方推動字幕，全場螢幕同步更新！

### 4. 🔄 雙向相容 QLab 5 專案檔 (`.qlab5`)
* 內建基於 Python 3 的原生二進位 Plist 解析核心，支援：
  * **無痛匯入**：直接讀取 macOS QLab 5 專案檔，自動提取 Audio / Video / Fade / Group 等 Cue 結構與時間參數。
  * **雙向導出**：將 Cue Master 編修後之專案導出為標準二進位 `.qlab5` 檔案，在 macOS 上 100% 正常載入。

### 5. 📦 開箱即用：內建完整開源示範專案《星星月月》
* 專案內建免版權爭議之完整小型劇場劇目《星星月月》：
  * 包含主控劇本 (`星星月月.json` & `星星月月.qlab5`)。
  * 包含 Click（樂團節拍導引）與 PGM（主音訊）雙軌同步音軌。
  * 包含星空夜幕高畫質動態背景影片、開場主視覺與黑幕。
  * 包含具備雙語對白與靠左/靠右歌詞標註的完整示範劇本 (`星星月月_字幕.txt`)。

---

## 🚀 快速上手 (Quick Start)

### 系統需求
* **Node.js**：v18.0.0 以上
* **Python**（選配，僅在匯入/導出原生 `.qlab5` 檔案時需要）：Python 3.8+

---

### 方法 A：Windows 一鍵啟動
專案根目錄下已附帶一鍵批次檔，直接雙擊：
👉 `啟動 Cue Master.bat`

> 若環境中已安裝相依套件，將優先以 **Electron 原生桌面應用程式** 開啟；若無，則會自動啟動本地伺服器並為您開啟預設瀏覽器控制台。

### 方法 B：macOS 一鍵啟動
在 macOS 終端機或 Finder 中執行：
👉 `啟動 Cue Master.command`

### 方法 C：標準命令列啟動
1. 複製或下載本專案至本地端：
   ```bash
   git clone https://github.com/your-username/cuemaster.git
   cd cuemaster
   ```
2. 安裝必要相依套件：
   ```bash
   npm install
   ```
3. 啟動原生桌面程式：
   ```bash
   npm start
   ```
   *或僅啟動微型服務核心（適用於無圖形介面主機或平板伺服端）：*
   ```bash
   npm run server
   ```

啟動後，控制端點如下：
* **主控台介面 (Control Console)**：`http://localhost:8080`
* **舞台投影螢幕 (Stage Output)**：`http://localhost:8080/stage`（按 `F11` 進入全螢幕）
* **獨立字幕播控台 (Subtitle Deck)**：`http://localhost:8080/subtitle-deck`
* **獨立純字幕螢幕 (Subtitle Screen)**：`http://localhost:8080/subtitle-screen`
* **實境演練模擬器 (Simulator)**：`http://localhost:8080/simulator`

---

## ⌨️ 劇場快捷鍵清單 (Hotkeys Cheatsheet)

| 按鍵 | 功能說明 | 作用範圍 |
| :--- | :--- | :--- |
| **`[Space]` (空白鍵)** | 執行待命 Cue (GO) | 主控台 (演出模式) |
| **`[↑]` / `[↓]`** | 上下移動待命游標 (Standby) | 主控台 (演出模式) |
| **滑鼠雙擊 Cue** | 緊急立刻播放指定 Cue（清理舊狀態並立刻發聲/投影） | 主控台 / 模擬器 |
| **連續雙擊 `[Esc]`** | **全場 PANIC 緊急煞車**（1秒淡出靜音並全黑） | 全系統通用 |
| **`[PageDown]` / `[Enter]`** | 下一句字幕推進 | 主控台 / 字幕控制台 |
| **`[PageUp]`** | 上一句字幕回退 | 主控台 / 字幕控制台 |
| **`[ \ ]`** | 一鍵隱藏／顯現字幕 (Blank Toggle) | 主控台 / 字幕控制台 |
| **滑鼠雙擊字幕行** | 緊急跳轉並即時投影該句台詞 | 主控台 / 字幕控制台 |
| **`[F11]`** | 進入／退出全螢幕 | 舞台投影與字幕視窗 |

---

## 📝 字幕劇本語法範例 (`.txt` / `.srt`)

字幕模組支援直接載入純文字檔案 (`.txt`) 或標準字幕檔 (`.srt`)：
* **一般對白**：一行一句，空行自動分頁。
* **舞台指示過濾**：文字中的 `[指示]` 或 `(指示)` 會自動過濾，不投放到公眾螢幕。
* **歌詞排版標籤**：
  * 開頭加 `[歌詞靠左]`：該頁文字靠左對齊，支援多行歌詞。
  * 開頭加 `[歌詞靠右]`：該頁文字靠右對齊。
* **雙語字幕**：支援第一行為中文、第二行為英文，系統自動以高對比排版呈現。

---

## 📂 專案檔案架構

```text
cuemaster/
├── main.js                  # Electron 桌面主行程、原生視窗與多螢幕管理
├── server.js                # Node.js 本機伺服器、HTTP Range 串流與 WebSocket 中心
├── project_service.js       # 專案資料模型、自動備份、媒體掃描與 REST API 路由
├── package.json             # 專案依賴與腳本定義
├── LICENSE                  # MIT 開源授權條款
├── README.md                # 專案說明文檔
├── 啟動 Cue Master.bat       # Windows 一鍵啟動腳本
├── 啟動 Cue Master.command   # macOS 一鍵啟動腳本
├── 啟動實境測試模擬器.bat    # 舞監模擬演練啟動腳本
├── 執行測試模擬程式.bat      # 自動化整合測試執行腳本
├── src/
│   ├── qlab_bridge.py       # Python 3 二進位 Plist 解析與逆向編碼引擎
│   └── browse_folder.ps1    # Windows 原生置頂資料夾選取器
├── public/
│   ├── index.html           # 專業劇場暗黑高對比主控台 UI
│   ├── app.js               # Web Audio 多軌音訊引擎、Cue 排程、字幕條邏輯
│   ├── style.css            # 主控台樣式庫
│   ├── stage.html / .js     # 舞台專用 True Black 投影螢幕與字幕圖層
│   ├── subtitle-deck.*      # 獨立專職字幕員控制台 (HTML / JS / CSS)
│   ├── subtitle-screen.html # 獨立純字幕投影螢幕
│   └── simulator.*          # 劇場實境演練模擬器
├── tests/
│   ├── test_runner.py       # 6 大核心指標自動化測試 (Plist, 壓力, 煞車, Round-trip)
│   ├── test_api_endpoints.js# 11 組 REST API 端點驗證測試
│   └── test_subtitle_deck.js# 字幕同步、舞台疊加與雙擊緊急處置驗證測試
└── 示範專案/
    ├── 星星月月.json        # 示範專案標準檔
    ├── 星星月月.qlab5       # 示範專案 QLab 5 原生檔
    ├── 星星月月_字幕.txt     # 示範專案台詞字幕
    └── media/               # 示範影音素材庫 (Click/PGM 音效、背景影片、圖片)
```

---

## 🧪 執行自動化測試

專案內建嚴謹的測試矩陣，涵蓋工業級二進位解析、200次高頻隨機指令暴擊測試、雙向 Round-trip 驗證等：

```bash
npm test
```

或分項單獨執行：
```bash
# 執行 Python 核心狀態機與相容性測試
python tests/test_runner.py

# 執行 REST API 與專案匯入導出測試
node tests/test_api_endpoints.js

# 執行字幕通訊與舞台疊加測試
node tests/test_subtitle_deck.js
```

---

## 📦 打包發佈原生執行檔

若您需要打包成免安裝綠色版或安裝檔發送給演出團隊：

```bash
# 打包綠色免安裝目錄 (Unpacked Directory)
npm run pack

# 打包正式安裝包 (Windows: NSIS installer & Portable / macOS: DMG / Linux: AppImage)
npm run dist
```
打包產物將生成於 `dist/` 資料夾內。

---

## 🤝 歡迎參與開源貢獻 (Contributing)

歡迎劇場技術同好、音響工程師、舞台監督與開發者共同參與完善 Cue Master：
1. Fork 本倉庫。
2. 建立您的特性分支 (`git checkout -b feature/AmazingFeature`)。
3. 提交您的修改 (`git commit -m 'Add some AmazingFeature'`)。
4. 推送至分支 (`git push origin feature/AmazingFeature`)。
5. 開啟 Pull Request。

---

## 📄 授權條款 (License)

本專案採用 [MIT License](LICENSE) 開源授權，歡迎任何個人、劇團或非營利組織自由使用與改作。
