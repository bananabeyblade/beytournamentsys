import { useState } from "react";
import { lovable } from "@/integrations/lovable";
import { railwayAuthEnabled, startRailwayGoogleLogin } from "@/lib/railway-auth";

export function GoogleSignInButton({ onError }: { onError?: (msg: string) => void }) {
  const [busy, setBusy] = useState(false);

  return (
    <button
      type="button"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        onError?.("");
        if (railwayAuthEnabled) {
          startRailwayGoogleLogin();
          return;
        }
        const result = await lovable.auth.signInWithOAuth("google", {
          redirect_uri: window.location.origin,
        });
        if (result.error) {
          onError?.("Google 登入失敗，請再試一次");
          setBusy(false);
          return;
        }
        if (!result.redirected) setBusy(false);
      }}
      className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-border bg-secondary font-display text-foreground disabled:opacity-50"
    >
      <svg className="h-4 w-4" viewBox="0 0 48 48" aria-hidden="true">
        <path
          fill="#EA4335"
          d="M24 9.5c3.5 0 6.6 1.2 9 3.6l6.7-6.7C35.6 2.5 30.2 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.8 6.1C12.3 13.2 17.6 9.5 24 9.5z"
        />
        <path
          fill="#4285F4"
          d="M46.5 24.5c0-1.6-.15-3.2-.44-4.7H24v9h12.6c-.55 2.9-2.2 5.4-4.7 7.1l7.6 5.9c4.4-4.1 7-10.1 7-17.3z"
        />
        <path
          fill="#FBBC05"
          d="M10.4 28.7c-.5-1.5-.8-3.1-.8-4.7s.3-3.2.8-4.7l-7.8-6.1C.95 16.5 0 20.1 0 24s.95 7.5 2.6 10.8l7.8-6.1z"
        />
        <path
          fill="#34A853"
          d="M24 48c6.2 0 11.5-2.1 15.5-5.6l-7.6-5.9c-2.1 1.4-4.8 2.3-7.9 2.3-6.4 0-11.7-3.7-13.6-9.1l-7.8 6.1C6.5 42.6 14.6 48 24 48z"
        />
      </svg>
      使用 Google 登入
    </button>
  );
}
