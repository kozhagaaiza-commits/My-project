import type { Metadata } from "next";
import { Inter, JetBrains_Mono } from "next/font/google";
import { Toaster } from "@/components/ui/sonner";
import { SITE_NAME } from "@/lib/config";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "cyrillic"],
  variable: "--font-inter",
  display: "swap",
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ["latin", "cyrillic"],
  variable: "--font-jetbrains",
  display: "swap",
});

export const metadata: Metadata = {
  title: `${SITE_NAME} — диски и карбон для Audi, BMW, Mercedes-Benz`,
  description:
    "Кованые и литые диски со склада в Москве, карбоновые детали под заказ. Доставка до 5 дней.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="ru"
      className={`${inter.variable} ${jetbrainsMono.variable} dark`}
    >
      <body className="min-h-screen bg-background text-foreground font-sans antialiased">
        {children}
        <Toaster
          position="top-center"
          mobilePosition="bottom-center"
          theme="dark"
          richColors
        />
      </body>
    </html>
  );
}
