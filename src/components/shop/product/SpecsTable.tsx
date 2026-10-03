import { Table, TableBody, TableCell, TableRow } from "@/components/ui/table";
import type { ProductDetail } from "@/types/catalog";

interface SpecsTableProps {
  specs: NonNullable<ProductDetail["specs"]>;
  warrantyMonths: number;
  /** Приходят только при claims_verified = true; пустой список — строка не выводится. */
  certifications: string[];
}

const pair = (front: string, rear: string | null) => (rear === null || rear === front ? front : `${front} / ${rear}`);
const yesNo = (v: boolean) => (v ? "да" : "нет");

/** Характеристики диска (Блок 4: SpecsTable, shadcn Table, значения — mono). */
export function SpecsTable({ specs, warrantyMonths, certifications }: SpecsTableProps) {
  const rows: Array<[string, string]> = [
    ["Диаметр", `R${specs.diameter_in}`],
    ["Ширина", pair(`${specs.width_front_in}J`, specs.width_rear_in === null ? null : `${specs.width_rear_in}J`)],
    ["Вылет", pair(`ET${specs.et_front_mm}`, specs.et_rear_mm === null ? null : `ET${specs.et_rear_mm}`)],
    ["Разболтовка", specs.pcd.replace("x", "×")],
    ["ЦО", `${specs.center_bore_mm} мм`],
    ["Посадка крепежа", specs.seat_type_label],
    ["Конструкция", specs.construction_label],
  ];
  if (specs.finish) rows.push(["Покрытие", specs.finish]);
  if (specs.weight_kg !== null) rows.push(["Вес диска", `${specs.weight_kg} кг`]);
  rows.push(
    ["Кольца в комплекте", yesNo(specs.includes_hub_rings)],
    ["Крепёж в комплекте", yesNo(specs.includes_fasteners)],
    ["Гарантия", `${warrantyMonths} мес.`],
  );
  if (certifications.length > 0) rows.push(["Сертификации", certifications.join(", ")]);

  return (
    <section aria-labelledby="specs-title" className="flex flex-col gap-3">
      <h2 id="specs-title" className="text-lg font-semibold">Характеристики</h2>
      <Table>
        <TableBody>
          {rows.map(([label, value]) => (
            <TableRow key={label}>
              <TableCell className="w-2/5 text-muted-foreground">{label}</TableCell>
              <TableCell className="font-mono">{value}</TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </section>
  );
}
