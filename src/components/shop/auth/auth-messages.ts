import type { AuthFailure } from "@/lib/auth-client";

// Тексты ошибок экранов auth (Блок 4, «Вход, Регистрация, Восстановление пароля» → Error).
export const AUTH_FAILURE_MESSAGES: Record<AuthFailure, string> = {
  invalid_credentials: "Неверный email или пароль",
  email_not_confirmed: "Подтвердите email. Отправить письмо повторно?",
  already_registered: "Этот email уже зарегистрирован.",
  rate_limited: "Слишком много попыток. Повторите через минуту",
  link_expired: "Ссылка устарела. Запросите новую",
  same_password: "Новый пароль должен отличаться от прежнего",
  weak_password: "8–72 символа, минимум одна буква и одна цифра",
  unknown: "Не удалось выполнить запрос. Повторите попытку",
};

export const LINK_EXPIRED_LOGIN_MESSAGE = "Ссылка устарела. Войдите, мы отправим новую";
