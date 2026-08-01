# 系統狀態面板 System Status Panel

在「設定」頁新增一張即時系統狀態卡，讓管理者一眼看出後端與同步是否正常。

## 面板顯示內容

1. **總管理者狀態** — 呼叫現有的檢查（`superadminExistsFn`）顯示「已建立 / 尚未建立」，失敗時顯示「檢查失敗」並可重試。
2. **資料庫連線** — 一次輕量的雲端讀取，顯示「正常 / 異常」與往返延遲（毫秒）。
3. **網路連線** — 沿用現有的 `useConnection`：離線 / 已連線 / 剛恢復。
4. **即時同步** — 沿用賽事狀態的 `syncStatus` 與 `lastSyncedAt`：已同步（含時間）/ 正在同步 / 同步失敗。
5. **最後檢查時間** 與「重新檢查」按鈕。

## 即時更新方式

- 進入設定頁時立即檢查一次。
- 之後每 20 秒自動重檢，且只在頁面可見時執行（省電、避免手機背景耗流量）。
- 網路恢復（reconnect 事件）時立即重檢。
- 同步狀態直接來自現有賽事狀態，變動即時反映，無需輪詢。

## 顯示對象

- 僅登入的管理者/總管理者可見；參賽者與觀眾不顯示。
- 檢查結果只回傳布林值與延遲數字，不含任何帳號資料。

## 技術細節

- 新增 `src/lib/system-status.functions.ts`：一個 `createServerFn`（GET），回傳
  `{ superadminExists: boolean, dbOk: boolean, latencyMs: number, serverTime: number }`。
  內部以 `await import("@/integrations/supabase/client.server")` 載入服務端用戶端，
  使用一般的 `select(...).limit(1)`（不用 count/head 查詢，避免先前遇到的邊緣執行環境問題）。
  失敗時回傳 `dbOk: false` 與錯誤代碼，不丟出例外，讓面板能顯示紅色狀態而非讓頁面崩潰。
- 新增 `src/components/SystemStatusCard.tsx`：狀態 UI，使用既有 `panel` 樣式與霓虹綠/紅語意色，
  以 `useTournament()` 取得 `role`、`spectator`、`syncStatus`、`lastSyncedAt`、`retrySync`，
  以 `useConnection` / `useOnReconnect` 取得網路狀態，並用 `document.visibilityState` 控制輪詢。
- 在 `src/components/SettingsTab.tsx` 掛載於 `AuditLogCard` 上方。
- 不改動現有同步邏輯、資料庫結構或權限規則。
