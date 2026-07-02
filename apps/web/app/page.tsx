"use client";

import { useState } from "react";
import { ArrowRight, Loader2, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { loginRequest } from "@/lib/api/client";
import { useAuthStore } from "@/lib/store/auth-store";

// Demo landing page. Instead of showing a login form, we expose a single
// "Launch Demo" button that signs in the seeded demo account (username
// "demo" / password "demo", SUPER_ADMIN) behind the scenes and drops the
// visitor straight into the dashboard. The backend still requires a JWT on
// every route, so we can't just redirect to /dashboard — we auto-login to
// get a real token, then navigate.
const DEMO_EMAIL = "demo";
const DEMO_PASSWORD = "demo";

export default function HomePage() {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const setSession = useAuthStore((state) => state.setSession);

  async function launchDemo() {
    setError(null);
    setLoading(true);
    try {
      const session = await loginRequest(DEMO_EMAIL, DEMO_PASSWORD);
      setSession(session);
      // Real top-level navigation so the persisted session is fully flushed
      // to storage before the dashboard's SessionGuard reads it.
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
