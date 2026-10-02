"use client";

import { useMemo, useSyncExternalStore } from "react";

const KEY = "fc_vehicle";
const CHANGE_EVENT = "fc:vehicle-change";

export interface StoredVehicle {
  id: string;
  label: string;
}

function readRaw(): string | null {
  try {
    return window.localStorage.getItem(KEY);
  } catch {
    return null; // localStorage недоступен (Edge Case 17)
  }
}

function parse(raw: string | null): StoredVehicle | null {
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null) return null;
    const { id, label } = value as Record<string, unknown>;
    if (typeof id !== "string" || typeof label !== "string" || !id || !label) return null;
    return { id, label };
  } catch {
    return null; // повреждённые данные считаем пустыми
  }
}

export function readStoredVehicle(): StoredVehicle | null {
  return parse(readRaw());
}

export function writeStoredVehicle(vehicle: StoredVehicle): void {
  try {
    window.localStorage.setItem(KEY, JSON.stringify({ id: vehicle.id, label: vehicle.label }));
  } catch {
    // без localStorage автомобиль живёт только в URL
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

export function clearStoredVehicle(): void {
  try {
    window.localStorage.removeItem(KEY);
  } catch {
    // нечего очищать
  }
  window.dispatchEvent(new Event(CHANGE_EVENT));
}

function subscribe(onChange: () => void): () => void {
  const onStorage = (e: StorageEvent) => {
    if (e.key === KEY || e.key === null) onChange();
  };
  window.addEventListener("storage", onStorage);
  window.addEventListener(CHANGE_EVENT, onChange);
  return () => {
    window.removeEventListener("storage", onStorage);
    window.removeEventListener(CHANGE_EVENT, onChange);
  };
}

/** Выбранный автомобиль из localStorage.fc_vehicle; на сервере и до гидратации — null. */
export function useStoredVehicle(): StoredVehicle | null {
  const raw = useSyncExternalStore(subscribe, readRaw, () => null);
  return useMemo(() => parse(raw), [raw]);
}
