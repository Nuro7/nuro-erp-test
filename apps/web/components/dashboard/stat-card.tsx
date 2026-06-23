import { ArrowUpRight, ArrowDownRight, Minus } from "lucide-react";
import { Card, CardDescription, CardTitle } from "@/components/ui/card";

type DeltaTone = "positive" | "negative" | "neutral";

export interface StatCardProps {
  title: string;
  value: string;
  delta?: string;
  deltaTone?: DeltaTone;
  deltaLabel?: string;
}

export function StatCard({ title, value, delta, deltaTone = "positive", deltaLabel }: StatCardProps) {
  const toneClass =
    deltaTone === "negative"
      ? "text-red-600 dark:text-red-400"
      : deltaTone === "neutral"
      ? "text-slate-500 dark:text-slate-400"
      : "text-emerald-600 dark:text-emerald-300";
  const Icon = deltaTone === "negative" ? ArrowDownRight : deltaTone === "neutral" ? Minus : ArrowUpRight;

  return (
    <Card className="min-h-[120px] sm:min-h-[160px]">
      <CardDescription>{title}</CardDescription>
      {/* Stack value above delta — a long value ("₹1,52,050") next to a long
          delta ("57.7% margin") used to overflow when the card was narrow on
          a 4-col grid. Vertical layout always fits. */}
      <CardTitle className="mt-4 text-xl sm:mt-8 sm:text-3xl">{value}</CardTitle>
      {(delta || deltaLabel) && (
        <div className="mt-2 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs">
          {delta && (
            <div className={`flex items-center gap-1 ${toneClass}`}>
              <Icon className="size-3.5" />
              <span>{delta}</span>
            </div>
          )}
          {deltaLabel && <span className="text-slate-500">{deltaLabel}</span>}
        </div>
      )}
    </Card>
  );
}
