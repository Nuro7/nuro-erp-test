"use client";

import { useState } from "react";
import { ArrowRight, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loginRequest } from "@/lib/api/client";
import { useAuthStore } from "@/lib/store/auth-store";
import type { LoginResponse } from "@/lib/auth";

// Demo landing page. A single "Launch Demo" button drops the visitor straight
// into the dashboard — no login form, no credentials.
//
// When NEXT_PUBLIC_DEMO_MODE is "true" (paired with DEMO_MODE=true on the API)
// there is NO authentication at all: the API runs every request as the seeded
// demo account, so the button just seeds a local placeholder session and
// navigates instantly — zero login round-trip, nothing to wait for. When the
// flag is off it falls back to a real behind-the-scenes login with the seeded
// demo credentials, so the same page still works against a secured API.
const DEMO_MODE = process.env.NEXT_PUBLIC_DEMO_MODE === "true";
const DEMO_EMAIL = "demo";
const DEMO_PASSWORD = "demo";

// Placeholder session used in DEMO_MODE. The token is never verified — the API
// bypasses auth entirely — so any non-empty value works; it only needs to be
// truthy so the dashboard's SessionGuard lets the page render. SUPER_ADMIN so
// any client-side role gating shows the full app.
const DEMO_SESSION: LoginResponse = {
  accessToken: "demo",
  refreshToken: "demo",
  user: { id: "demo", email: "demo", roles: ["SUPER_ADMIN"] },
};

export default function HomePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setSession = useAuthStore((state) => state.setSession);

  async function launchDemo() {
    setError(null);
    setLoading(true);

    // No-auth demo path: seed the placeholder session and go straight in.
    // Nothing blocks on the network, so entry is instant.
    if (DEMO_MODE) {
      setSession(DEMO_SESSION);
      window.location.assign("/dashboard");
      return;
    }

    // Fallback (secured API): real login with the seeded demo credentials.
    try {
      const session = await loginRequest(DEMO_EMAIL, DEMO_PASSWORD);
      setSession(session);
      window.location.assign("/dashboard");
    } catch {
      setError(
        "Couldn't start the demo. The server may still be waking up — please try again in a moment.",
      );
      setLoading(false);
    }
  }

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-slate-950 px-6 text-white">
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.35),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.35),transparent_30%)]" />

      <div className="relative flex w-full max-w-xl flex-col items-center text-center">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src="/logo-white-inverted.png"
          alt="Nuro7"
          style={{ height: 34, width: "auto", maxWidth: 170 }}
        />
        <p className="mt-3 text-xs uppercase tracking-[0.3em] text-white/50">
          Internal Management Platform
        </p>

        <h1 className="mt-8 text-4xl font-semibold tracking-tight sm:text-5xl">
          Explore the Nuro7 platform
        </h1>
        <p className="mt-5 max-w-lg text-base text-white/72">
          Project execution, time tracking, HR workflows, billing, and reporting —
          all in one workspace. Click below to open the live demo. No sign-in needed.
        </p>

        <Button
          onClick={launchDemo}
          disabled={loading}
          className="mt-10 h-12 px-8 text-base"
        >
          {loading ? (
            <>
              <Loader2 className="mr-2 size-5 animate-spin" />
              Starting demo…
            </>
          ) : (
            <>
              Launch Demo
              <ArrowRight className="ml-2 size-5" />
            </>
          )}
        </Button>

        {loading ? (
          <p className="mt-4 text-sm text-white/60">
            The server may take up to a minute to wake up on first load. Thanks for
            your patience.
          </p>
        ) : null}

        {error ? <p className="mt-4 text-sm text-rose-400">{error}</p> : null}

        <div className="mt-12 flex gap-8 text-sm text-white/70">
          <div className="flex items-center gap-2">
            <ShieldCheck className="size-4" /> Full-access demo
          </div>
          <div className="flex items-center gap-2">
            <Sparkles className="size-4" /> Modular SaaS architecture
          </div>
        </div>
      </div>
    </main>
  );
}
