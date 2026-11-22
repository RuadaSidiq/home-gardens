/** Errors that are safe to show to the user. Anything else is logged and replaced with a generic message. */
export class UserError extends Error {
  constructor(message: string, public field?: string) {
    super(message);
  }
}

export type ActionResult<T = undefined> =
  | { ok: true; data?: T; message?: string }
  | { ok: false; error: string; fieldErrors?: Record<string, string> };

export async function reportError(err: unknown, context: Record<string, unknown> = {}) {
  console.error("[error]", context, err);
  const url = process.env.ERROR_WEBHOOK_URL;
  if (!url) return;
  try {
    await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        message: err instanceof Error ? err.message : String(err),
        stack: err instanceof Error ? err.stack : undefined,
        context,
        at: new Date().toISOString(),
      }),
    });
  } catch {
    /* never throw from the error reporter */
  }
}
