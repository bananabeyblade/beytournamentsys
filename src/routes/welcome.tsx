import { createFileRoute, Link } from "@tanstack/react-router";
import {
  Swords,
  GitBranch,
  QrCode,
  Users,
  Image as ImageIcon,
  Moon,
  Trophy,
  Shield,
  ArrowRight,
} from "lucide-react";
import logoAsset from "@/assets/beyx-logo.png";

export const Route = createFileRoute("/welcome")({
  head: () => ({
    meta: [
      { title: "竹塹陀螺集會所 | Beyblade X 賽事系統" },
      {
        name: "description",
        content:
          "行動優先的 Beyblade X 賽事管理系統：即時對戰計分、隨機賽程樹狀圖、QR Code 報名與裁判權限控管，讓現場賽事管理更輕鬆。",
      },
      { property: "og:title", content: "竹塹陀螺集會所 | Beyblade X 賽事系統" },
      {
        property: "og:description",
        content: "即時對戰計分、隨機賽程樹狀圖、多桌裁判管理的 Beyblade X 賽事工具。",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: WelcomePage,
});

const FEATURES = [
  {
    icon: Swords,
    title: "即時對戰計分",
    desc: "迴轉、擊出、爆裂、極限四種得分方式，先達 4 分自動判定勝者並晉級。",
  },
  {
    icon: GitBranch,
    title: "隨機賽程樹",
    desc: "一鍵產生單淘汰賽程樹，支援非 2 的冪次人數，自動安排預賽。",
  },
  {
    icon: QrCode,
    title: "QR Code 報名",
    desc: "參賽者掃碼即可報名，裁判審核後直接加入選手名單，無需下載 App。",
  },
  {
    icon: Users,
    title: "多桌裁判管理",
    desc: "多位裁判同時登入、分桌計分，賽況即時同步給所有裝置與觀眾。",
  },
  {
    icon: ImageIcon,
    title: "賽事專屬 Logo",
    desc: "建立賽事時可自訂名稱與 Logo，report 頁與報名頁自動套用。",
  },
  {
    icon: Moon,
    title: "深色 / 淺色模式",
    desc: "配合現場燈光環境切換介面主題，長時間使用也不刺眼。",
  },
];

function WelcomePage() {
  return (
    <main className="min-h-screen">
      <header className="mx-auto flex max-w-4xl items-center justify-between px-4 py-6">
        <div className="flex items-center gap-2">
          <img src={logoAsset} alt="竹塹陀螺集會所標誌" className="h-9 w-9 object-contain" />
          <div>
            <p className="font-display text-sm neon-text">竹塹陀螺集會所</p>
            <p className="text-[10px] tracking-widest text-muted-foreground">
              TOURNAMENT SYSTEM
            </p>
          </div>
        </div>
        <Link
          to="/admin"
          className="flex h-10 items-center gap-1.5 rounded-xl border border-border bg-secondary px-3 text-xs font-bold text-muted-foreground"
        >
          <Shield className="h-3.5 w-3.5" /> 管理者登入
        </Link>
      </header>

      <section className="mx-auto max-w-4xl px-4 pt-10 pb-16 text-center">
        <p className="mb-3 inline-flex items-center gap-1.5 rounded-full border border-primary/40 bg-accent/30 px-3 py-1 text-[11px] tracking-widest text-primary">
          <Trophy className="h-3.5 w-3.5" /> BEYBLADE X · TOURNAMENT MANAGER
        </p>
        <h1 className="font-display text-4xl leading-tight neon-text sm:text-5xl">
          辦一場陀螺賽事
          <br />
          從報名到頒獎一次搞定
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-sm text-muted-foreground sm:text-base">
          行動優先的 Beyblade X 賽事管理系統——參賽者掃碼報名、裁判一鍵產生賽程並即時計分，
          比賽結果與前四名榜單自動生成，賽事現場不再手忙腳亂。
        </p>
        <div className="mt-8 flex flex-col items-center justify-center gap-3 sm:flex-row">
          <Link
            to="/"
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl bg-primary px-6 font-display text-primary-foreground sm:w-auto"
          >
            進入賽事系統 <ArrowRight className="h-4 w-4" />
          </Link>
          <Link
            to="/admin"
            className="flex min-h-14 w-full items-center justify-center gap-2 rounded-xl border border-primary/60 bg-accent/40 px-6 font-display text-primary sm:w-auto"
          >
            <Shield className="h-4 w-4" /> 我是管理者 / 裁判
          </Link>
        </div>
      </section>

      <section className="mx-auto max-w-4xl px-4 pb-20">
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((f) => (
            <div key={f.title} className="panel space-y-2 p-5">
              <f.icon className="h-6 w-6 text-primary" />
              <h2 className="font-display text-sm tracking-wide">{f.title}</h2>
              <p className="text-xs leading-relaxed text-muted-foreground">{f.desc}</p>
            </div>
          ))}
        </div>
      </section>

      <footer className="mx-auto max-w-4xl px-4 pb-10 text-center text-[11px] tracking-widest text-muted-foreground">
        竹塹陀螺集會所 · BEYBLADE X TOURNAMENT SYSTEM
      </footer>
    </main>
  );
}
