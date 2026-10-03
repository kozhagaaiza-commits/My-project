import { toast as sonner } from "sonner";

// Тосты админки всегда сверху: на mobile/tablet снизу прибита панель статусов заказа (глобальный mobilePosition — bottom-center).
const position = "top-center" as const;

export const toast = {
  success: (message: string) => sonner.success(message, { position }),
  error: (message: string) => sonner.error(message, { position }),
};
