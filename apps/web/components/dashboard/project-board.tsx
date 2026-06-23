"use client";

import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { useDashboardSummary } from "@/lib/api/hooks";

const statusConfig = [
  { key: "PLANNING", label: "Planning", color: "bg-blue-500" },
  { key: "ACTIVE", label: "Active", color: "bg-emerald-500" },
  { key: "ON_HOLD", label: "On Hold", color: "bg-amber-500" },
  { key: "COMPLETED", label: "Completed", color: "bg-slate-400" },
];

export function ProjectBoard() {
  const { data } = useDashboardSummary();

  const taskBoard = (data?.taskBoard ?? []) as Array<{ status: string; _count: number }>;

  return (
    <Card>
      <CardDescription>Delivery flow</CardDescription>
      <CardTitle className="mt-1">Project status board</CardTitle>
      <div className="mt-5 grid grid-cols-2 gap-3">
        {statusConfig.map((s) => {
          const count = taskBoard.find((t) => t.status === s.key)?._count ?? 0;
          return (
            <div key={s.key} className="rounded-xl border border-border/50 p-3">
              <div className="flex items-center justify-between">
                <span className="text-sm font-medium text-slate-700 dark:text-slate-300">{s.label}</span>
                <Badge tone="neutral" size="sm">{count}</Badge>
              </div>
              <div className={`mt-2 h-1 w-full rounded-full bg-slate-100 dark:bg-slate-800`}>
                <div className={`h-1 rounded-full ${s.color}`} style={{ width: `${Math.min(count * 10, 100)}%` }} />
              </div>
            </div>
          );
        })}
      </div>
    </Card>
  );
}
