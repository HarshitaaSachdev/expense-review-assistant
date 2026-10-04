"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const LINKS = [
  { href: "/", label: "Claims" },
  { href: "/claims/new", label: "New claim" },
  { href: "/activity", label: "Activity log" },
  { href: "/policy", label: "Policy" },
];

export function NavLinks() {
  const pathname = usePathname();

  function isActive(href: string) {
    if (href === "/") return pathname === "/" || (pathname.startsWith("/claims/") && pathname !== "/claims/new");
    return pathname.startsWith(href);
  }

  return (
    <nav className="flex flex-wrap gap-1 text-sm">
      {LINKS.map((link) => (
        <Link
          key={link.href}
          href={link.href}
          className={`rounded-md px-3 py-1.5 ${isActive(link.href) ? "bg-slate-900 text-white" : "text-slate-600 hover:bg-slate-100"}`}
        >
          {link.label}
        </Link>
      ))}
    </nav>
  );
}