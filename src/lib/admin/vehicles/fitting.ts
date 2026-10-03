import type { AdminVehiclesRepo } from "./repo";

// fitting_products_count для страницы списка: по одному RPC на автомобиль (функция принимает один id),
// не больше FITTING_CONCURRENCY запросов одновременно, чтобы не забивать пул соединений PostgREST.

export const FITTING_CONCURRENCY = 5;

/** map с ограничением параллелизма; порядок результатов = порядок входа, первая ошибка отклоняет промис. */
export async function mapLimit<T, R>(items: readonly T[], limit: number, fn: (item: T) => Promise<R>): Promise<R[]> {
  const out = new Array<R>(items.length);
  let next = 0;
  const worker = async () => {
    while (next < items.length) {
      const i = next++;
      out[i] = await fn(items[i]);
    }
  };
  await Promise.all(Array.from({ length: Math.min(Math.max(1, limit), items.length) }, worker));
  return out;
}

export function fittingCounts(repo: Pick<AdminVehiclesRepo, "fittingWheelsCount">, ids: readonly string[]): Promise<number[]> {
  return mapLimit(ids, FITTING_CONCURRENCY, (id) => repo.fittingWheelsCount(id));
}
