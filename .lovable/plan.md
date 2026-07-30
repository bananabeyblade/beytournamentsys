## 建議：值得做，且成本很低

已確認資料都在手邊（`src/lib/tournaments.ts`）：
- `results` 內有 `top4`（名次＋姓名）與 `playerCount`
- `live_state` 內有 `players`、`matches`（含 `events` 逐球紀錄）、`tableCount`
- `listTournaments()` 已一次撈回上述所有欄位

所以匯出可以純前端完成：不需新增資料表、不需伺服器函式、不需額外查詢。唯一限制是 `live_state` 若在賽事結束前未曾發布，該場只能輸出名次與基本資訊（會在檔案中註明）。

## 實作

### 1. 新增 `src/lib/tournament-export.ts`
- `buildTournamentReport(row: TournamentRow): string` — 由一筆 `TournamentRow` 產生純文字報表，UTF-8、以 `\n` 分段。
- `downloadText(filename, content)` — 以 `Blob` + `URL.createObjectURL` 觸發下載，用完 `revokeObjectURL`。
- 檔名格式：`{賽事名稱}_{YYYYMMDD}_{CODE}.txt`（去除檔名不合法字元）。

### 2. .txt 版面
```text
========================================
竹塹陀螺集會所 — 夏季賽
賽事代碼：ABC123
建立時間：2026/07/28 19:04
結束時間：2026/07/28 21:30
狀態：已結束　參賽人數：16　桌數：4
========================================

【最終名次】
  1. 玩家A
  2. 玩家B
  3. 玩家C
  4. 玩家D

【參賽名單】(依種子序)
  #1 玩家A   #2 玩家B   ...

【賽程紀錄】
■ 八強
  M1  桌1  已完成
      玩家A  4 - 2  玩家B      勝：玩家A
      逐球：玩家A 擊飛(+2) / 玩家B 迴轉(+1) / ...
  M2  ...
■ 四強
  ...

【統計】
  總場次 15　已完成 15
  結束勝法：迴轉 8　擊飛 12　爆裂 5　極限 3
----------------------------------------
匯出時間：2026/07/30 08:12
```
- 未發布 `live_state` 的舊賽事：略過名單／賽程／統計段落，改印「此賽事無詳細賽程紀錄」。

### 3. UI 進入點
- `src/components/TournamentHistory.tsx`：每列在「成績／進入賽事」旁加一顆下載圖示按鈕（`Download`，44px 觸控尺寸、`aria-label="匯出賽事紀錄"`），僅管理者可見（此元件本來就只在登入後渲染）。
- 匯出成功／失敗以 sonner toast 提示。

### 4. 技術細節
- 型別：`LiveState` 目前是 `players: unknown[]` / `matches: unknown[]`，在匯出模組內收斂為 `Player[]` / `Match[]`（來自 `@/lib/tournament-types`），只在此處做一次型別斷言，不改動 store 的資料流。
- 回合名稱沿用與 `roundName` 相同的規則（決賽／準決賽／…），在匯出模組內以純函式重現，避免依賴 React context。
- 不新增套件，不改資料庫與 RLS。
