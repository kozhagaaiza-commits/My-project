import type { NextConfig } from "next";
import { PHASE_PRODUCTION_BUILD } from "next/constants";
import { emptyLegalConstants } from "./src/lib/legal";
import { securityHeaders } from "./src/lib/security-headers";

// Блок 4 «Статичные страницы»: сборка падает, пока реквизиты продавца в src/lib/legal.ts пусты.
// Обход LEGAL_CHECK=skip (отступление, Приложение A) — только вне production-деплоя (VERCEL_ENV !== "production").
function assertLegalFilled(phase: string): void {
  // `next typegen` тоже идёт в фазе production-build — проверяем только настоящую `next build`.
  if (phase !== PHASE_PRODUCTION_BUILD || !process.argv.includes("build")) return;
  const empty = emptyLegalConstants();
  if (empty.length === 0) return;
  if (process.env.LEGAL_CHECK === "skip" && process.env.VERCEL_ENV !== "production") return;
  throw new Error(`src/lib/legal.ts: заполните константы продавца перед сборкой: ${empty.join(", ")}`);
}

const nextConfig: NextConfig = {
  // Фото из Supabase Storage отдаются как есть (Блок 4.0 / CLAUDE.md: images.unoptimized).
  images: { unoptimized: true },
  // Блок 5.10: заголовки безопасности + CSP (src/lib/security-headers.ts).
  async headers() {
    const headers = securityHeaders({ production: process.env.NODE_ENV === "production", supabaseUrl: process.env.NEXT_PUBLIC_SUPABASE_URL });
    return [{ source: "/(.*)", headers }];
  },
};

const withLegalCheck = (phase: string): NextConfig => {
  assertLegalFilled(phase);
  return nextConfig;
};

export default withLegalCheck;
