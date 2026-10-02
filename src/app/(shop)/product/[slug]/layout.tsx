import { notFound } from "next/navigation";
import { loadProduct } from "@/components/shop/product/load-product";

/**
 * Проверка существования товара ДО потока loading.tsx: пока тело ответа не начало стримиться,
 * notFound() даёт настоящий HTTP 404 (иначе при loading.tsx статус был бы 200).
 * Сбой чтения не превращаем в 404 — его покажет error.tsx сегмента при рендере страницы.
 */
export default async function ProductLayout({ children, params }: LayoutProps<"/product/[slug]">) {
  const { slug } = await params;
  let missing = false;
  try {
    missing = (await loadProduct(slug, "")) === null;
  } catch {
    missing = false;
  }
  if (missing) notFound();
  return children;
}
