const BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

const SESSION_STORAGE_KEY = "cp_session";
const FRAGMENT_PREFIX = "#cp_s=";

/**
 * Hand-off step from the magic-link verify redirect. The API redirects
 * to `${portalUrl}${next}#cp_s=<sessionToken>`; we read the fragment
 * here (it never reaches the server, so no log/Referer leak),
 * persist the session in localStorage, then strip the fragment from
 * the URL via replaceState so the bare token doesn't survive in
 * browser history.
 *
 * Bearer auth (instead of the original `cp_session` cookie) is what
 * makes the portal work on browsers with strict third-party cookie
 * policies (Brave Shields, Safari ITP, strict Chrome). The API and
 * SPA live on completely separate domains here (e.g. nuro-api.onrender.com
 * vs app.nuro7.com), so a cookie set by the API is third-party for
 * the SPA and gets silently dropped, leaving the user stuck on the
 * login page after a successful magic-link click.
 *
 * Runs once at module import time on the client; SSR-safe by guarding
 * on `typeof window`.
 */
function consumeSessionFragment(): void {
  if (typeof window === "undefined") return;
  const hash = window.location.hash;
  if (!hash.startsWith(FRAGMENT_PREFIX)) return;
  const rawAfter = hash.slice(FRAGMENT_PREFIX.length);
  // Tolerate `#cp_s=abc&other=1` in case future redirects add params.
  const tokenPart = rawAfter.split("&")[0];
  const token = decodeURIComponent(tokenPart);
  if (!token) return;
  try {
    window.localStorage.setItem(SESSION_STORAGE_KEY, token);
  } catch {
    // localStorage can throw in private mode on some browsers; swallow.
  }
  try {
    window.history.replaceState(
      null,
      "",
      window.location.pathname + window.location.search,
    );
  } catch {
    // Older browsers / sandboxed iframes; non-fatal.
  }
}

consumeSessionFragment();

function getSession(): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(SESSION_STORAGE_KEY);
  } catch {
    return null;
  }
}

function clearSession(): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.removeItem(SESSION_STORAGE_KEY);
  } catch {
    /* noop */
  }
}

async function call<T>(path: string, init: RequestInit = {}): Promise<T> {
  const session = getSession();
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    ...((init.headers as Record<string, string> | undefined) ?? {}),
  };
  if (session) {
    headers["Authorization"] = `Bearer ${session}`;
  }
  const res = await fetch(`${BASE}/client-portal${path}`, {
    // Keep cookies enabled so same-origin / cookie-friendly browsers
    // continue to work (cheap insurance — the Authorization header is
    // what carries the session in practice now).
    credentials: "include",
    headers,
    cache: "no-store",
    ...init,
  });
  if (res.status === 401) {
    // Stale session or never had one — wipe localStorage so we don't
    // keep retrying a known-bad token, then bounce to the login form.
    clearSession();
    if (typeof window !== "undefined") window.location.href = "/portal/login";
    throw new Error("unauthenticated");
  }
  if (!res.ok) throw new Error(`request_failed_${res.status}`);
  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

export const portalApi = {
  me: () =>
    call<{
      contactId: string;
      clientId: string;
      name: string | null;
      email: string;
      orgName: string;
      orgLogoUrl: string | null;
      baseCurrency: string;
      orgEmail: string | null;
      orgPhone: string | null;
      orgWebsite: string | null;
      orgAddress: string | null;
      orgLegalName: string | null;
      orgStampUrl: string | null;
      orgAddressLine1: string | null;
      orgAddressLine2: string | null;
      orgCity: string | null;
      orgState: string | null;
      orgPostalCode: string | null;
      orgCountry: string | null;
      bankName: string | null;
      bankAccountNumber: string | null;
      bankAccountHolder: string | null;
      bankBranch: string | null;
      bankIfsc: string | null;
      bankUpi: string | null;
      invoiceTerms: string | null;
    }>("/me"),
  dashboard: () => call<any>("/dashboard"),
  projects: {
    list: () => call<any[]>("/projects"),
    detail: (id: string) => call<any>(`/projects/${id}`),
    tasks: (id: string) => call<any[]>(`/projects/${id}/tasks`),
  },
  invoices: {
    list: () => call<any[]>("/invoices"),
    detail: (id: string) => call<any>(`/invoices/${id}`),
    pdfUrl: (id: string) => `${BASE}/client-portal/invoices/${id}/pdf`,
  },
  proposals: {
    list: () => call<any[]>("/proposals"),
    detail: (id: string) => call<any>(`/proposals/${id}`),
    decide: (id: string, decision: "ACCEPTED" | "REJECTED", note?: string) =>
      call<{ ok: true }>(`/proposals/${id}/decide`, {
        method: "POST",
        body: JSON.stringify({ decision, note }),
      }),
  },
  chat: {
    list: (projectId: string) => call<Array<{ id: string; content: string; createdAt: string; side: "team" | "client"; authorName: string; avatarUrl: string | null }>>(`/projects/${projectId}/chat`),
    post: (projectId: string, content: string) =>
      call<{ id: string; ok: true }>(`/projects/${projectId}/chat`, { method: "POST", body: JSON.stringify({ content }) }),
  },
  requests: {
    list: (status?: string) => call<any[]>(`/requests${status ? `?status=${status}` : ""}`),
    detail: (id: string) => call<any>(`/requests/${id}`),
    create: (input: { title: string; body: string; projectId?: string }) =>
      call<any>("/requests", { method: "POST", body: JSON.stringify(input) }),
    reply: (id: string, body: string) =>
      call<{ ok: true }>(`/requests/${id}/messages`, {
        method: "POST",
        body: JSON.stringify({ body }),
      }),
  },
  auth: {
    requestLink: (email: string) =>
      call<{ ok: true }>("/auth/request-link", {
        method: "POST",
        body: JSON.stringify({ email }),
      }),
    logout: async () => {
      const r = await call<{ ok: true }>("/auth/logout", { method: "POST" });
      // Wipe local session after server-side revoke so a quick re-open
      // doesn't reuse the token before the next fetch sees the 401.
      clearSession();
      return r;
    },
  },
};
