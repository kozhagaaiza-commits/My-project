import { VehicleRowMenu } from "@/components/admin/vehicles/VehicleRowMenu";
import { Switch } from "@/components/ui/switch";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { SEAT_TYPE_LABELS } from "@/lib/catalog";
import { rangeText, yearsText } from "@/lib/admin-products-ui/vehicle-form";
import type { AdminVehicleRow } from "@/lib/admin-products-ui/types";

interface VehiclesTableProps {
  rows: readonly AdminVehicleRow[];
  onToggle: (v: AdminVehicleRow, active: boolean) => void;
  onEdit: (v: AdminVehicleRow) => void;
  onDelete: (v: AdminVehicleRow) => void;
}

/** md+: таблица; на tablet (md) скрыты «Посадка» и «J». */
export function VehiclesTable({ rows, onToggle, onEdit, onDelete }: VehiclesTableProps) {
  return (
    <div className="hidden rounded-xl border bg-card md:block">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Марка</TableHead>
            <TableHead>Модель</TableHead>
            <TableHead>Поколение</TableHead>
            <TableHead>Годы</TableHead>
            <TableHead>PCD</TableHead>
            <TableHead>ЦО</TableHead>
            <TableHead className="hidden lg:table-cell">Посадка</TableHead>
            <TableHead>R</TableHead>
            <TableHead className="hidden lg:table-cell">J</TableHead>
            <TableHead>ET</TableHead>
            <TableHead className="text-right">Подходящих дисков</TableHead>
            <TableHead>Активен</TableHead>
            <TableHead className="w-12"><span className="sr-only">Действия</span></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {rows.map((v) => (
            <TableRow key={v.id} data-testid="vehicle-row" className={v.is_active ? undefined : "text-muted-foreground"}>
              <TableCell>{v.make}</TableCell>
              <TableCell>{v.model}</TableCell>
              <TableCell className="font-mono">{v.generation}</TableCell>
              <TableCell className="font-mono tabular-nums">{yearsText(v.year_from, v.year_to)}</TableCell>
              <TableCell className="font-mono">{v.pcd}</TableCell>
              <TableCell className="font-mono tabular-nums">{v.center_bore_mm.toFixed(1)}</TableCell>
              <TableCell className="hidden lg:table-cell">{SEAT_TYPE_LABELS[v.seat_type]}</TableCell>
              <TableCell className="font-mono tabular-nums">{rangeText(v.diameter_min_in, v.diameter_max_in)}</TableCell>
              <TableCell className="hidden font-mono tabular-nums lg:table-cell">{rangeText(v.width_min_in, v.width_max_in)}</TableCell>
              <TableCell className="font-mono tabular-nums">{rangeText(v.et_min_mm, v.et_max_mm)}</TableCell>
              <TableCell className="text-right font-mono tabular-nums">{v.fitting_products_count}</TableCell>
              <TableCell>
                <Switch
                  checked={v.is_active}
                  onCheckedChange={(c) => onToggle(v, c)}
                  aria-label={`Активен: ${v.make} ${v.model} ${v.generation}`}
                />
              </TableCell>
              <TableCell><VehicleRowMenu vehicle={v} onEdit={onEdit} onDelete={onDelete} /></TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
