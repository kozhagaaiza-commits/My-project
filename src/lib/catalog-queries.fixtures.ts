import "server-only";
import type { CatalogQueries } from "./catalog-queries";

const notImplemented = (): never => { throw new Error("not implemented"); };

export const fixtureQueries: CatalogQueries = {
  listMakes: async () => notImplemented(),
  listModels: async () => notImplemented(),
  listYears: async () => notImplemented(),
  resolveVehicle: async () => notImplemented(),
  getVehicle: async () => notImplemented(),
  listProducts: async () => notImplemented(),
  getProductBySlug: async () => notImplemented(),
};
