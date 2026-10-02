import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Фото из Supabase Storage отдаются как есть (Блок 4.0 / CLAUDE.md: images.unoptimized).
  images: { unoptimized: true },
};

export default nextConfig;
