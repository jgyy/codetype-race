"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import { getMe } from "@/lib/api";

const links = [
  { href: "/", label: "Join" },
  { href: "/host", label: "Host" },
  { href: "/practice", label: "Practice" },
  { href: "/daily", label: "Daily" },
  { href: "/leaderboard", label: "Leaderboard" },
  { href: "/tournaments", label: "Tournaments" },
  { href: "/history", label: "History" },
];

export function Nav() {
  const pathname = usePathname();
  const [me, setMe] = useState<{
    user_id: string;
    rating: number;
    isAdmin: boolean;
  } | null>(null);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        // Phase 16.10 — dynamic-import the Amplify SDK; Nav is on every
        // page but most visitors are anonymous (home/practice/leaderboard).
        // Defer the chunk until after first paint instead of blocking it.
        const { getCurrentUser } = await import("@/lib/aws/cognito");
        await getCurrentUser();
        const r = await getMe();
        if (!cancelled) {
          setMe({
            user_id: r.profile.user_id,
            rating: r.profile.rating,
            isAdmin: (r.groups ?? []).includes("admin"),
          });
        }
      } catch {
        // anonymous; no rating to show
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return (
    <nav className="border-b border-neutral-800 bg-neutral-950/80 backdrop-blur">
      <div className="mx-auto flex max-w-3xl items-center justify-between px-6 py-3">
        <Link href="/" className="font-semibold tracking-tight">
          CodeType<span className="text-emerald-400">.race</span>
        </Link>
        <ul className="flex items-center gap-1 text-sm">
          {links.map((l) => {
            const active =
              l.href === "/" ? pathname === "/" : pathname?.startsWith(l.href);
            return (
              <li key={l.href}>
                <Link
                  href={l.href}
                  className={`rounded px-3 py-1.5 ${
                    active
                      ? "bg-neutral-800 text-white"
                      : "text-neutral-400 hover:text-white"
                  }`}
                >
                  {l.label}
                </Link>
              </li>
            );
          })}
          {me?.isAdmin && (
            <li>
              <Link
                href="/admin/snippets"
                className="rounded px-3 py-1.5 text-amber-400 hover:bg-neutral-800"
              >
                Admin
              </Link>
            </li>
          )}
          {me && (
            <li>
              <Link
                href={`/profile?id=${encodeURIComponent(me.user_id)}`}
                className="rounded px-3 py-1.5 font-mono text-emerald-400 hover:bg-neutral-800"
                title="your rating"
              >
                {me.rating}
              </Link>
            </li>
          )}
        </ul>
      </div>
    </nav>
  );
}
