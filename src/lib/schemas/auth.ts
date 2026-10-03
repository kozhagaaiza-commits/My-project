import { z } from "zod";
import { email, phoneRu } from "./common";

// Аутентификация (Блок 5.1): пароль 8–72 символа, минимум одна буква и одна цифра; имя 2–100; повтор совпадает.
// Одна схема на клиенте (zodResolver) и в проверках сервера.

export const PASSWORD_RE = /^(?=.*[A-Za-zА-Яа-я])(?=.*\d).{8,72}$/;
export const PASSWORD_MESSAGE = "8–72 символа, минимум одна буква и одна цифра";

export const password = z.string().regex(PASSWORD_RE, PASSWORD_MESSAGE);
const fullName = z.string().trim().min(2, "Минимум 2 символа").max(100, "Не больше 100 символов");

/** Вход: пароль не перепроверяется по правилам регистрации (старые пароли), только непустой. */
export const loginBody = z.object({
  email,
  password: z.string().min(1, "Введите пароль").max(72, "Не больше 72 символов"),
});

export const registerBody = z.object({ full_name: fullName, email, password });

export const forgotPasswordBody = z.object({ email });

export const updatePasswordBody = z.object({
  password,
  password_repeat: z.string().min(1, "Повторите пароль"),
}).refine((v) => v.password === v.password_repeat, { path: ["password_repeat"], message: "Пароли не совпадают" });

/** Профиль: обновляются только full_name и phone (колоночные права 2.1). Пустой телефон → null. */
export const profileBody = z.object({
  full_name: fullName,
  phone: z.union([z.literal("").transform(() => null), phoneRu]),
});

export type LoginValues = z.input<typeof loginBody>;
export type RegisterValues = z.input<typeof registerBody>;
export type ForgotPasswordValues = z.input<typeof forgotPasswordBody>;
export type UpdatePasswordValues = z.input<typeof updatePasswordBody>;
export type ProfileValues = z.input<typeof profileBody>;
