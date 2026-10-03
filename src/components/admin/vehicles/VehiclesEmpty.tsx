import { Plus } from "lucide-react";
import { Button } from "@/components/ui/button";

interface VehiclesEmptyProps {
  filtered: boolean;
  onAdd: () => void;
  onReset: () => void;
}

export function VehiclesEmpty({ filtered, onAdd, onReset }: VehiclesEmptyProps) {
  return (
    <div className="flex flex-col items-center gap-4 rounded-xl border border-dashed py-12 text-center">
      {filtered ? (
        <>
          <p className="text-muted-foreground">Ничего не найдено</p>
          <Button type="button" variant="outline" onClick={onReset}>Сбросить фильтры</Button>
        </>
      ) : (
        <>
          <p className="max-w-sm text-lg font-medium">Справочник пуст. Выполните seed или добавьте автомобиль</p>
          <Button type="button" onClick={onAdd}>
            <Plus aria-hidden />
            Добавить авто
          </Button>
        </>
      )}
    </div>
  );
}
