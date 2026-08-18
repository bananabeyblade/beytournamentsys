import { useEffect, useRef, useState } from "react";
import {
  ArrowDown,
  CheckCircle2,
  ClipboardCheck,
  GitBranch,
  QrCode,
  ShieldCheck,
  Shuffle,
  Sparkles,
  Swords,
  Trophy,
  UserCheck,
  Users,
} from "lucide-react";
import logoAsset from "@/assets/beyx-logo.png";
import {
  TournamentCreationForm,
  type CreationFocusTarget,
} from "@/components/TournamentCreationForm";
import {
  PendingRegistrationsPanel,
  RegistrationPanel,
  ScoringPanel,
  TournamentResultsPanel,
  TournamentSetupPanel,
  type BracketFocusTarget,
  type RegistrationFocusTarget,
  type ScoringFinishTarget,
} from "@/components/WorkflowPanels";

type LandingPageProps = {
  onAdminLogin: () => void;
};

function useViewportPlayback<T extends HTMLElement>() {
  const elementRef = useRef<T | null>(null);
  const [isInViewport, setIsInViewport] = useState(false);

  useEffect(() => {
    const element = elementRef.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        setIsInViewport(entry.isIntersecting && entry.intersectionRatio >= 0.2);
      },
      { threshold: [0, 0.2, 0.5] },
    );

    observer.observe(element);
    return () => observer.disconnect();
  }, []);

  return { elementRef, isInViewport };
}

const STEPS = [
  {
    number: "01",
    eyebrow: "CREATE QR CODE",
    title: "輸入新賽事名稱",
    body: "在「賽事＆報名 QR CODE 生成」區塊先填入賽事名稱。這個名稱會出現在參賽者掃描後的報名頁面。",
    icon: ClipboardCheck,
    screenshotFocus: "name",
  },
  {
    number: "02",
    eyebrow: "CREATE QR CODE",
    title: "上傳賽事 Logo（選填）",
    body: "可替這一場賽事上傳專屬 Logo；不需要上傳也能直接繼續建立，系統會使用預設標誌。",
    icon: Sparkles,
    screenshotFocus: "logo",
  },
  {
    number: "03",
    eyebrow: "CREATE QR CODE",
    title: "建立新賽事與 QR Code",
    body: "確認名稱後按下建立。系統會建立賽事，並產生可展示、列印或分享的專屬報名 QR Code。",
    icon: QrCode,
    screenshotFocus: "create",
  },
  {
    number: "04",
    eyebrow: "PLAYER REGISTRATION",
    title: "參賽者掃碼，輸入名稱報名",
    body: "選手不用下載 App。掃描 QR Code、輸入名稱後送出報名，並取得八碼驗證碼，可在斷線後找回自己的身分。",
    icon: Users,
    screenshotFocus: null,
  },
  {
    number: "07",
    eyebrow: "ADMIN APPROVAL",
    title: "管理者逐筆或全部核准",
    body: "待審核名單會集中在選手頁。確認名稱與參賽資格後核准加入正式名單，也能拒絕重複或錯誤報名。",
    icon: UserCheck,
    screenshotFocus: null,
  },
  {
    number: "08",
    eyebrow: "RANDOM BRACKET",
    title: "名單確認後，產生隨機賽程",
    body: "人數足夠時由管理者產生賽程，系統依桌數分配對戰。產生後選手名單會鎖定，避免比賽中途異動。",
    icon: GitBranch,
    screenshotFocus: null,
  },
  {
    number: "10",
    eyebrow: "LIVE SCORING",
    title: "多位裁判，同步掌握賽況",
    body: "裁判依桌次即時計分；迴轉、擊飛、爆裂與極限勝利自動累積，賽程立即推進。",
    icon: Swords,
    screenshotFocus: null,
  },
  {
    number: "11",
    eyebrow: "RESULTS",
    title: "從賽程到頒獎，自動完成",
    body: "賽程樹、歷史比分與前四名榜單會自動生成，現場與觀眾能同步追蹤每一輪。",
    icon: Trophy,
    screenshotFocus: null,
  },
] as const;

