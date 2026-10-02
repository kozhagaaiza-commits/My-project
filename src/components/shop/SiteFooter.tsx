import Link from "next/link";
import { SITE_NAME } from "@/lib/config";

const FOOTER_LINKS = [
  { href: "/delivery", label: "Доставка" },
  { href: "/warranty", label: "Гарантия и возврат" },
  { href: "/offer", label: "Оферта" },
  { href: "/privacy", label: "Политика ПДн" },
  { href: "/contacts", label: "Контакты" },
];

export function SiteFooter() {
  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:px-6">
        <nav aria-label="Информация">
          <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
            {FOOTER_LINKS.map((l) => (
              <li key={l.href}>
                <Link href={l.href} className="text-silver hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none">
                  {l.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>
        <div className="flex flex-col gap-1 text-sm text-muted-foreground md:flex-row md:justify-between">
          <p>Только по России</p>
          <p>
            © {new Date().getFullYear()} {SITE_NAME}
          </p>
        </div>
      </div>
    </footer>
  );
}
