## 目標

1. 標題「竹塹陀螺集會所」前加入上傳的六角形陀螺標誌（去背處理）。
2. 參賽者在「對戰」頁能一眼看到自己的比賽（突顯 + 置頂）。
3. 「賽程」頁的比賽都能點擊查看該場得分紀錄。

## 變更內容

**標誌（去背）**
- 用去背工具把上傳圖片處理成透明 PNG，存為 `src/assets/beyx-logo.png`。
- `src/components/AppShell.tsx`：標題列改為 `[logo] 竹塹陀螺集會所` 的橫向排列，logo 約 32–36px、加上 `alt="竹塹陀螺集會所標誌"`，手機上不擠壓文字（`shrink-0` + 標題 `truncate`）。

**對戰頁突顯自己（`src/components/LiveTab.tsx`）**
- 使用既有的 `useJoinedName()` 與 `isSameName()` 判斷該場是否包含自己。
- 自己的比賽：卡片加上霓虹外框／`bg-primary/5`，標題列顯示「你的比賽 YOUR MATCH」標籤，自己的名字以 `text-primary font-bold` 標示並加「(你)」。
- 在「進行中」與「等待開賽」兩個清單中，把自己的比賽排到最前面。

**賽程可點看紀錄（`src/components/BracketTab.tsx`）**
- 目前只有已結束（`done`）的比賽可點；改為只要該場有得分紀錄或已開賽（`live`／`done`，或 `events.length > 0`）就可點開 `MatchHistoryModal`。
- 完全未開賽（無選手或 waiting）仍保持不可點，避免誤觸。
- 提示文字調整為「點擊查看比賽紀錄」。

## 技術備註

- 標誌透過 imagegen 的去背編輯產生透明 PNG，直接以 ES6 import 使用，不改動其他版面。
- 只動前端呈現層，計分／同步邏輯不變。
