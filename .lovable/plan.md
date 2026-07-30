## 目標
讓 `src/components/BracketTab.tsx` 在大型賽事（32–128 人、上百場比賽）於手機上仍能順暢捲動、縮放與拖曳。

## 現況（已確認）
- 賽程樹以 `matches.filter(...)` 在每個 round 內重新過濾，每次 render 都對整份 `matches` 掃描一次（O(rounds × matches)）。
- 縮放只有 +/- 按鈕（0.6–1.6），以 `transform: scale()` 套在整個 flex 容器上，外層 `overflow-auto`；縮放後容器版面尺寸不變，放大時會裁切、縮小時留白。
- 沒有手勢支援：無雙指縮放、無拖曳平移、無雙擊縮放。
- 所有比賽卡片一律掛載，沒有虛擬化或渲染節流。

## 實作

### 1. 資料整理（渲染前計算）
- 用 `useMemo` 依 `matches` 一次建出 `roundGroups: { round, name, matches[] }[]`，取代每輪的 `filter`。
- 依賴陣列只放 `matches`，避免 `roundName` 造成重算。

### 2. 卡片元件化 + memo
- 抽出 `BracketMatchCard`（同檔案內），以 `React.memo` 包裝。
- props 只傳純值：`match`、`p1Name`、`p2Name`、`isMine`、`onOpen`。名稱在父層先算好，避免子層依賴整個 store。
- `onOpen` 用 `useCallback` 穩定參考，讓 memo 生效；計分更新時只有變動的那張卡重繪。

### 3. 手勢：縮放與拖曳
- 改為自訂 pan/zoom 容器：外層固定尺寸 + `overflow: hidden` + `touch-action: none`，內層用 `transform: translate3d(x,y,0) scale(k)`。
- 以 Pointer Events 實作：
  - 單指拖曳平移；
  - 雙指 pinch 縮放，以兩指中點為錨點（縮放後內容不跳動）；
  - 雙擊在 1× 與 1.8× 間切換，以點擊點為錨點；
  - 桌機保留滾輪 + Ctrl/⌘ 縮放。
- 縮放範圍 0.5–2.5，平移邊界夾制（clamp）避免內容被拖出畫面外。
- 位移/縮放狀態存在 ref，套用時直接改 DOM style，並用 `requestAnimationFrame` 合批 — 手勢過程中不觸發 React re-render。
- 保留現有 +/− 按鈕（改為呼叫同一組 zoom 動作），加一顆「重置檢視」按鈕。

### 4. 大型賽事的渲染量控制
- 對每張卡片加 `content-visibility: auto` 與 `contain-intrinsic-size`，讓瀏覽器跳過視窗外卡片的排版與繪製（不改 DOM 結構、不影響捲動邏輯，也不破壞縮放）。
- 移除縮放時的 `backdrop-filter` 成本：手勢進行中對容器加 `will-change: transform`，結束後移除。

### 5. 行為與可及性
- 維持現有樣式、`我的比賽` 高亮、已完成比賽點擊開啟 `MatchHistoryModal`。
- 拖曳超過門檻（約 8px）時不視為點擊，避免平移誤觸開啟 modal。
- +/− 與重置按鈕維持 44px 觸控尺寸與 `aria-label`。
- 底部提示文字更新為「可雙指縮放、拖曳移動，雙擊快速放大」。

## 技術細節
- 只改 `src/components/BracketTab.tsx`（必要時新增 `src/components/bracket/` 下的 pan-zoom hook 檔案），不動 store、型別或資料流。
- 不引入新套件，Pointer Events 原生實作。
- 驗證方式：以 64 場以上的賽程在行動視窗測試 pinch/拖曳流暢度，並確認計分更新時只重繪對應卡片。
