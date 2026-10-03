// Клиент витрины: POST /api/ateliers (Чертёж, Блок 3); статус — GET /api/ateliers/me через useAdminResource. Никогда не бросает: ошибки возвращаются как { ok: false }.
import type { AtelierApplied } from "@/types/ateliers";

export interface AtelierApiFailure {
  ok: false;
  status: number; // 0 — нет сети
  code: string;
  message: string;
  fields: Record<string, string>;
}

export type AtelierApiResult<T> = { ok: true; data: T } | AtelierApiFailure;

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === "object" && v !== null && !Array.isArray(v);

function fieldsOf(details: unknown): Record<string, string> {
  const fields = isRecord(details) ? details.fields : null;
  const out: Record<string, string> = {};
  if (isRecord(fields)) {
    for (const [key, value] of Object.entries(fields)) {
      if (Array.isArray(value) && typeof value[0] === "string") out[key] = value[0];
    }
  }
  return out;
}

export async function submitAtelierApplication(body: unknown): Promise<AtelierApiResult<AtelierApplied>> {
  try {
    const res = await fetch("/api/ateliers", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
    });
    let raw: unknown = null;
    try {
      raw = await res.json();
    } catch {
      // не JSON — разберём по статусу
    }
    const payload = isRecord(raw) ? raw : {};
    if (res.ok && "data" in payload) return { ok: true, data: payload.data as AtelierApplied };
    const err = isRecord(payload.error) ? payload.error : {};
    return {
      ok: false,
      status: res.status,
      code: typeof err.code === "string" ? err.code : "INTERNAL_ERROR",
      message: typeof err.message === "string" ? err.message : "",
      fields: fieldsOf(err.details),
    };
  } catch {
    return { ok: false, status: 0, code: "NETWORK_ERROR", message: "", fields: {} };
  }
}
