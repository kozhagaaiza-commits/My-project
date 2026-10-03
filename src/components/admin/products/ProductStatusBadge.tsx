import { Badge } from "@/components/ui/badge";
import { PRODUCT_STATUS_LABELS } from "@/lib/admin-products-ui/labels";
import type { AdminProductStatus } from "@/lib/admin-products-ui/types";

const VARIANT = { active: "default", draft: "secondary", archived: "outline" } as const;

export function ProductStatusBadge({ status }: { status: AdminProductStatus }) {
  return (
    <Badge variant={VARIANT[status]} className={status === "archived" ? "text-muted-foreground" : undefined}>
      {PRODUCT_STATUS_LABELS[status]}
    </Badge>
  );
}
