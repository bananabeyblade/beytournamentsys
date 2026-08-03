# 新增季軍賽（3rd/4th 決定戰）＋ 64 人賽程表預覽圖

## 目標

1. 四強（SEMI）產生後，兩位敗者自動配對打一場「季軍賽」，勝者為季軍、敗者為殿軍。
2. 產生一張 64 人賽程表的預覽圖（PNG），方便確認左右對稱樹狀圖與季軍賽的位置。

## 行為設計

- 只有當賽程有四強（主籤 ≥ 4 人）時才建立季軍賽；小型賽事（僅決賽）不建立。
- 季軍賽與決賽同一輪次，顯示於決賽區塊下方，標題為「季軍賽 3RD」。
- 兩場四強結束後，敗者自動填入季軍賽，狀態轉為 ready，可指派桌號並照常計分（同樣 4 分制、可查歷程）。
- 名次頁（前四名）改為：冠軍／亞軍取決賽結果，季軍／殿軍取季軍賽結果；季軍賽未完成時仍沿用目前「以四強得分排序」的暫定顯示。
- 強制結束賽事時，季軍賽與其他比賽一併標記結束（沿用現有邏輯，不需改動）。

## 技術實作

- `src/lib/tournament-types.ts`：`Match` 新增 `kind?: "main" | "third"`，以及敗者去向 `loserNextMatchId?: string | null`、`loserNextSlot?: 1 | 2 | null`。
- `src/lib/tournament-store.tsx`
  - `blankMatch` 補上新欄位預設值。
  - `buildBracket`：主籤 ≥ 4 時，於決賽同輪新增一張 `kind: "third"` 卡（index 在決賽之後），並把兩場四強的 `loserNextMatchId/loserNextSlot` 指向它。
  - `confirmWinner`：除了現有勝者晉級外，若該場有 `loserNextMatchId`，把敗者寫入對應 slot，雙方到齊即 `ready`（同樣 markLocal + touchMatch 以正確同步）。
  - `totalRounds` / `hasPrelim` 計算需排除 `kind === "third"`，避免季軍賽讓輪次判斷（八強／四強／決賽名稱）錯位。
  - `roundName` 不變；季軍賽標題由畫面依 `kind` 顯示。
- `src/lib/live-merge.ts`：合併時保留新欄位（沿用既有逐場欄位合併，補上 loser 去向與 kind）。
- `src/lib/standings.ts`：`computeTop4` 優先讀取 `kind === "third"` 且已完成的比賽決定 3/4 名，否則保留現行 fallback。
- `src/components/BracketTab.tsx`：決賽欄位改為可放兩張卡（決賽在中線、季軍賽在其下方並加小標籤「季軍賽 3RD」），左右連線邏輯不變。
- `src/components/LiveTab.tsx`：季軍賽卡片顯示「季軍賽」標籤（其餘流程與一般比賽相同）。
- `src/lib/tournament-export.ts`：匯出時季軍賽單獨列出，並在名次區標示季軍賽結果。

## 預覽圖產出

- 以 64 位測試選手在本機預覽產生賽程，將樹狀圖縮放至完整可見後截圖，輸出 `/mnt/documents/bracket-64-preview.png` 供下載檢視（含季軍賽卡片）。

## 不變動

- 計分規則、鎖定機制、報名/QR、權限與同步架構皆不調整。
