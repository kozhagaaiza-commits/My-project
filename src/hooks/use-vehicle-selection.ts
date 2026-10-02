"use client";

import { useState } from "react";
import { useRemoteList, type RemoteStatus } from "@/hooks/use-remote-list";
import type { VehicleOption } from "@/types/catalog";

interface Selection {
  make: string;
  model: string;
  year: string;
  generationId: string;
}

const EMPTY: Selection = { make: "", model: "", year: "", generationId: "" };

export interface RemoteField<T> {
  status: RemoteStatus;
  items: T[];
  retry: () => void;
}

export interface VehicleSelectionState {
  selection: Selection;
  makes: RemoteField<string>;
  models: RemoteField<string>;
  years: RemoteField<number>;
  generations: RemoteField<VehicleOption>;
  /** Поколений несколько → выбор обязателен (Edge Case 19). */
  needsGeneration: boolean;
  /** Определённый автомобиль; null, пока не выбраны все поля. */
  vehicle: VehicleOption | null;
  setMake: (value: string) => void;
  setModel: (value: string) => void;
  setYear: (value: string) => void;
  setGeneration: (value: string) => void;
}

const q = encodeURIComponent;

function field<T>(r: ReturnType<typeof useRemoteList<T[]>>): RemoteField<T> {
  return { status: r.status, items: r.data ?? [], retry: r.retry };
}

export function useVehicleSelection(): VehicleSelectionState {
  const [selection, setSelection] = useState<Selection>(EMPTY);
  const { make, model, year, generationId } = selection;

  const makes = useRemoteList<string[]>("/api/vehicles/makes");
  const models = useRemoteList<string[]>(make ? `/api/vehicles/models?make=${q(make)}` : null);
  const years = useRemoteList<number[]>(make && model ? `/api/vehicles/years?make=${q(make)}&model=${q(model)}` : null);
  const generations = useRemoteList<VehicleOption[]>(
    make && model && year ? `/api/vehicles/resolve?make=${q(make)}&model=${q(model)}&year=${q(year)}` : null,
  );

  const options = generations.data ?? [];
  const needsGeneration = options.length > 1;
  const vehicle =
    generations.status !== "ready" ? null
    : options.length === 1 ? options[0]
    : options.find((o) => o.id === generationId) ?? null;

  return {
    selection,
    makes: field(makes),
    models: field(models),
    years: field(years),
    generations: field(generations),
    needsGeneration,
    vehicle,
    setMake: (value) => setSelection({ ...EMPTY, make: value }),
    setModel: (value) => setSelection({ ...EMPTY, make, model: value }),
    setYear: (value) => setSelection({ ...EMPTY, make, model, year: value }),
    setGeneration: (value) => setSelection({ ...selection, generationId: value }),
  };
}
