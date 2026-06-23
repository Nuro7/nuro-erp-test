import type { ReactNode } from "react";
import type { Metadata } from "next";

/**
 * Server-component layout for the public view routes. Sets
 * `Referrer-Policy: no-referrer` (via the `<meta name="referrer">`
 * Next.js injects from this metadata) so that any outbound
 * subresource — org logo, stamp image, an external link the user
 * clicks — cannot leak the `?t=` token in the URL via the Referer
 * header. Also keeps these pages out of search engines.
 *
 * The parent `(portal)/portal/layout.tsx` is a client component and
 * can't export metadata; this child layout fills that gap for the
 * `/portal/view/*` subtree only.
 */
export const metadata: Metadata = {
  referrer: "no-referrer",
  robots: { index: false, follow: false },
};

export default function PortalPublicViewLayout({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
