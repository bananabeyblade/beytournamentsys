# 計分鎖定、操作紀錄與同步狀態

三項功能：同一場比賽的編輯鎖／衝突偵測、管理者操作紀錄（僅擁有者 john410403123@gmail.com 可查看）、以及管理者頁面的同步狀態指示與重試。

## 1. 同一場比賽的編輯鎖（樂觀鎖）

- 每場比賽新增鎖定資訊（誰在計分、何時、心跳時間），跟著現有的賽況快照一起同步。
- 管理者打開某場比賽的計分視窗時取得鎖，視窗開著時每 10 秒續約，關閉時釋放；超過 30 秒沒有續約自動視為過期（避免有人斷線後永久卡住）。
- 其他管理者打開同一場比賽時，看到「⟡ 由 XXX 正在計分中」的提示，畫面為唯讀，並提供「強制接手」按鈕（僅擁有者可用），避免現場卡關。
- 樂觀鎖：計分視窗記住開啟時的比賽版本號。若送出得分時雲端版本已更新（別人已改），不覆蓋，改為顯示「此局已被更新」提示並自動載入最新分數，讓裁判確認後再輸入。
- 現有的每場版本號（rev）與合併機制照用，只是加上鎖定欄位一起合併，取版本較新者。

## 2. 管理者操作紀錄

資料表已建立（`admin_actions`）。要做的是寫入與查看：

- 寫入時機：新增選手、刪除選手、產生賽程（建名單）、開始比賽、輸入比分／撤銷比分、確認勝者、強制結束賽事、重置賽事。
- 每筆紀錄：操作者帳號、動作類型、賽事名稱、細節（例如選手名稱、比賽輪次與桌號、比分變化）、時間。
- 寫入為「盡力而為」：紀錄失敗不會中斷現場操作。
- 查看：設定頁新增「操作紀錄 AUDIT LOG」面板，只有擁有者帳號（john410403123@gmail.com）看得到，其他管理者連面板都不顯示；讀取走伺服器端驗證，任何人都無法直接讀資料表。
- 面板功能：最近 200 筆列表（時間、操作者、動作、細節）、依動作類型篩選、依賽事篩選、重新整理，以及匯出成 .txt。

## 3. 同步狀態指示與重試

- 賽況推送狀態集中管理，狀態為：已同步（顯示最後同步時間）／正在同步／同步失敗。
- 管理者頁面頂部顯示小徽章（綠＝已同步、黃＝正在同步、紅＝同步失敗）；失敗時出現「重試」按鈕，按下即重送目前賽況並重新拉取雲端最新狀態。
- 與現有的離線橫幅並存：離線橫幅講網路，這個徽章講資料是否已上雲。
- 觀眾（QR 進入）不顯示此徽章。

## 技術細節

- `src/lib/tournament-types.ts`：`Match` 新增 `lockedBy` / `lockedByName` / `lockedAt`（epoch ms）。
- `src/lib/live-merge.ts`：`mergeMatches` 保留較新 rev 的鎖定欄位；過期鎖（>30s）在合併時清除。
- `src/lib/tournament-store.tsx`：
  - 新增 `acquireMatchLock` / `releaseMatchLock` / `renewMatchLock` / `lockInfo(match)` / `forceUnlock`（擁有者限定）。
  - 新增 `syncStatus`、`lastSyncedAt`、`retrySync()`；publish 前設 `syncing`，成功 `synced`，`catch` 設 `error`（保留現有 toast）。
  - 新增 `isOwner`（`currentAdmin.email === "john410403123@gmail.com"`）。
  - 在 `addPlayers`／`removePlayer`／`generateBracket`／`startMatch`／`addScore`／`undoScore`／`confirmWinner`／`forceFinishTournament`／`resetTournament` 呼叫 `logAction()`。
- 新檔 `src/lib/audit.ts`：`logAction(action, detail)` 以瀏覽器 client 寫入 `admin_actions`（RLS 只允許寫入自己的紀錄），失敗僅 console。
- 新檔 `src/lib/audit.functions.ts`：`listAuditLogFn`（`requireSupabaseAuth` + 擁有者信箱檢查，handler 內動態 import `supabaseAdmin` 讀取，支援 action／tournament 篩選與 limit）。
- 新檔 `src/components/AuditLogCard.tsx`（設定頁，`isOwner` 才渲染）、`src/components/SyncStatusBadge.tsx`（`AppShell` 管理者列顯示）。
- `src/components/ScoringModal.tsx`：掛載時取鎖＋心跳、卸載時釋放；被別人鎖住時唯讀；版本不一致時顯示衝突提示。
- 不需要新的資料庫遷移，`admin_actions` 已存在且權限已設定。
