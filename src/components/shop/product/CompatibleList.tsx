interface CompatibleListProps {
  vehicles: string[];
  warrantyMonths: number;
}

/** Для карбона вместо SpecsTable — список «Подходит для» (compatible_vehicles). */
export function CompatibleList({ vehicles, warrantyMonths }: CompatibleListProps) {
  return (
    <section aria-labelledby="compatible-title" className="flex flex-col gap-3">
      <h2 id="compatible-title" className="text-lg font-semibold">Подходит для</h2>
      {vehicles.length > 0 && (
        <ul className="flex flex-col gap-1.5 text-sm">
          {vehicles.map((v) => (
            <li key={v} className="font-mono">{v}</li>
          ))}
        </ul>
      )}
      <p className="text-sm text-muted-foreground">Гарантия {warrantyMonths} мес.</p>
    </section>
  );
}
