import type { MetadataRoute } from "next";
import { env } from "@/lib/env";

const PATHS = ["/", "/wheels", "/carbon", "/delivery", "/warranty", "/offer", "/privacy", "/contacts"];

// Страницы товаров в карту не включены: каталог читается из БД, а карта собирается статически (см. отчёт Дня 7).
export default function sitemap(): MetadataRoute.Sitemap {
  const base = env.NEXT_PUBLIC_SITE_URL.replace(/\/$/, "");
  return PATHS.map((path) => ({ url: path === "/" ? base : `${base}${path}` }));
}
