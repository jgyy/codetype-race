"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";

const links = [
  { href: "/", label: "Join" },
  { href: "/host", label: "Host" },
  { href: "/history", label: "History" },
];

export function Nav() {
  const pathname = usePathname();
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
        </ul>
      </div>
    </nav>
  );
}
