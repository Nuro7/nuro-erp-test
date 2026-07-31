"use client";

import { Card, CardDescription, CardTitle } from "@/components/ui/card";
import { Progress } from "@/components/ui/progress";
import { useHrOverview } from "@/lib/api/hooks";

export function WorkloadPanel() {
  const { data } = useHrOverview();

  const employees = ((data?.employees ?? []) as Array<{
    user: { firstName: string; lastName: string };
    designation: string;
    performanceScore?: number;
  }>).slice(0, 5);

  return (
    <Card>
      <CardDescription>Resource allocation</CardDescription>
      <CardTitle className="mt-1">Team workload</CardTitle>
      <div className="mt-5 flex flex-col gap-4">
        {employees.length === 0 ? (
          <p className="text-sm text-slate-400">No employee data available.</p>
        ) : (
          employees.map((emp, i) => {
            const score = Number(emp.performanceScore ?? 0);
            const utilization = Math.round(score * 20);
            return (
              <div key={i}>
                <div className="flex items-center justify-between text-sm">
                  <div>
                    <span className="font-medium text-slate-700 dark:text-slate-200">
                      {emp.user.firstName} {emp.user.lastName}
                    </span>
                    <p className="text-xs text-slate-500">{emp.designation}</p>
                  </div>
                  <span className="text-sm font-semibold text-slate-600">{utilization}%</span>
                </div>
                <Progress value={utilization} className="mt-1.5" />
              </div>
            );
          })
        )}
      </div>
    </Card>
  );
}
