import { VehicleRowMenu } from "@/components/admin/vehicles/VehicleRowMenu";
import { Card } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { SEAT_TYPE_LABELS } from "@/lib/catalog";
import { rangeText, yearsText } from "@/lib/admin-products-ui/vehicle-form";
import type { AdminVehicleRow } from "@/lib/admin-products-ui/types";

interface VehiclesCardListProps {
  rows: readonly AdminVehicleRow[];
  onToggle: (v: AdminVehicleRow, active: boolean) => void;
  onEdit: (v: AdminVehicleRow) => void;
  onDelete: (v: AdminVehicleRow) => void;
}

/** Mobile (< md): список Card. */
export function VehiclesCardList({ rows, onToggle, onEdit, onDelete }: VehiclesCardListProps) {
  return (
    <ul className="flex flex-col gap-3 md:hidden">
      {rows.map((v) => (
        <li key={v.id}>
          <Card className="gap-3 p-3" data-testid="vehicle-card">
            <div className="flex items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-medium">{v.make} {v.model} <span className="font-mono">{v.generation}</span></p>
                <p className="font-mono text-xs text-muted-foreground tabular-nums">{yearsText(v.year_from, v.year_to)}</p>
              </div>
              <VehicleRowMenu vehicle={v} onEdit={onEdit} onDelete={onDelete} />
            </div>
            <dl className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-xs tabular-nums">
              <div><dt className="inline text-muted-foreground">PCD </dt><dd className="inline">{v.pcd}</dd></div>
              <div><dt className="inline text-muted-foreground">ЦО </dt><dd className="inline">{v.center_bore_mm.toFixed(1)}</dd></div>
              <div><dt className="inline text-muted-foreground">R </dt><dd className="inline">{rangeText(v.diameter_min_in, v.diameter_max_in)}</dd></div>
              <div><dt className="inline text-muted-foreground">J </dt><dd className="inline">{rangeText(v.width_min_in, v.width_max_in)}</dd></div>
              <div><dt className="inline text-muted-foreground">ET </dt><dd className="inline">{rangeText(v.et_min_mm, v.et_max_mm)}</dd></div>
              <div><dt className="inline font-sans text-muted-foreground">Посадка </dt><dd className="inline font-sans">{SEAT_TYPE_LABELS[v.seat_type]}</dd></div>
            </dl>
            <div className="flex items-center justify-between gap-3 text-sm">
              <span className="text-muted-foreground">Подходящих дисков: <span className="font-mono text-foreground tabular-nums">{v.fitting_products_count}</span></span>
              <label className="flex items-center gap-2">
                Активен
                <Switch checked={v.is_active} onCheckedChange={(c) => onToggle(v, c)} />
              </label>
            </div>
          </Card>
        </li>
      ))}
    </ul>
  );
}
