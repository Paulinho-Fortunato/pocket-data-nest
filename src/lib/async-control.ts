/**
 * Small, dependency-free async primitives used by uploads, IndexedDB and the
 * agent loop. Every long operation must be able to finish, time out or be
 * aborted — no promise is allowed to stay pending forever.
 */

export class TimeoutError extends Error {
  readonly code = "TIMEOUT";
  readonly timeoutMs: number;

  constructor(message: string, timeoutMs: number) {
    super(message);
    this.name = "TimeoutError";
    this.timeoutMs = timeoutMs;
  }
}

export function isAbortError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const name = (error as { name?: unknown }).name;
  return name === "AbortError" || name === "TimeoutError";
}

export function abortError(message = "Operação cancelada."): DOMException {
  return new DOMException(message, "AbortError");
}

export function throwIfAborted(signal?: AbortSignal | null): void {
  if (signal?.aborted) throw abortError();
}

export type TimeoutOptions = {
  signal?: AbortSignal | null | undefined;
  /** Called once when the deadline is reached (e.g. to abort the real work). */
  onTimeout?: (() => void) | undefined;
  message?: string | undefined;
};

/**
 * Resolves/rejects with `promise`, but rejects with `TimeoutError` after
 * `timeoutMs` and with `AbortError` as soon as the signal aborts. The timer and
 * listeners are always removed.
 */
export function withTimeout<T>(
  promise: Promise<T>,
  timeoutMs: number,
  label: string,
  options: TimeoutOptions = {},
): Promise<T> {
  const signal = options.signal ?? null;
  if (signal?.aborted) {
    promise.catch(() => undefined);
    return Promise.reject(abortError());
  }
  return new Promise<T>((resolve, reject) => {
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      signal?.removeEventListener("abort", onAbort);
      fn();
    };
    const onAbort = () => finish(() => reject(abortError()));
    const timer = setTimeout(() => {
      finish(() => {
        reject(
          new TimeoutError(
            options.message ?? `${label} demorou mais de ${Math.round(timeoutMs / 1000)} s.`,
            timeoutMs,
          ),
        );
      });
      options.onTimeout?.();
    }, timeoutMs);
    signal?.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => finish(() => resolve(value)),
      (error) => finish(() => reject(error)),
    );
  });
}

/** Rejects as soon as `signal` aborts, otherwise waits for `promise`. */
export function raceAbort<T>(
  promise: Promise<T>,
  signal?: AbortSignal | null,
  label = "Operação",
): Promise<T> {
  if (!signal) return promise;
  if (signal.aborted) {
    promise.catch(() => undefined);
    return Promise.reject(abortError());
  }
  return new Promise<T>((resolve, reject) => {
    const onAbort = () => {
      signal.removeEventListener("abort", onAbort);
      reject(abortError(`${label} cancelada.`));
    };
    signal.addEventListener("abort", onAbort, { once: true });
    promise.then(
      (value) => {
        signal.removeEventListener("abort", onAbort);
        resolve(value);
      },
      (error) => {
        signal.removeEventListener("abort", onAbort);
        reject(error);
      },
    );
  });
}

/** Yields to the event loop so the browser can paint progress. */
export function yieldToEventLoop(): Promise<void> {
  return new Promise((resolve) => {
    if (typeof setTimeout === "function") setTimeout(resolve, 0);
    else resolve();
  });
}

export function createOperationId(prefix = "op"): string {
  const cryptoApi = typeof crypto !== "undefined" ? crypto : undefined;
  if (cryptoApi && typeof cryptoApi.randomUUID === "function") {
    return `${prefix}_${cryptoApi.randomUUID()}`;
  }
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}
