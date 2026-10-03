// Slug из названия: русская транслитерация (близко к ГОСТ 7.79 «система Б») + «×» → «x».
// Результат подходит под ^[a-z0-9]+(-[a-z0-9]+)*$, не длиннее 120 символов (productUpsertBody.slug).

const MAP: Record<string, string> = {
  а: "a", б: "b", в: "v", г: "g", д: "d", е: "e", ё: "e", ж: "zh", з: "z", и: "i", й: "y", к: "k", л: "l",
  м: "m", н: "n", о: "o", п: "p", р: "r", с: "s", т: "t", у: "u", ф: "f", х: "kh", ц: "ts", ч: "ch",
  ш: "sh", щ: "shch", ъ: "", ы: "y", ь: "", э: "e", ю: "yu", я: "ya", "×": "x",
};

export const SLUG_MAX = 120;

export function slugifyTitle(title: string): string {
  const latin = Array.from(title.toLowerCase())
    .map((ch) => MAP[ch] ?? ch)
    .join("");
  const slug = latin
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  if (slug.length <= SLUG_MAX) return slug;
  return slug.slice(0, SLUG_MAX).replace(/-[^-]*$/, "").replace(/-+$/, "") || slug.slice(0, SLUG_MAX);
}
