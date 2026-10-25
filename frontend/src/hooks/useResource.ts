import { useCallback, useEffect, useRef, useState } from "react";
import { ApiError } from "../lib/api";

interface ResourceState<T> {
  data: T | null;
  loading: boolean;
  error: string | null;
}

/**
 * Small data-fetching helper: runs an async loader when dependencies change
 * and exposes a stable refresh function. Aborts stale requests on cleanup.
 */
export function useResource<T>(
  loader: (signal: AbortSignal) => Promise<T>,
  deps: unknown[] = [],
  options: { enabled?: boolean } = {},
) {
  const { enabled = true } = options;
  const [state, setState] = useState<ResourceState<T>>({
    data: null,
    loading: enabled,
    error: null,
  });
  const [version, setVersion] = useState(0);
  const loaderRef = useRef(loader);
  loaderRef.current = loader;

  useEffect(() => {
    if (!enabled) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    const controller = new AbortController();
    let cancelled = false;
    setState((current) => ({ ...current, loading: true, error: null }));

    loaderRef
      .current(controller.signal)
      .then((data) => {
        if (!cancelled) setState({ data, loading: false, error: null });
      })
      .catch((error: unknown) => {
        if (cancelled || (error as Error).name === "AbortError") return;
        const message =
          error instanceof ApiError
            ? error.message
            : error instanceof Error
              ? error.message
              : "Unable to load this data.";
        setState({ data: null, loading: false, error: message });
      });

    return () => {
      cancelled = true;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, enabled, version]);

  const refresh = useCallback(() => setVersion((value) => value + 1), []);
  const setData = useCallback(
    (updater: T | ((current: T | null) => T)) =>
      setState((current) => ({
        ...current,
        data:
          typeof updater === "function"
            ? (updater as (current: T | null) => T)(current.data)
            : updater,
      })),
    [],
  );

  return { ...state, refresh, setData };
}

export function useNow(intervalMs = 1000): Date {
  const [now, setNow] = useState(() => new Date());
  useEffect(() => {
    const timer = window.setInterval(() => setNow(new Date()), intervalMs);
    return () => window.clearInterval(timer);
  }, [intervalMs]);
  return now;
}
