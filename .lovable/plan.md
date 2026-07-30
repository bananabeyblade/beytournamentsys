## 問題 A：多裁判同時計分會互相覆蓋

### 現況（已確認）
- 每台管理者裝置在 `src/lib/tournament-store.tsx` 會把「整份賽況」（players + matches + tableCount）序列化後寫進 `tournaments.live_state`（`publishLiveState`），採**整包覆蓋**。
- 收到別人推送時（Realtime / 輪詢）也是**整包取代**本機 `players` / `matches`。
- 結果：裁判 A 在第 3 桌加分、裁判 B 同時在第 5 桌加分，後寫入的那一包會把前一包的分數整個蓋掉；分數會「跳回去」。

### 修正方向：逐場合併（per-match merge），而非整份覆蓋

1. **為每場比賽加上版本戳記**
   - `Match` 新增 `rev`（遞增數字）與 `updatedAt`（毫秒時間）。
   - 所有會改動單場比賽的動作（開始比賽、加分、復原、確認勝利、晉級寫入下一場）都把該場的 `rev + 1`、`updatedAt = Date.now()`。其他場不動。

2. **寫入時在資料庫端合併，而不是覆蓋**
   - 新增資料庫函式 `publish_live_state(tournament_id, incoming_state, stamp)`：
     - 讀出目前 `live_state`，以 `match.id` 為鍵逐場比較，保留 `rev`（相同則比 `updatedAt`）較新的那一場。
     - `players` 以 id 聯集合併（避免同時新增選手互蓋）；`tableCount` 取新值。
     - 只有在合併後內容確實改變時才更新 `live_updated_at`。
     - 權限維持現有規則（僅管理者可寫），並授予必要執行權限。
   - `src/lib/tournaments.ts` 的 `publishLiveState` 改為呼叫此函式。

3. **收到遠端資料時本機也合併**
   - `tournament-store.tsx` 的 `apply()` 不再直接 `setMatches(incoming.matches)`，改為逐場取 `rev` 較新者；本機剛按下、尚未推送成功的那場（本機 rev 較高）就會被保留。
   - 既有的 stamp / payload 防回音機制保留，避免同步迴圈。

4. **降低碰撞機率的介面調整**
   - 一場比賽正在被別的裝置計分時（該場 `updatedAt` 在數秒內、且非本機操作），在 LIVE 卡片上顯示「其他裁判計分中」提示，避免兩人同時開同一場。
   - 計分推送改為「立即送出該次變更」（縮短 debounce 尾巴），縮小覆蓋視窗。

5. **相容舊資料**
   - 舊的 `live_state` 沒有 `rev` 欄位時，視為 `rev = 0`，合併規則仍成立，不需要資料遷移。

### 技術細節
- 修改檔案：`src/lib/tournament-types.ts`（Match 加 `rev`/`updatedAt`）、`src/lib/tournament-store.tsx`（更新動作標記版本、apply 改合併）、`src/lib/tournaments.ts`（改呼叫 RPC）、`src/components/LiveTab.tsx`（他人計分中提示）。
- 資料庫：新增一個 `SECURITY DEFINER` 的合併函式並限制只有已登入管理者可執行；`tournaments` 資料表結構不變。
- 驗證：以兩個瀏覽器工作階段模擬兩位裁判，同時對不同場次連續加分，確認雙方分數皆保留、且畫面在數秒內一致。
