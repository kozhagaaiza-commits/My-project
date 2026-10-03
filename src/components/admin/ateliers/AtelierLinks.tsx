import { ExternalLink } from "lucide-react";
import { EGRUL_URL } from "@/lib/admin-ui/ateliers-query";

/** ИНН (mono) + «Проверить» в ЕГРЮЛ (новая вкладка). */
export function InnCell({ inn }: { inn: string }) {
  return (
    <span className="flex flex-wrap items-center gap-x-2">
      <span className="font-mono tabular-nums">{inn}</span>
      <a
        href={EGRUL_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="inline-flex items-center gap-1 text-xs text-silver underline-offset-4 hover:underline max-lg:min-h-11"
      >
        Проверить
        <ExternalLink className="size-3" aria-hidden />
      </a>
    </span>
  );
}

/** Ссылка только для http(s): в заявке пользователь может ввести произвольную схему (javascript:). */
function safeUrl(value: string): string | null {
  try {
    const url = new URL(value);
    return url.protocol === "http:" || url.protocol === "https:" ? url.href : null;
  } catch {
    return null;
  }
}

export function WebsiteCell({ website }: { website: string | null }) {
  if (!website) return <span className="text-muted-foreground">—</span>;
  const href = safeUrl(website);
  if (!href) return <span className="break-all">{website}</span>;
  return (
    <a href={href} target="_blank" rel="noopener noreferrer" className="break-all text-silver underline-offset-4 hover:underline max-lg:inline-flex max-lg:min-h-11 max-lg:items-center">
      {website}
    </a>
  );
}
