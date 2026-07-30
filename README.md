# Beyblade X Arena

Build a modern, mobile-first Web Application for running Beyblade X tournaments.

### 1. Overall Style & Theme

- Dark Mode / Cyberpunk Sci-Fi aesthetic (deep grey/black background, neon green and red accents).

- High contrast, high readability, highly responsive layout tailored for mobile phones.

- Large touch targets and buttons so referees can easily score with one hand on mobile screens.

### 2. User Roles & Permission System

Provide a persistent header or drawer toggle to switch between roles for demo/testing:

- Admin (裁判/管理者): Can create tournaments, add/remove players, generate brackets, and input scores.

- Player (參賽者/觀眾): View-only mode. Can check current active matches, match table assignments, and live bracket standings.

### 3. Key Navigation Tabs (Bottom Navigation for Mobile)

1. Live Matches (對戰進行中)

   - Displays active table matches (e.g., Table 1: Player A vs Player B).

   - Show live total score for each match.

   - For Admin: Clicking a match opens the "Beyblade X Referee Scoring Modal".

2. Bracket (賽程樹狀圖)

   - Visual responsive single-elimination tournament bracket tree (樹狀圖).

   - Highlighting winners advancing to the next round.

   - Zoom/pan friendly for mobile screens.

3. Players (選手名單)

   - Admin can add players individually or bulk add via text box (one name per line, supports unlimited players).

   - Shows list of registered players with seed numbers.

4. Settings / Role Switch (角色切換與設定)

   - Toggle role: Admin vs Player.

   - Button to reset tournament or fill dummy sample data (16 players).

### 4. Beyblade X Specific Scoring Logic (CRITICAL)

In the Referee Scoring Modal (Admin Only):

- Match target: First player to reach 4 points wins.

- Quick Scoring Action Buttons:

  - +1 Spin Finish (旋轉結束) - Blue button

  - +2 Over Finish (擊出賽場) - Green button

  - +2 Burst Finish (爆裂結束) - Orange button

  - +3 Xtreme Finish (極限擊出) - Red highlight button

  - Undo (復原上一步) button to fix accidental taps.

- Point Counter Display: Show running total for Player 1 and Player 2 (e.g., "3 - 2").

- Auto Winner Resolution:

  - As soon as a player reaches >= 4 points, prompt a confirmation modal: "[Player Name] Wins!"

  - Upon confirmation, automatically mark the match as finished and advance the winner into the next bracket slot in the tournament tree.

### 5. Technical Stack Requirements

- React + Tailwind CSS.

- Lucide-react icons.

- Responsive layout using Tailwind container / flexbox.

- Fully interactive in-memory state (useState / Context) so everything works out-of-the-box in preview mode.





備注：

1.

極限勝利 (Xtreme Finish)：得 3分。將對手擊飛至戰鬥盤中央的極限區孔洞。

擊飛勝利 (Over Finish)：得 2分。將對手擊飛至四周角落的出場口袋區。

爆裂勝利 (Burst Finish)：得 2分。對手的陀螺在碰撞中解體爆開。

迴轉勝利 (Spin Finish)：得 1分。對手陀螺先停止旋轉。



2. 參賽者賽程亂數產生



3. 限制隨機賽程按鈕僅在管理者模式顯示，參賽者模式改為唯讀。



4. 要有即時賽況在賽程表介面，如：比賽中、得分情況…



5. 賽事生成介面要有桌數數量設定，不同桌號的管理者可以點選尚未完成的比賽



6. 不同桌的管理者點選比賽開始才會顯示比賽中



7.管理者需要帳號密碼登入，可自行設定帳號密碼，設置一個總管理者，只能由總管理者新增減少管理者

This project was built with [Lovable](https://lovable.dev).

**Live app**: https://beytournamentsys.lovable.app

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/e59c5196-d627-4686-9879-4734e26f6436).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
