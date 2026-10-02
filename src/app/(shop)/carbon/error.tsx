"use client";

import { CatalogError } from "@/components/shop/catalog/CatalogError";

interface CarbonErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function CarbonError({ reset }: CarbonErrorProps) {
  return <CatalogError reset={reset} />;
}
