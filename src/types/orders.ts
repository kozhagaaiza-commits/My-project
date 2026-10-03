// Контракт заказа и оплаты (Чертёж, Блок 3: POST /api/orders, POST /api/orders/[number]/pay; US-003).
// Деньги — целые копейки + *_formatted.

/** 201 ответ POST /api/orders → { data: CreateOrderResponse }. */
export interface CreateOrderResponse {
  order_id: string;
  order_number: string; // FC-26-000123
  total: number;
  total_formatted: string;
  reserved_until: string; // ISO
  confirmation_url: string; // платёжная страница ЮKassa
  order_url: string; // /orders/<number>?t=<token> (абсолютный, от NEXT_PUBLIC_SITE_URL)
}

/** 200 ответ POST /api/orders/[number]/pay → { data: PayOrderResponse }. */
export interface PayOrderResponse {
  confirmation_url: string;
}

/** details для кодов ошибок POST /api/orders (поле error.details). */
export interface PriceChangedDetails {
  expected_total: number;
  actual_total: number;
  actual_total_formatted: string;
}
export interface OutOfStockDetails { product_id: string; available_qty: number }
export interface ProductDetails { product_id: string }
export interface PaymentProviderErrorDetails { order_url: string }
export interface RateLimitedDetails { retry_after_seconds: number }
