import type { Metadata } from "next";
import { ForgotPasswordForm } from "@/components/shop/auth/ForgotPasswordForm";

export const metadata: Metadata = { title: "Восстановление пароля" };

export default function ForgotPasswordPage() {
  const fixtures = process.env.NODE_ENV !== "production" && process.env.AUTH_FIXTURES === "1";
  return <ForgotPasswordForm fixtures={fixtures} />;
}
