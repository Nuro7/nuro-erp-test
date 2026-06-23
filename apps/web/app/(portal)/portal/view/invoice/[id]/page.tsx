"use client";
import { useEffect, useState } from "react";
import { useParams, useSearchParams } from "next/navigation";
import { AlertCircle } from "lucide-react";
import { NuroInvoicePrint, type NuroInvoiceData, type NuroOrgInfo } from "@/components/accounting/nuro-invoice-print";
import { PrintFitWrap } from "@/components/portal/print-fit-wrap";

const API_BASE = process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:4000/api/v1";

interface PublicInvoicePayload {
  invoice: Record<string, unknown>;
  org: Record<string, unknown>;
}

/**
 * Public, session-less invoice view reached from the link in the
 * invoice email. Auth is the magic-link token in `?t=`, validated by
 * the API. No cookies, no portal login — works in any browser regardless
 * of third-party cookie policy (Brave / Safari ITP / incognito) where
 * the cookie-based portal session silently failed.
 */
export default function PublicInvoiceView() {
  const params = useParams();
  const sp = useSearchParams();
  const id = String(params?.id ?? "");
  const token = sp?.get("t") ?? "";
  const [data, setData] = useState<PublicInvoicePayload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id || !token) {
      setError("This invoice link is missing or has expired. Please ask the sender to resend.");
      return;
    }
    fetch(`${API_BASE}/client-portal/public/invoices/${id}?t=${encodeURIComponent(token)}`, {
      cache: "no-store",
    })
      .then(async (r) => {
        if (!r.ok) throw new Error(r.status === 404 ? "not_found" : `request_failed_${r.status}`);
        return r.json();
      })
      .then((d) => setData(d as PublicInvoicePayload))
      .catch((e: Error) => {
        setError(
          e.message === "not_found"
            ? "This invoice link is no longer valid. Please ask the sender to resend."
            : "Sorry — we couldn't load this invoice. Please try again in a moment.",
        );
      });
  }, [id, token]);

  if (error) {
    return (
      <div className="portal-card p-6" style={{ borderColor: "var(--rose)", color: "var(--rose)" }}>
        <div className="flex items-center gap-2 font-medium">
          <AlertCircle className="size-4" /> Unable to load invoice
        </div>
        <p className="mt-1 text-sm">{error}</p>
      </div>
    );
  }

  if (!data) return <p style={{ color: "var(--muted)" }}>Loading invoice…</p>;

  const inv = data.invoice;
  const org = data.org;
  const client = (inv.client ?? null) as { companyName?: string; contactPerson?: string; address?: string; email?: string; phone?: string } | null;
  const project = (inv.project ?? null) as { name?: string } | null;
  const items = (inv.items ?? []) as Array<{
    description?: string;
    quantity?: number | string;
    duration?: string | null;
    price?: number | string;
    unitPrice?: number | string;
    total?: number | string;
  }>;

  const doc: NuroInvoiceData = {
    documentType: "INVOICE",
    number: String(inv.number ?? ""),
    referenceNumber: (inv.referenceNumber as string | undefined) ?? undefined,
    status: inv.status as string | undefined,
    issueDate: inv.issueDate as string | undefined,
    dueDate: inv.dueDate as string | undefined,
    projectName: project?.name,
    clientName: client?.contactPerson || client?.companyName,
    clientCompany: client?.companyName,
    clientAddress: client?.address,
    clientEmail: client?.email,
    clientPhone: client?.phone,
    items: items.map((it) => ({
      description: it.description,
      quantity: it.quantity != null ? Number(it.quantity) : undefined,
      duration: it.duration ?? undefined,
      price: Number(it.unitPrice ?? it.price ?? 0),
      amount: it.total != null ? Number(it.total) : undefined,
    })),
    subtotal: Number(inv.subtotal ?? inv.amount ?? 0),
    tax: Number(inv.tax ?? 0),
    discount: Number(inv.discount ?? 0),
    total: Number(inv.total ?? 0),
    paidAmount: Number(inv.paidAmount ?? 0),
    balanceTotal: Number(inv.balanceTotal ?? 0),
    advance: inv.advance != null ? Number(inv.advance) : undefined,
    leadNote: inv.leadNote as string | undefined,
    notes: inv.notes as string | undefined,
  };

  const orgInfo: NuroOrgInfo = {
    name: (org?.orgName as string | undefined),
    legalName: (org?.orgLegalName as string | undefined) ?? undefined,
    logoUrl: (org?.orgLogoUrl as string | undefined) ?? undefined,
    email: (org?.orgEmail as string | undefined) ?? undefined,
    phone: (org?.orgPhone as string | undefined) ?? undefined,
    website: (org?.orgWebsite as string | undefined) ?? undefined,
    addressLine1: (org?.orgAddressLine1 as string | undefined) ?? undefined,
    addressLine2: (org?.orgAddressLine2 as string | undefined) ?? undefined,
    city: (org?.orgCity as string | undefined) ?? undefined,
    state: (org?.orgState as string | undefined) ?? undefined,
    postalCode: (org?.orgPostalCode as string | undefined) ?? undefined,
    country: (org?.orgCountry as string | undefined) ?? undefined,
    bankName: (org?.bankName as string | undefined) ?? undefined,
    bankAccountNumber: (org?.bankAccountNumber as string | undefined) ?? undefined,
    bankAccountHolder: (org?.bankAccountHolder as string | undefined) ?? undefined,
    bankBranch: (org?.bankBranch as string | undefined) ?? undefined,
    bankIfsc: (org?.bankIfsc as string | undefined) ?? undefined,
    bankUpi: (org?.bankUpi as string | undefined) ?? undefined,
    stampUrl: (org?.orgStampUrl as string | undefined) ?? undefined,
    invoiceTerms: (org?.invoiceTerms as string | undefined) ?? undefined,
  };

  return (
    <div className="space-y-4">
      <PrintFitWrap>
        <NuroInvoicePrint doc={doc} org={orgInfo} />
      </PrintFitWrap>
      <p className="text-center text-[11px] sm:hidden" style={{ color: "var(--muted)" }}>
        Pinch to zoom in, or tap Download PDF for a clean copy.
      </p>
    </div>
  );
}
