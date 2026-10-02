"use client";

import { CatalogError } from "@/components/shop/catalog/CatalogError";

interface WheelsErrorProps {
  error: Error & { digest?: string };
  reset: () => void;
}

export default function WheelsError({ reset }: WheelsErrorProps) {
  return <CatalogError reset={reset} />;
}
