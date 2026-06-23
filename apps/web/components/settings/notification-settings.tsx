"use client";

import { useEffect, useState } from "react";
import { Bell, Mail, MonitorSmartphone } from "lucide-react";
import { Card, CardTitle, CardDescription } from "@/components/ui/card";
import { LoadingState } from "@/components/ui/state";
import { apiFetch } from "@/lib/api/client";
import { toast } from "@/lib/hooks/use-toast";

interface PreferenceRow {
  eventKey: string;
  label: string;
  description: string;
  emailEnabled: boolean;
  inAppEnabled: boolean;
  updatedAt: string | null;
}

type Channel = "emailEnabled" | "inAppEnabled";

export function NotificationSettingsTab() {
  const [rows, setRows] = useState<PreferenceRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [busyKey, setBusyKey] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await apiFetch<PreferenceRow[]>("/notification-preferences");
      setRows(data);
    } catch (err) {
      toast({
        variant: "error",
        title: "Failed to load notification settings",
        description: (err as Error).message,
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
  }, []);

  const toggle = async (row: PreferenceRow, channel: Channel) => {
    if (!rows) return;
    const next = !row[channel];
    setBusyKey(`${row.eventKey}:${channel}`);
    // Optimistic update so the pill flips immediately.
    setRows((prev) =>
      prev ? prev.map((r) => (r.eventKey === row.eventKey ? { ...r, [channel]: next } : r)) : prev,
    );
    try {
      await apiFetch<PreferenceRow>(`/notification-preferences/${row.eventKey}`, {
        method: "PATCH",
        body: JSON.stringify({ [channel]: next }),
      });
    } catch (err) {
      // Roll back on failure.
      setRows((prev) =>
        prev ? prev.map((r) => (r.eventKey === row.eventKey ? { ...r, [channel]: !next } : r)) : prev,
      );
      toast({
        variant: "error",
        title: "Failed to save",
        description: (err as Error).message,
      });
    } finally {
      setBusyKey(null);
    }
  };

  if (loading || !rows) return <LoadingState label="Loading notification settings..." />;

  return (
    <div className="space-y-6">
      <Card>
        <div className="flex items-start gap-3">
          <div className="rounded-lg bg-slate-100 p-2 dark:bg-slate-800">
            <Bell className="size-5 text-slate-600 dark:text-slate-300" />
          </div>
          <div className="flex-1">
            <CardTitle>Notification channels</CardTitle>
            <CardDescription>
              Org-wide master switches. Toggle email or in-app delivery per event for every
              employee. Password reset and email verification are security-critical and always
              send. Email delivery additionally requires SMTP/Resend to be configured under
              Settings → Email.
            </CardDescription>
          </div>
        </div>

        <div className="mt-4 overflow-hidden rounded-2xl border border-border">
          <div className="grid grid-cols-[1fr_auto_auto] items-center gap-x-4 border-b border-border bg-slate-50 px-4 py-2 text-[11px] uppercase tracking-wider text-slate-500 dark:bg-slate-900/60 dark:text-slate-400">
            <div>Event</div>
            <div className="flex items-center gap-1.5 justify-end">
              <Mail className="size-3.5" />
              Email
            </div>
            <div className="flex items-center gap-1.5 justify-end">
              <MonitorSmartphone className="size-3.5" />
              In-app
            </div>
          </div>
          {rows.map((row, idx) => (
            <div
              key={row.eventKey}
              className={`grid grid-cols-[1fr_auto_auto] items-center gap-x-4 px-4 py-3 ${
                idx < rows.length - 1 ? "border-b border-border" : ""
              }`}
            >
              <div className="min-w-0">
                <div className="font-medium text-slate-900 dark:text-white">{row.label}</div>
                <div className="text-xs text-slate-500 dark:text-slate-400">{row.description}</div>
              </div>
              <Pill
                on={row.emailEnabled}
                busy={busyKey === `${row.eventKey}:emailEnabled`}
                onClick={() => void toggle(row, "emailEnabled")}
                label={row.emailEnabled ? "On" : "Off"}
                ariaLabel={`Email delivery for ${row.label}: ${row.emailEnabled ? "on" : "off"}`}
              />
              <Pill
                on={row.inAppEnabled}
                busy={busyKey === `${row.eventKey}:inAppEnabled`}
                onClick={() => void toggle(row, "inAppEnabled")}
                label={row.inAppEnabled ? "On" : "Off"}
                ariaLabel={`In-app delivery for ${row.label}: ${row.inAppEnabled ? "on" : "off"}`}
              />
            </div>
          ))}
        </div>
      </Card>
    </div>
  );
}

interface PillProps {
  on: boolean;
  busy: boolean;
  label: string;
  ariaLabel: string;
  onClick: () => void;
}

function Pill({ on, busy, label, ariaLabel, onClick }: PillProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={busy}
      aria-label={ariaLabel}
      className={`inline-flex h-7 min-w-[3.5rem] items-center justify-center rounded-full px-3 text-xs font-semibold transition ${
        on
          ? "bg-emerald-500/15 text-emerald-700 ring-1 ring-emerald-500/30 hover:bg-emerald-500/25 dark:bg-emerald-500/20 dark:text-emerald-300 dark:ring-emerald-500/40"
          : "bg-slate-100 text-slate-500 ring-1 ring-slate-200 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700"
      } ${busy ? "opacity-60" : ""}`}
    >
      {label}
    </button>
  );
}
