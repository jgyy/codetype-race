"use client";
import { useEffect, useState } from "react";
import Link from "next/link";
import { getCurrentSeason } from "@/lib/api";

export function SeasonRibbon() {
  const [data, setData] = useState<{
    id: string;
    days: number;
  } | null>(null);

  useEffect(() => {
    getCurrentSeason()
      .then((r) => {
        if (r.season && r.daysRemaining !== null) {
          setData({ id: r.season.id, days: r.daysRemaining });
        }
      })
      .catch(() => {
        // silent: ribbon is decorative
      });
  }, []);

  if (!data) return null;
  return (
    <Link
      href="/seasons"
      className="inline-flex items-center gap-2 rounded-full border border-neutral-800 bg-neutral-900 px-3 py-1 text-xs text-neutral-300 hover:border-emerald-700"
    >
      <span className="font-mono text-emerald-400">Season {data.id}</span>
      <span className="text-neutral-500">·</span>
      <span>{data.days} days remaining</span>
    </Link>
  );
}