const REGISTRATION_STEPS = [
  {
    number: "04",
    eyebrow: "PLAYER REGISTRATION",
    title: "輸入參賽名稱",
    body: "掃描賽事 QR Code 後，輸入將顯示在賽程與對戰紀錄中的名稱。",
    icon: Users,
    focus: "name" as RegistrationFocusTarget,
  },
  {
    number: "05",
    eyebrow: "PLAYER REGISTRATION",
    title: "送出報名",
    body: "確認名稱後送出。系統會檢查同一賽事中是否有重複的名稱。",
    icon: UserCheck,
    focus: "submit" as RegistrationFocusTarget,
  },
  {
    number: "06",
    eyebrow: "PLAYER REGISTRATION",
    title: "保存參賽者驗證碼",
    body: "報名送出後，請立即截圖保存八碼驗證碼；更換手機或重新連線時可用它找回身分。",
    icon: CheckCircle2,
    focus: null as RegistrationFocusTarget,
    completed: true,
  },
] as const;

const BRACKET_STEPS = [
  {
    number: "08",
    eyebrow: "RANDOM BRACKET",
    title: "設定比賽桌數",
    body: "以加號與減號調整同時進行的對戰桌數，系統會依桌數安排每輪可進行的比賽。",
    icon: GitBranch,
    focus: "tables" as BracketFocusTarget,
  },
  {
    number: "09",
    eyebrow: "RANDOM BRACKET",
    title: "隨機產生賽程",
    body: "確認名單和桌數後，按下按鈕產生隨機賽程；產生後選手名單會鎖定以確保賽事公平。",
    icon: Shuffle,
    focus: "generate" as BracketFocusTarget,
    generated: true,
  },
] as const;

function EmbeddedQrCreation({ focus }: { focus: CreationFocusTarget }) {
  const [name, setName] = useState("");
  const [logoPreview, setLogoPreview] = useState("");
  const [message, setMessage] = useState("");

  const pickLogo = (file: File | null) => {
    setLogoPreview((previous) => {
      if (previous) URL.revokeObjectURL(previous);
      return file ? URL.createObjectURL(file) : "";
    });
  };

  return (
    <div className="landing-embedded-screen mx-auto w-full max-w-[38rem]">
      <div className="flex items-center justify-between border-b border-border bg-background/95 px-3 py-2">
        <div className="flex items-center gap-2">
          <img src={logoAsset} alt="竹塹陀螺集會所標誌" className="h-7 w-7 object-contain" />
          <div>
            <p className="font-display text-xs text-primary">竹塹陀螺集會所</p>
            <p className="text-[8px] tracking-widest text-muted-foreground">TOURNAMENT SYSTEM</p>
          </div>
        </div>
        <span className="rounded-full border border-primary/40 bg-accent/30 px-2 py-1 text-[9px] text-primary">
          互動示範
        </span>
      </div>
      <div className="bg-background p-3">
        <div className="panel space-y-3 p-3">
          <h3 className="flex items-center gap-2 text-sm tracking-widest text-muted-foreground">
            <QrCode className="h-4 w-4" /> 賽事＆報名 QR CODE 生成
          </h3>
          <p className="text-xs text-muted-foreground">
            建立一場新賽事後即可產生專屬報名 QR Code。
          </p>
          <TournamentCreationForm
            name={name}
            onNameChange={(value) => {
              setName(value);
              setMessage("");
            }}
            logoPreview={logoPreview}
            onLogoChange={pickLogo}
            onCreate={() => setMessage("示範完成：正式操作時會建立賽事並產生 QR Code。")}
            focusTarget={focus}
          />
          {message && <p className="text-xs text-primary">{message}</p>}
        </div>
        <p className="mt-2 text-center text-[10px] text-muted-foreground">
          可直接操作的唯讀示範，不會寫入正式賽事資料
        </p>
      </div>
    </div>
  );
}

