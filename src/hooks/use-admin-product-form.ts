"use client";

import { useCallback, useMemo, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { useForm, type FieldPath, type UseFormReturn } from "react-hook-form";
import { toast } from "sonner";
import { useUnsavedChangesWarning } from "@/hooks/use-admin-products-unsaved";
import { adminRequest, errorText } from "@/lib/admin-products-ui/api";
import { makeProductResolver, splitProductFieldErrors, type ProductResolverContext } from "@/lib/admin-products-ui/product-form-body";
import { EMPTY_PRODUCT_VALUES, valuesFromDetail, type ProductFormValues } from "@/lib/admin-products-ui/product-form-values";
import type { ProductUpsertBody } from "@/lib/admin-products-ui/schemas";
import { slugifyTitle } from "@/lib/admin-products-ui/translit";
import type { AdminImage, AdminProductDetail, AdminProductStatus, AdminSettings, SaveProductResult } from "@/lib/admin-products-ui/types";

export type ProductForm = UseFormReturn<ProductFormValues, ProductResolverContext, ProductUpsertBody>;

interface Options {
  /** null — новый товар (/admin/products/new). */
  detail: AdminProductDetail | null;
  settings: AdminSettings | null;
  images: readonly AdminImage[];
}

const SAVED_DRAFT_TEXT = "Черновик сохранён. Добавьте фото";
const NO_PHOTO_TEXT = "Добавьте хотя бы одно фото";

/** Сохранённые на сервере значения: нормализация как у схемы (trim, регистр), чтобы форма не считалась изменённой. */
const normalized = (v: ProductFormValues): ProductFormValues => ({
  ...v,
  title: v.title.trim(),
  manufacturer: v.manufacturer.trim(),
  sku: v.sku.trim().toUpperCase(),
  slug: v.slug.trim().toLowerCase(),
  description: v.description.trim(),
});

/**
 * Форма товара: RHF + productUpsertBody, автогенерация slug, сохранение (POST/PATCH), раскладка ошибок сервера
 * (SLUG_TAKEN, SKU_TAKEN, RATE_NOT_LOADED, CONFLICT, details.fields), предупреждение при уходе.
 */
export function useAdminProductForm({ detail, settings, images }: Options) {
  const router = useRouter();
  const context = useMemo<ProductResolverContext>(() => ({ settings }), [settings]);
  const form: ProductForm = useForm<ProductFormValues, ProductResolverContext, ProductUpsertBody>({
    context,
    defaultValues: detail ? valuesFromDetail(detail) : EMPTY_PRODUCT_VALUES,
    mode: "onSubmit",
    reValidateMode: "onChange",
    shouldFocusError: true,
    resolver: makeProductResolver(),
  });

  const slugTouched = useRef(detail !== null);
  const [saved, setSaved] = useState<{ status: AdminProductStatus; updatedAt: string } | null>(
    detail ? { status: detail.status, updatedAt: detail.updated_at } : null,
  );
  const [slugSuggestion, setSlugSuggestion] = useState<string | null>(null);
  const [rateError, setRateError] = useState<string | null>(null);
  const [imagesError, setImagesError] = useState<string | null>(null);
  const [conflict, setConflict] = useState(false);

  useUnsavedChangesWarning(form.formState.isDirty);

  const onTitleChange = useCallback(
    (title: string) => {
      if (slugTouched.current) return;
      form.setValue("slug", slugifyTitle(title), { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
    },
    [form],
  );
  const onSlugEdit = useCallback(() => {
    slugTouched.current = true;
    setSlugSuggestion(null);
  }, []);
  const regenerateSlug = useCallback(() => {
    slugTouched.current = false;
    setSlugSuggestion(null);
    form.setValue("slug", slugifyTitle(form.getValues("title")), { shouldDirty: true, shouldValidate: form.formState.isSubmitted });
  }, [form]);
  const applySuggestion = useCallback(() => {
    if (!slugSuggestion) return;
    slugTouched.current = true;
    form.setValue("slug", slugSuggestion, { shouldDirty: true, shouldValidate: true });
    setSlugSuggestion(null);
  }, [form, slugSuggestion]);

  const handleFailure = useCallback(
    (r: Extract<Awaited<ReturnType<typeof adminRequest>>, { ok: false }>) => {
      if (r.kind === "network") return void toast.error(errorText(r));
      const name = (n: string, message: string) => form.setError(n as FieldPath<ProductFormValues>, { type: "server", message });
      if (r.code === "SLUG_TAKEN") {
        const s = (r.details as { suggestion?: unknown } | undefined)?.suggestion;
        const suggestion = typeof s === "string" ? s : null;
        setSlugSuggestion(suggestion);
        name("slug", suggestion ? `Такой адрес уже используется: ${suggestion}` : r.message);
        return form.setFocus("slug");
      }
      if (r.code === "SKU_TAKEN") {
        name("sku", r.message);
        return form.setFocus("sku");
      }
      if (r.code === "RATE_NOT_LOADED") return setRateError(r.message);
      if (r.code === "CONFLICT") return setConflict(true);
      if (r.code === "VALIDATION_ERROR") {
        const { fields, unmapped } = splitProductFieldErrors(r.details);
        fields.forEach((f) => name(f.name, f.message));
        const photo = unmapped.find((u) => u.name === "images");
        if (photo) setImagesError(photo.message);
        if (fields[0]) form.setFocus(fields[0].name as FieldPath<ProductFormValues>);
        if (fields.length === 0 && !photo) toast.error(unmapped[0]?.message ?? r.message);
        return;
      }
      toast.error(r.message);
    },
    [form],
  );

  /** Сохранить со статусом. Новый товар всегда сохраняется черновиком (фото грузятся после создания). */
  const save = useCallback(
    (status: AdminProductStatus) =>
      form.handleSubmit(
        async (body) => {
          setSlugSuggestion(null);
          setRateError(null);
          setImagesError(null);
          if (status === "active" && images.length === 0) {
            setImagesError(NO_PHOTO_TEXT);
            return;
          }
          const values = normalized(form.getValues());
          if (!detail) {
            const r = await adminRequest<SaveProductResult>("POST", "/api/admin/products", { ...body, status: "draft" });
            if (!r.ok) return handleFailure(r);
            form.reset(values);
            toast.success(SAVED_DRAFT_TEXT);
            router.replace(`/admin/products/${r.data.id}`);
            return;
          }
          const r = await adminRequest<SaveProductResult>("PATCH", `/api/admin/products/${detail.id}`, {
            ...body, status, updated_at: saved?.updatedAt ?? detail.updated_at,
          });
          if (!r.ok) return handleFailure(r);
          form.reset(values);
          setSaved({ status: r.data.status ?? status, updatedAt: r.data.updated_at ?? saved?.updatedAt ?? detail.updated_at });
          toast.success(status === "active" && saved?.status !== "active" ? "Товар опубликован" : "Сохранено");
        },
        () => toast.error("Проверьте поля формы"),
      )(),
    [detail, form, handleFailure, images.length, router, saved],
  );

  return {
    form, save, saved, conflict, setConflict, slugSuggestion, rateError, imagesError, setRateError, setImagesError,
    onTitleChange, onSlugEdit, regenerateSlug, applySuggestion,
  };
}
