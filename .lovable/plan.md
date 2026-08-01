# 清理未使用的程式碼與套件

掃描結果：整個 App 只用到 `src/components/ui/sonner.tsx` 一個 UI 元件，其餘 45 個 shadcn 範本元件與 40 個對應的 npm 套件從未被引用。這些會被打包進建置產物，讓伺服器與首次載入變重。

## 要刪除的內容

1. **未使用的 UI 元件（45 個檔案）**
   刪除 `src/components/ui/` 底下除 `sonner.tsx` 以外全部檔案（accordion、alert-dialog、calendar、carousel、chart、command、dialog、sidebar、table、tabs…）。

2. **未使用的相依套件（40 個）**
   所有未被引用的 `@radix-ui/*`（accordion、alert-dialog、avatar、dialog、select、tooltip…）、`recharts`、`embla-carousel-react`、`react-day-picker`、`date-fns`、`react-hook-form`、`@hookform/resolvers`、`cmdk`、`vaul`、`input-otp`、`react-resizable-panels`、`class-variance-authority`。
   保留 `clsx`、`tailwind-merge`（`src/lib/utils.ts` 的 `cn` 使用）、`@radix-ui/react-slot`、`next-themes`／`sonner`（Toaster 需要）等 sonner 實際依賴的項目，安裝前逐一確認。

3. **未使用的小檔案與匯出**
   - `src/hooks/use-mobile.tsx`（無人引用）。
   - `src/lib/live-merge.ts` 的 `isNewer`、`src/lib/joined-name.ts` 的 `readJoinedName`、`use-pan-zoom.ts` 的 `MIN_SCALE`／`MAX_SCALE` 等未使用匯出。

## 不會動的部分

- `src/router.tsx`、`src/server.ts`、`src/start.ts`、`src/lib/error-capture.ts`、`src/lib/error-page.ts`、`src/integrations/supabase/*`：框架進入點與自動產生檔案，看似未引用但實際必要。
- 賽事邏輯（同步、計分、鎖、報名）完全不動，功能與畫面不變。

## 技術細節

- 依序：刪檔 → `bun remove` 未使用套件 → typecheck 與 build 驗證 → 開啟預覽確認首頁、報名、賽程、設定四個畫面無誤。
- 若移除某套件導致建置失敗，立刻裝回並在計畫外記錄。
- 預期效果：Worker bundle 與 client bundle 明顯縮小、冷啟動與首次載入變快；資料庫同步負載不受此變更影響（那部分屬另一項優化）。
