import { Mail, Send } from "lucide-react";
import Link from "next/link";
import { SITE_NAME } from "@/lib/config";
import { env } from "@/lib/env";
import { SELLER_INN, SELLER_NAME, SELLER_OGRNIP } from "@/lib/legal";

const FOOTER_LINKS = [
  { href: "/delivery", label: "Доставка" },
  { href: "/warranty", label: "Гарантия и возврат" },
  { href: "/offer", label: "Оферта" },
  { href: "/privacy", label: "Политика ПДн" },
  { href: "/contacts", label: "Контакты" },
];

const linkClass = "max-md:inline-flex max-md:min-h-11 max-md:items-center hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring focus-visible:outline-none";

export function SiteFooter() {
  const requisites = [SELLER_NAME, SELLER_INN && `ИНН ${SELLER_INN}`, SELLER_OGRNIP && `ОГРНИП ${SELLER_OGRNIP}`]
    .filter(Boolean)
    .join(" · ");

  return (
    <footer className="border-t border-border">
      <div className="mx-auto flex max-w-7xl flex-col gap-6 px-4 py-8 md:px-6">
        <div className="flex flex-col gap-6 md:flex-row md:justify-between">
          <nav aria-label="Информация">
            <ul className="flex flex-wrap gap-x-6 gap-y-2 text-sm">
              {FOOTER_LINKS.map((l) => (
                <li key={l.href}>
                  <Link href={l.href} className={`text-silver ${linkClass}`}>
                    {l.label}
                  </Link>
                </li>
              ))}
            </ul>
          </nav>
          <ul className="flex flex-col gap-2 text-sm text-silver sm:flex-row sm:gap-6">
            <li>
              <a href={`https://t.me/${env.TELEGRAM_BOT_USERNAME}`} className={`inline-flex items-center gap-2 ${linkClass}`}>
                <Send className="size-4" aria-hidden="true" />
                Telegram
              </a>
            </li>
            <li>
              <a href={`mailto:${env.SMTP_USER}`} className={`inline-flex items-center gap-2 ${linkClass}`}>
                <Mail className="size-4" aria-hidden="true" />
                {env.SMTP_USER}
              </a>
            </li>
          </ul>
        </div>
        <div className="flex flex-col gap-1 text-sm text-muted-foreground md:flex-row md:justify-between">
          <p>Только по России{requisites ? ` · ${requisites}` : ""}</p>
          <p>
            © {new Date().getFullYear()} {SITE_NAME}
          </p>
        </div>
      </div>
    </footer>
  );
}
