## 問題

手機拖曳／縮放賽程樹狀圖時出現文字重疊的殘影，放開手指後仍會留著。

## 成因（待實作時驗證）

賽程內容整塊套用 `transform` 移動，但每張比賽卡又設了 `content-visibility: auto`。在行動裝置瀏覽器上，這種「被跳過渲染的元素」在父層 transform 改變時容易保留舊的繪製圖磚，就出現同一段文字疊兩份的殘影。加上拖曳中只在 `will-change` 開關，內容層沒有穩定的合成層，重繪範圍不可預期。

## 修正方向（純前端顯示層）

1. `src/components/BracketTab.tsx`
   - 移除比賽卡上的 `content-visibility: auto` / `contain-intrinsic-size` 內嵌樣式，改用不影響繪製正確性的 `contain: layout paint` 之類的隔離，或直接拿掉，避免跳過繪製造成的舊圖磚。
   - 內容容器加上穩定的合成層提示（`translate3d` 已有，補 `backface-visibility: hidden`、`isolation`），並確保 viewport 有 `overflow: hidden` 的裁切層在自己的合成層上。
2. `src/components/bracket/use-pan-zoom.ts`
   - 將 `will-change: transform` 改為在整個手勢期間常駐、而非每次 pointerdown/up 反覆切換（頻繁切換會強制圖層重建，正是殘影常見來源）；手勢結束後延遲一小段時間再還原。
   - 手勢結束時做一次強制重繪（讀取一次 layout 或短暫切換 `opacity: 0.999`），把殘留圖磚清掉。

## 驗證

用 Playwright 在 390x844 viewport 模擬觸控拖曳，拖曳中與放開後各截一張圖，確認文字不重疊。若大型賽事效能因移除 `content-visibility` 下降，改以「只渲染可視範圍附近的輪次欄」的方式補回，而不是回頭用會造成殘影的屬性。

不改任何賽事邏輯、資料或後端。
