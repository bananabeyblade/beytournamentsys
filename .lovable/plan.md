## 檢查方式

已跑過型別檢查（通過，0 錯誤）、ESLint（307 個錯誤／10 個警告，多為格式），並逐一閱讀 `tournament-store.tsx`、`BracketTab.tsx`、`standings.ts`、`LiveTab.tsx`、`ScoringModal.tsx`。

## 找到的問題（依嚴重度）

**A. 多裁判同時計分會互相覆蓋（高）**
每台裝置把「整包 players + matches + tableCount」寫進 `live_state`，採 last-write-wins。兩位裁判同時在不同桌計分時，後寫入者會把前一位的分數蓋掉（本機看得到、雲端消失）。

**B. 賽事結束後仍可繼續計分（高）**
`forceFinishTournament` 或決賽完成後，`LiveTab` / `ScoringModal` 沒有依 `currentTournament.status === "finished"` 停用「開始比賽 / 加分 / 確認勝利」，仍可改動已封存的賽事並持續發佈 `live_state`。

**C. 清空賽事不會同步（中）**
發佈 effect 的守門條件 `if (!matches.length && !players.length) return;`，導致 `resetTournament()` 後其他管理者與觀眾仍停留在舊名單／舊賽程。

**D. 自動封存前四名由每台管理者裝置各寫一次（中）**
`finishTournament` 的 effect 沒有裝置端去重，決賽結束瞬間所有在線管理者同時 PATCH 同一列；一般管理者若無權限則靜默失敗（`.catch(() => undefined)`），使用者看不到任何錯誤。

**E. 強制結束會產生「無勝者／不實名次」（中）**
比分平手時 `winner` 被設為 `null`；未打的半準決賽也被標成 `done`，`computeTop4` 會據此算出從未比過的三、四名。

**F. 賽程樹細節（低）**
- `Connectors` 內 `ends.map(y => <span key={y}>)`：上下來源 y 相同（單一子節點對齊）時會出現重複 key。
- 只有一輪（2 人賽）時走 fallback 單欄，決賽不置中，與鏡像版面外觀不一致。
- `halfPositions` 對奇數張卡的半邊會產生 `prev[j] ?? height/2` 的兜底值，連接線可能落在非卡片中心。

**G. 程式碼品質（低）**
307 個 Prettier 錯誤、`tournament-store.tsx` 兩處 `react-hooks/exhaustive-deps` 警告（`spectator`、`tableCount` 未列入依賴，屬於刻意但未標註）。

## 建議修正範圍

建議先做 B、C、D、E、F、G（範圍明確、風險低）；A 屬架構調整，建議獨立一次處理。

1. **鎖定已結束賽事**：在 store 匯出 `locked = currentTournament?.status === "finished"`，`LiveTab` 隱藏／停用開始比賽按鈕，`ScoringModal` 停用加分與確認勝利並顯示「賽事已結束」，發佈 effect 在 `locked` 時不再寫入。
2. **清空同步**：改為 `if (!currentTournament) return;`，並讓 `resetTournament` 也送出一次空的 `live_state`。
3. **封存去重**：加一個 `archivedId` ref，同一 tournament id 只呼叫一次 `finishTournament`；失敗時用 toast 提示，而非靜默吞掉。
4. **強制結束語意修正**：未開打的比賽標為 `done` 但 `winner` 留 `null`；平手時以先取得分數者或直接不指定勝者；`computeTop4` 只採 `status === "done" 且 winner 非空` 的半準決賽，避免虛構名次。
5. **賽程樹修補**：連接線 key 改用索引；單輪賽事也走置中版面；`halfPositions` 對奇數半邊改為沿用唯一子節點的 y。
6. **整理格式**：執行 `eslint --fix`（純格式），並為兩處刻意省略的依賴補上 eslint 註解說明。

## 技術備註（A 的後續方案）

若要根治覆蓋問題，建議把 `live_state` 的整包快照改成「以 match 為單位」的更新：新增 `match_events` 表（tournament_id, match_id, slot, type, points, created_at）由裁判 append，`live_state` 只作為快取重建結果；或退而求其次，在 `publishLiveState` 前先讀取雲端版本、依 match 逐一合併（以每場 `events.length` 較大者為準）再寫回。這部分需要一次資料模型調整，建議確認後另行實作。
