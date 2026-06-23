"use client";

import type { FormEvent } from "react";
import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ArrowRight, Eye, EyeOff, ShieldCheck, Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { loginRequest } from "@/lib/api/client";
import { useAuthStore } from "@/lib/store/auth-store";

// Ask the browser's password manager to store these credentials. Without
// this, Chromium-based browsers won't prompt to save because the form is
// submitted via fetch + SPA navigation (no real top-level POST → redirect).
async function offerCredentialSave(email: string, password: string) {
  if (typeof window === "undefined") return;
  const PasswordCredentialCtor = (window as unknown as {
    PasswordCredential?: new (init: { id: string; password: string }) => Credential;
  }).PasswordCredential;
  if (!PasswordCredentialCtor || !navigator.credentials?.store) return;
  try {
    const cred = new PasswordCredentialCtor({ id: email, password });
    await navigator.credentials.store(cred);
  } catch {
    /* user dismissed / unsupported — ignore */
  }
}

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const accessToken = useAuthStore((state) => state.accessToken);
  const setSession = useAuthStore((state) => state.setSession);

  useEffect(() => {
    if (accessToken) {
      router.replace("/dashboard");
    }
  }, [accessToken, router]);

  function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const session = await loginRequest(email, password);
        setSession(session);
        // Ask the browser to remember these credentials. Done before the
        // navigation so the prompt fires on the current document.
        await offerCredentialSave(email, password);
        // Use a real top-level navigation instead of router.replace so the
        // browser's password manager treats the submit as a successful login
        // and offers to save the credentials.
        window.location.assign("/dashboard");
      } catch (submissionError) {
        setError(submissionError instanceof Error ? submissionError.message : "Login failed.");
      }
    });
  }

  return (
    <main className="grid min-h-screen lg:grid-cols-[1.05fr_0.95fr]">
      <section className="relative hidden overflow-hidden bg-slate-950 text-white lg:block">
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_left,rgba(249,115,22,0.35),transparent_35%),radial-gradient(circle_at_bottom_right,rgba(14,165,233,0.35),transparent_30%)]" />
        <div className="relative flex h-full flex-col justify-between p-12">
          <div className="flex flex-col gap-2">
            {/* The dark-panel side needs the true-white wordmark so it
                actually reads against the slate-950 background — the
                regular /logo-white.png is dark-ink-on-transparent and
                disappears here. */}
            {/* Inline style instead of Tailwind h-7 — some global `img`
                rules in the login chunk were forcing the logo to 100%
                width, which made the 800x200 wordmark fill the panel. */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src="/logo-white-inverted.png"
              alt="Nuro7"
              style={{ height: 28, width: "auto", maxWidth: 140 }}
            />
            <p className="text-sm text-white/60">Operations command center</p>
          </div>
          <div className="max-w-xl">
            <p className="mb-4 text-xs uppercase tracking-[0.3em] text-white/50">Internal Management Platform</p>
            <h1 className="text-5xl font-semibold tracking-tight">Run delivery, people, finance, and client operations from one surface.</h1>
            <p className="mt-6 max-w-lg text-base text-white/72">
              Nuro7 centralizes project execution, time tracking, HR workflows, billing, and reporting for fast-moving AI and software teams.
            </p>
          </div>
          <div className="flex gap-8 text-sm text-white/70">
            <div className="flex items-center gap-2"><ShieldCheck className="size-4" /> JWT + RBAC</div>
            <div className="flex items-center gap-2"><Sparkles className="size-4" /> Modular SaaS architecture</div>
          </div>
        </div>
      </section>

      <section className="flex items-center justify-center px-6 py-12">
        <div className="w-full max-w-md rounded-[2rem] border border-border/70 bg-white/85 p-8 shadow-panel backdrop-blur dark:bg-slate-950/70">
          <p className="text-xs uppercase tracking-[0.3em] text-slate-400">Welcome back</p>
          <h2 className="mt-3 text-3xl font-semibold tracking-tight">Sign in to Nuro7</h2>
          <p className="mt-3 text-sm text-slate-500">Use your work credentials to access the internal workspace.</p>
          <form
            className="mt-8 flex flex-col gap-4"
            onSubmit={handleSubmit}
            method="post"
            action="/login"
          >
            <Input
              type="email"
              id="email"
              name="email"
              placeholder="you@nuro7.com"
              autoComplete="username"
              required
              value={email}
              onChange={(event) => setEmail(event.target.value)}
            />
            <div className="relative">
              <Input
                type={showPassword ? "text" : "password"}
                id="current-password"
                name="password"
                placeholder="Password"
                autoComplete="current-password"
                required
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className="pr-10"
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                aria-label={showPassword ? "Hide password" : "Show password"}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-600 dark:hover:text-slate-200 transition-colors"
                tabIndex={-1}
              >
                {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
            <Button type="submit" className="mt-2 w-full" disabled={isPending || !email || !password}>
              Continue
              <ArrowRight className="ml-2 size-4" />
            </Button>
          </form>
          {error ? <p className="mt-4 text-sm text-rose-500">{error}</p> : null}
          <div className="mt-6 flex items-center justify-between text-xs text-slate-400">
            <a href="/forgot-password" className="font-medium text-primary hover:underline">
              Forgot password?
            </a>
            <span>Trouble signing in? Contact your admin.</span>
          </div>
        </div>
      </section>
    </main>
  );
}
