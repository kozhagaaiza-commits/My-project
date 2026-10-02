import { NextResponse } from "next/server";

export type ApiErrorCode =
  | "VALIDATION_ERROR" | "UNAUTHORIZED" | "FORBIDDEN" | "NOT_FOUND" | "RATE_LIMITED"
  | "OUT_OF_STOCK" | "PRICE_CHANGED" | "MIXED_KINDS" | "QTY_LIMIT" | "PRODUCT_UNAVAILABLE"
  | "INVALID_STATUS_TRANSITION" | "PAYMENT_PROVIDER_ERROR" | "ORDER_NOT_PAYABLE"
  | "REFUND_EXCEEDS_PAID" | "SLUG_TAKEN" | "SKU_TAKEN" | "IMAGES_LIMIT" | "RATE_NOT_LOADED"
  | "ALREADY_APPLIED" | "FEATURE_DISABLED" | "CONFLICT" | "INTERNAL_ERROR";

export function apiError(code: ApiErrorCode, message: string, status: number, details?: unknown) {
  return NextResponse.json({ error: { code, message, ...(details ? { details } : {}) } }, { status });
}
