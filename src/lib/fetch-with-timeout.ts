export async function fetchWithTimeout(
  input: RequestInfo | URL,
  init: RequestInit & {
    timeoutMs?: number;
    timeoutMessage?: string;
  } = {},
) {
  const { timeoutMs = 10_000, timeoutMessage = "The request took too long to finish.", signal, ...requestInit } = init;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(timeoutMessage), timeoutMs);

  if (signal) {
    if (signal.aborted) {
      controller.abort();
    } else {
      signal.addEventListener("abort", () => controller.abort(), { once: true });
    }
  }

  try {
    return await fetch(input, {
      ...requestInit,
      signal: controller.signal,
    });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") {
      throw new Error(timeoutMessage);
    }

    throw error;
  } finally {
    window.clearTimeout(timeout);
  }
}

export async function promiseWithTimeout<T>(
  promise: Promise<T>,
  {
    timeoutMs = 10_000,
    timeoutMessage = "The operation took too long to finish.",
  }: {
    timeoutMs?: number;
    timeoutMessage?: string;
  } = {},
) {
  let timeoutId: number | null = null;

  const timeoutPromise = new Promise<T>((_, reject) => {
    timeoutId = window.setTimeout(() => {
      reject(new Error(timeoutMessage));
    }, timeoutMs);
  });

  try {
    return await Promise.race([promise, timeoutPromise]);
  } finally {
    if (timeoutId !== null) {
      window.clearTimeout(timeoutId);
    }
  }
}
