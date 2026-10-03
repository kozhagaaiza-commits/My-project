"use client";

import { useCallback, useEffect, useRef, useState } from "react";

export const ADMIN_SEARCH_DEBOUNCE_MS = 400;

/** Поле поиска: значение обновляется сразу, в URL (onCommit) попадает через 400 мс после последнего ввода. */
export function useDebouncedSearch(initial: string, onCommit: (value: string) => void) {
  const [value, setValue] = useState(initial);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const commitRef = useRef(onCommit);
  useEffect(() => {
    commitRef.current = onCommit;
  }, [onCommit]);
  useEffect(
    () => () => {
      if (timer.current) clearTimeout(timer.current);
    },
    [],
  );

  const onChange = useCallback((next: string) => {
    setValue(next);
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => commitRef.current(next.trim().slice(0, 60)), ADMIN_SEARCH_DEBOUNCE_MS);
  }, []);

  const clear = useCallback(() => {
    if (timer.current) clearTimeout(timer.current);
    setValue("");
    commitRef.current("");
  }, []);

  return { value, onChange, clear };
}
