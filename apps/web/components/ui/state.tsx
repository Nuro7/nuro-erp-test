import { Card } from "@/components/ui/card";

export function LoadingState({ label = "Loading data..." }: { label?: string }) {
  return <Card className="text-sm text-slate-500">{label}</Card>;
}

export function ErrorState({ label = "Something went wrong while loading this module." }: { label?: string }) {
  return <Card className="text-sm text-rose-500">{label}</Card>;
}