function QrCreationStory() {
  const [activeIndex, setActiveIndex] = useState(0);
  const stepRefs = useRef<Array<HTMLElement | null>>([]);
  const qrSteps = STEPS.slice(0, 3);
  const activeStep = qrSteps[activeIndex];

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const index = visible?.target.getAttribute("data-story-step");
        if (index) setActiveIndex(Number(index));
      },
      { rootMargin: "-35% 0px -35% 0px", threshold: [0.2, 0.5, 0.8] },
    );

    stepRefs.current.forEach((element) => {
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <section className="landing-story px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="landing-story-visual">
          <EmbeddedQrCreation focus={activeStep.screenshotFocus as CreationFocusTarget} />
        </div>
        <div className="space-y-10 pb-[45svh] md:pb-[70svh]">
          {qrSteps.map((step, index) => {
            const Icon = step.icon;
            const isActive = activeIndex === index;
            return (
              <article
                key={step.number}
                ref={(element) => {
                  stepRefs.current[index] = element;
                }}
                data-story-step={index}
                className={`landing-story-step ${isActive ? "landing-story-step-active" : ""}`}
              >
                <p className="font-display text-sm tracking-[0.18em] text-primary">
                  步驟{Number(step.number)} · {step.eyebrow}
                </p>
                <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
                  {step.title}
                </h2>
                <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
                <div className="mt-6 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-primary/45 bg-accent/25">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function EmbeddedRegistration({
  focus,
  completed,
}: {
  focus: RegistrationFocusTarget;
  completed: boolean;
}) {
  const [name, setName] = useState("陀螺玩家 A");
  const [submitted, setSubmitted] = useState(false);
  const showComplete = completed || submitted;

  return (
    <div className="landing-embedded-screen mx-auto w-full max-w-[30rem]">
      <div className="flex items-center justify-between border-b border-border bg-background/95 px-3 py-2">
        <div className="flex items-center gap-2">
          <img src={logoAsset} alt="竹野陀螺集會所" className="h-7 w-7 object-contain" />
          <div>
            <p className="font-display text-xs text-primary">竹野陀螺集會所</p>
            <p className="text-[8px] tracking-widest text-muted-foreground">TOURNAMENT SYSTEM</p>
          </div>
        </div>
        <span className="rounded-full border border-primary/40 bg-accent/30 px-2 py-1 text-[9px] text-primary">
          即時同步
        </span>
      </div>
      <div className="landing-registration-visual bg-background p-3">
        <RegistrationPanel
          key={showComplete ? "complete" : "form"}
          name={name}
          onNameChange={setName}
          submitted={showComplete}
          recoveryCode="52741938"
          onSubmit={() => setSubmitted(true)}
          focusTarget={showComplete ? null : focus}
        />
      </div>
    </div>
  );
}

function RegistrationStory() {
  const [activeIndex, setActiveIndex] = useState(0);
  const stepRefs = useRef<Array<HTMLElement | null>>([]);
  const activeStep = REGISTRATION_STEPS[activeIndex];

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const index = visible?.target.getAttribute("data-registration-step");
        if (index) setActiveIndex(Number(index));
      },
      { rootMargin: "-35% 0px -35% 0px", threshold: [0.2, 0.5, 0.8] },
    );

    stepRefs.current.forEach((element) => {
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <section className="landing-story px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="landing-story-visual">
          <EmbeddedRegistration
            focus={activeStep.focus}
            completed={"completed" in activeStep && activeStep.completed === true}
          />
        </div>
        <div className="space-y-10 pb-[45svh] md:pb-[70svh]">
          {REGISTRATION_STEPS.map((step, index) => {
            const Icon = step.icon;
            const isActive = activeIndex === index;
            return (
              <article
                key={step.number}
                ref={(element) => {
                  stepRefs.current[index] = element;
                }}
                data-registration-step={index}
                className={`landing-story-step ${isActive ? "landing-story-step-active" : ""}`}
              >
                <p className="font-display text-sm tracking-[0.18em] text-primary">
                  步驟{Number(step.number)} · {step.eyebrow}
                </p>
                <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
                  {step.title}
                </h2>
                <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
                <div className="mt-6 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-primary/45 bg-accent/25">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

function EmbeddedBracket({ focus, generated }: { focus: BracketFocusTarget; generated: boolean }) {
  const { elementRef, isInViewport } = useViewportPlayback<HTMLDivElement>();
  const [tableCount, setTableCount] = useState(1);
  const [activeTableControl, setActiveTableControl] = useState<"increase" | "decrease" | null>(
    null,
  );
  const [activeGenerate, setActiveGenerate] = useState(false);
  const [manuallyGenerated, setManuallyGenerated] = useState(false);

  useEffect(() => {
    if (focus !== "tables" || !isInViewport) {
      setActiveTableControl(null);
      return;
    }

    const sequence: Array<{ control: "increase" | "decrease"; value: number }> = [
      { control: "increase", value: 2 },
      { control: "decrease", value: 1 },
      { control: "increase", value: 2 },
      { control: "decrease", value: 1 },
    ];
    let index = 0;
    const play = () => {
      const next = sequence[index];
      setActiveTableControl(next.control);
      setTableCount(next.value);
      index = (index + 1) % sequence.length;
    };

    play();
    const interval = window.setInterval(play, 1150);
    return () => window.clearInterval(interval);
  }, [focus, isInViewport]);

  useEffect(() => {
    if (!generated) {
      setActiveGenerate(false);
      return;
    }

    setActiveGenerate(true);
    const timer = window.setTimeout(() => setActiveGenerate(false), 450);
    return () => window.clearTimeout(timer);
  }, [generated]);

  return (
    <div
      ref={elementRef}
      className="landing-embedded-screen mx-auto w-full max-w-[30rem] bg-background p-3"
    >
      <TournamentSetupPanel
        tableCount={tableCount}
        onTableCountChange={setTableCount}
        onGenerate={() => {
          setActiveGenerate(true);
          setManuallyGenerated(true);
          window.setTimeout(() => setActiveGenerate(false), 450);
        }}
        focusTarget={focus}
        activeTableControl={activeTableControl}
        activeGenerate={activeGenerate}
        generated={generated || manuallyGenerated}
      />
    </div>
  );
}

function BracketStory() {
  const [activeIndex, setActiveIndex] = useState(0);
  const stepRefs = useRef<Array<HTMLElement | null>>([]);
  const activeStep = BRACKET_STEPS[activeIndex];

  useEffect(() => {
    const observer = new IntersectionObserver(
      (entries) => {
        const visible = entries
          .filter((entry) => entry.isIntersecting)
          .sort((a, b) => b.intersectionRatio - a.intersectionRatio)[0];
        const index = visible?.target.getAttribute("data-bracket-step");
        if (index) setActiveIndex(Number(index));
      },
      { rootMargin: "-35% 0px -35% 0px", threshold: [0.2, 0.5, 0.8] },
    );

    stepRefs.current.forEach((element) => {
      if (element) observer.observe(element);
    });
    return () => observer.disconnect();
  }, []);

  return (
    <section className="landing-story px-5 py-10 sm:px-8">
      <div className="mx-auto max-w-3xl space-y-8">
        <div className="landing-story-visual">
          <EmbeddedBracket
            focus={activeStep.focus}
            generated={"generated" in activeStep && activeStep.generated === true}
          />
        </div>
        <div className="space-y-10 pb-[45svh] md:pb-[70svh]">
          {BRACKET_STEPS.map((step, index) => {
            const Icon = step.icon;
            const isActive = activeIndex === index;
            return (
              <article
                key={step.number}
                ref={(element) => {
                  stepRefs.current[index] = element;
                }}
                data-bracket-step={index}
                className={`landing-story-step ${isActive ? "landing-story-step-active" : ""}`}
              >
                <p className="font-display text-sm tracking-[0.18em] text-primary">
                  步驟{Number(step.number)} · {step.eyebrow}
                </p>
                <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
                  {step.title}
                </h2>
                <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
                  {step.body}
                </p>
                <div className="mt-6 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-primary/45 bg-accent/25">
                  <Icon className="h-5 w-5 text-primary" />
                </div>
              </article>
            );
          })}
        </div>
      </div>
    </section>
  );
}

const SCORING_SEQUENCE: Array<{
  score1: number;
  score2: number;
  slot: 1 | 2;
  finish: ScoringFinishTarget;
  winner: "B" | null;
}> = [
  { score1: 0, score2: 0, slot: 1, finish: null, winner: null },
  { score1: 2, score2: 0, slot: 1, finish: "burst", winner: null },
  { score1: 2, score2: 1, slot: 2, finish: "spin", winner: null },
  { score1: 3, score2: 1, slot: 1, finish: "spin", winner: null },
  { score1: 3, score2: 4, slot: 2, finish: "xtreme", winner: null },
  { score1: 3, score2: 4, slot: 2, finish: null, winner: "B" },
];

function ScoringStory() {
  const { elementRef, isInViewport } = useViewportPlayback<HTMLElement>();
  const [phase, setPhase] = useState(0);
  const current = SCORING_SEQUENCE[phase];

  useEffect(() => {
    if (!isInViewport) return;

    const delay = phase === 0 ? 850 : phase === SCORING_SEQUENCE.length - 1 ? 2600 : 1250;
    const timer = window.setTimeout(
      () => setPhase((previous) => (previous + 1) % SCORING_SEQUENCE.length),
      delay,
    );
    return () => window.clearTimeout(timer);
  }, [phase, isInViewport]);

  return (
    <section ref={elementRef} className="landing-panel px-5 py-10 sm:px-8">
      <div className="mx-auto w-full max-w-3xl">
        <div className="landing-scoring-transition mx-auto w-full max-w-sm">
          <ScoringPanel
            score1={current.score1}
            score2={current.score2}
            activeSlot={current.slot}
            activeFinish={current.finish}
            winner={current.winner}
          />
        </div>
        <div className="mt-8">
          <p className="font-display text-sm tracking-[0.2em] text-primary">步驟10 · LIVE SCORING</p>
          <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
            多位裁判，同步掌握賽況
          </h2>
          <p className="mt-4 max-w-2xl text-base leading-relaxed text-muted-foreground">
            示範依序記錄：選手 A 爆裂勝利得 2 分、選手 B 迴轉勝利得 1 分、選手 A 再得 1 分，最後選手
            B 以極限勝利取得 3 分。達到 4 分後會顯示實際的勝者確認畫面。
          </p>
          <div className="mt-6 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-primary/45 bg-accent/25">
            <Swords className="h-5 w-5 text-primary" />
          </div>
        </div>
      </div>
    </section>
  );
}

function ProductPreview({ step }: { step: (typeof STEPS)[number] }) {
  if (step.screenshotFocus) return <EmbeddedQrCreation focus={step.screenshotFocus} />;
  const sharedScreen =
    step.number === "04" ? (
      <RegistrationDemo />
    ) : step.number === "07" ? (
      <PendingRegistrationsPanel names={["陀螺玩家 A", "陀螺玩家 B", "陀螺玩家 C"]} />
    ) : step.number === "08" ? (
      <TournamentSetupPanel tableCount={3} />
    ) : step.number === "10" ? (
      <ScoringPanel />
    ) : (
      <TournamentResultsPanel names={["選手 A", "選手 B", "選手 C", "選手 D"]} />
    );

  return (
    <div className="relative mx-auto w-full max-w-sm rounded-[1.75rem] border border-primary/45 bg-background/90 p-2 shadow-2xl shadow-primary/10">
      <div className="landing-embedded-screen min-h-72 rounded-[1.35rem] bg-background p-2">
        {sharedScreen}
      </div>
    </div>
  );
}

function RegistrationDemo() {
  const [name, setName] = useState("陀螺玩家 A");
  const [submitted, setSubmitted] = useState(false);
  return (
    <RegistrationPanel
      name={name}
      onNameChange={setName}
      submitted={submitted}
      recoveryCode="52741938"
      onSubmit={() => setSubmitted(true)}
    />
  );
}

/* Previous static preview retained temporarily for comparison while this local prototype is reviewed. */
function LegacyProductPreview({ step }: { step: (typeof STEPS)[number] }) {
  const Icon = step.icon;
  return (
    <div className="relative mx-auto w-full max-w-sm rounded-[1.75rem] border border-primary/45 bg-background/90 p-2 shadow-2xl shadow-primary/10">
      <div className="overflow-hidden rounded-[1.35rem] border border-border bg-card">
        <div className="flex items-center justify-between border-b border-border px-4 py-3">
          <div className="flex items-center gap-2">
            <img src={logoAsset} alt="竹塹陀螺集會所標誌" className="h-7 w-7 object-contain" />
            <div>
              <p className="font-display text-xs text-primary">竹塹陀螺集會所</p>
              <p className="text-[9px] tracking-widest text-muted-foreground">TOURNAMENT SYSTEM</p>
            </div>
          </div>
          <span className="rounded-md border border-primary/40 px-2 py-1 text-[9px] text-primary">
            即時同步
          </span>
        </div>

        <div className="min-h-72 space-y-3 p-4">
          {step.number === "04" && (
            <>
              <p className="font-display text-xs tracking-widest text-muted-foreground">選手報名</p>
              <div className="rounded-xl border border-primary/45 bg-accent/20 p-4">
                <p className="text-xs text-muted-foreground">參賽名稱</p>
                <p className="mt-1 font-display text-sm text-primary">陀螺玩家 A</p>
              </div>
              <div className="rounded-xl border border-primary/45 bg-accent/20 p-3">
                <p className="text-xs text-primary">報名成功，請截圖保存驗證碼</p>
                <p className="mt-1 font-display text-xl tracking-[0.22em]">5274 1938</p>
              </div>
              <div className="rounded-xl bg-primary px-3 py-3 text-center text-xs font-bold text-primary-foreground">
                送出報名
              </div>
            </>
          )}
          {step.number === "07" && (
            <>
              <div className="flex items-center justify-between">
                <p className="font-display text-xs tracking-widest text-muted-foreground">
                  待審核名單
                </p>
                <span className="text-[10px] text-primary">3 筆待確認</span>
              </div>
              {["陀螺玩家 A", "陀螺玩家 B", "陀螺玩家 C"].map((player) => (
                <div
                  key={player}
                  className="flex items-center justify-between rounded-xl border border-border px-3 py-2.5"
                >
                  <span className="text-sm">{player}</span>
                  <span className="rounded-lg bg-primary px-2 py-1 text-[10px] font-bold text-primary-foreground">
                    核准
                  </span>
                </div>
              ))}
              <div className="rounded-xl border border-primary/45 px-3 py-3 text-center text-xs font-bold text-primary">
                全部核准
              </div>
            </>
          )}
          {step.number === "08" && (
            <>
              <p className="font-display text-xs tracking-widest text-muted-foreground">賽程設定</p>
              <div className="rounded-xl border border-border p-3 text-xs">
                <div className="flex justify-between border-b border-border pb-2">
                  <span>桌 1</span>
                  <span className="text-primary">玩家 A vs 玩家 B</span>
                </div>
                <div className="flex justify-between border-b border-border py-2">
                  <span>桌 2</span>
                  <span className="text-primary">玩家 C vs 玩家 D</span>
                </div>
                <div className="flex justify-between pt-2">
                  <span>桌 3</span>
                  <span className="text-primary">玩家 E vs 玩家 F</span>
                </div>
              </div>
              <div className="rounded-xl bg-primary px-3 py-3 text-center text-xs font-bold text-primary-foreground">
                隨機產生賽程
              </div>
              <p className="text-center text-[10px] text-muted-foreground">產生後將鎖定選手名單</p>
            </>
          )}
          {step.number === "10" && (
            <>
              <div className="flex items-center justify-between">
                <p className="font-display text-xs tracking-widest text-muted-foreground">
                  桌 1 · LIVE
                </p>
                <span className="text-[10px] text-primary">裁判計分中</span>
              </div>
              <div className="rounded-xl border border-primary/55 p-4 text-center">
                <p className="text-sm">
                  選手 A <span className="mx-3 font-display text-2xl text-primary">3 - 2</span> 選手
                  B
                </p>
                <p className="mt-2 text-[10px] text-muted-foreground">先取 4 分獲勝</p>
              </div>
              <div className="grid grid-cols-2 gap-2 text-center text-xs">
                <div className="rounded-xl border border-spin p-3 text-spin">迴轉 +1</div>
                <div className="rounded-xl border border-primary p-3 text-primary">擊飛 +2</div>
                <div className="rounded-xl border border-burst p-3 text-burst">爆裂 +2</div>
                <div className="rounded-xl border border-xtreme p-3 text-xtreme">極限 +3</div>
              </div>
            </>
          )}
          {step.number === "11" && (
            <>
              <p className="font-display text-xs tracking-widest text-muted-foreground">
                賽事完成 · 前四名已產生
              </p>
              {["冠軍  選手 A", "亞軍  選手 B", "季軍  選手 C", "殿軍  選手 D"].map(
                (place, index) => (
                  <div
                    key={place}
                    className="flex items-center gap-3 rounded-xl border border-border px-3 py-2"
                  >
                    <span className="font-display text-primary">0{index + 1}</span>
                    <span className="text-sm">{place}</span>
                  </div>
                ),
              )}
              <div className="rounded-xl bg-primary px-3 py-3 text-center text-xs font-bold text-primary-foreground">
                查看成績頁
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

export function LandingPage({ onAdminLogin }: LandingPageProps) {
  return (
    <div className="landing-snap -mx-4 -my-4">
      <section className="landing-panel px-5 py-12 sm:px-8">
        <div className="mx-auto max-w-xl text-center">
          <p className="inline-flex items-center gap-2 rounded-full border border-primary/40 bg-accent/25 px-3 py-1 text-[11px] tracking-widest text-primary">
            <Sparkles className="h-3.5 w-3.5" /> BEYBLADE X · TOURNAMENT MANAGER
          </p>
          <h2 className="mt-6 font-display text-3xl leading-tight neon-text sm:text-5xl">
            辦一場陀螺賽事，
            <br />
            從報名到頒獎一次搞定
          </h2>
          <p className="mx-auto mt-5 max-w-md text-base leading-relaxed text-muted-foreground">
            掃碼報名、裁判即時計分、賽程與成績自動同步。讓主辦方專注比賽現場。
          </p>
          <div className="mt-8 grid gap-3 sm:grid-cols-2">
            <button
              onClick={onAdminLogin}
              className="min-h-12 rounded-xl bg-primary px-5 font-bold text-primary-foreground"
            >
              我是管理者／裁判
            </button>
            <a
              href="#flow"
              className="flex min-h-12 items-center justify-center gap-2 rounded-xl border border-border font-bold text-foreground"
            >
              查看操作流程 <ArrowDown className="h-4 w-4" />
            </a>
          </div>
          <div className="mt-10 grid grid-cols-3 gap-2 text-left text-xs">
            <div className="panel p-3">
              <Users className="mb-2 h-4 w-4 text-primary" />
              128 人測試完成
            </div>
            <div className="panel p-3">
              <Swords className="mb-2 h-4 w-4 text-primary" />
              多桌裁判同步
            </div>
            <div className="panel p-3">
              <ShieldCheck className="mb-2 h-4 w-4 text-primary" />
              驗證碼找回
            </div>
          </div>
        </div>
      </section>

      <div id="flow">
        <QrCreationStory />
        <RegistrationStory />
        {STEPS.filter((step) => ["07", "10", "11"].includes(step.number)).map((step) => {
          const Icon = step.icon;
          if (step.number === "10") {
            return [<BracketStory key="bracket-story" />, <ScoringStory key="scoring-story" />];
          }
          return [
            <section key={step.number} className="landing-panel px-5 py-10 sm:px-8">
              <div className="mx-auto w-full max-w-3xl">
                <ProductPreview step={step} />
                <div className="mt-8">
                  <p className="font-display text-sm tracking-[0.2em] text-primary">
                    步驟{Number(step.number)} · {step.eyebrow}
                  </p>
                  <h2 className="mt-3 font-display text-3xl leading-tight sm:text-4xl">
                    {step.title}
                  </h2>
                  <p className="mt-4 max-w-md text-base leading-relaxed text-muted-foreground">
                    {step.body}
                  </p>
                  <div className="mt-6 inline-flex h-11 w-11 items-center justify-center rounded-xl border border-primary/45 bg-accent/25">
                    <Icon className="h-5 w-5 text-primary" />
                  </div>
                </div>
              </div>
            </section>,
          ];
        })}
      </div>

      <section className="landing-panel px-5 py-12 sm:px-8">
        <div className="panel mx-auto max-w-2xl p-7 text-center sm:p-10">
          <CheckCircle2 className="mx-auto h-9 w-9 text-primary" />
          <h2 className="mt-4 font-display text-2xl neon-text sm:text-3xl">
            準備好開始下一場賽事了嗎？
          </h2>
          <p className="mx-auto mt-3 max-w-md text-sm leading-relaxed text-muted-foreground">
            登入後即可建立賽事、產生 QR 報名連結並分配裁判桌次。
          </p>
          <button
            onClick={onAdminLogin}
            className="mt-7 min-h-12 rounded-xl bg-primary px-7 font-bold text-primary-foreground"
          >
            進入管理系統
          </button>
        </div>
      </section>
    </div>
  );
}
