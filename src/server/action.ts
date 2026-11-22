import "server-only";
import { z } from "zod";
import { isRedirectError } from "next/dist/client/components/redirect-error";
import { AuthError } from "./auth/session";
import { UserError, reportError, type ActionResult } from "./errors";

/** Converts FormData into a plain object; repeated keys become arrays. */
export function formToObject(fd: FormData) {
  const out: Record<string, unknown> = {};
  for (const [k, v] of fd.entries()) {
    if (k.startsWith("$ACTION")) continue;
    if (typeof v !== "string") continue;
    if (k.endsWith("[]")) {
      const key = k.slice(0, -2);
      ((out[key] as string[]) ??= []).push(v);
    } else out[k] = v;
  }
  return out;
}

export function zodFieldErrors(err: z.ZodError) {
  const fe: Record<string, string> = {};
  for (const issue of err.issues) {
    const key = issue.path.join(".");
    if (!fe[key]) fe[key] = issue.message;
  }
  return fe;
}

/**
 * Wraps a server action: validates input, converts known errors into ActionResults
 * and hides unexpected errors from the client.
 */
export function action<S extends z.ZodTypeAny, R>(schema: S, fn: (input: z.infer<S>, fd: FormData) => Promise<ActionResult<R> | void>) {
  return async (_prev: ActionResult<R> | null, fd: FormData): Promise<ActionResult<R>> => {
    const parsed = schema.safeParse(formToObject(fd));
    if (!parsed.success) {
      return { ok: false, error: "Please check the highlighted fields.", fieldErrors: zodFieldErrors(parsed.error) };
    }
    try {
      return (await fn(parsed.data, fd)) ?? { ok: true };
    } catch (e) {
      if (isRedirectError(e)) throw e;
      if (e instanceof UserError) return { ok: false, error: e.message, fieldErrors: e.field ? { [e.field]: e.message } : undefined };
      if (e instanceof AuthError) return { ok: false, error: e.message };
      await reportError(e, { where: "server-action" });
      return { ok: false, error: "Something went wrong on our side. Please try again." };
    }
  };
}

/** Zod helpers for form fields. */
export const f = {
  text: (max = 500) => z.string().trim().max(max),
  req: (label: string, max = 500) => z.string().trim().min(1, `${label} is required`).max(max),
  email: () => z.string().trim().toLowerCase().email("Enter a valid email address").max(254),
  phone: () => z.string().trim().regex(/^\+?[0-9\s()-]{7,20}$/, "Enter a valid phone number, e.g. +233 24 123 4567"),
  int: (min = 0, max = 1_000_000) => z.coerce.number().int().min(min).max(max),
  optInt: (min = 0, max = 1_000_000) => z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().int().min(min).max(max).optional()),
  amount: () => z.coerce.number().min(0).max(100_000_000),
  optAmount: () => z.preprocess((v) => (v === "" || v == null ? undefined : v), z.coerce.number().min(0).max(100_000_000).optional()),
  bool: () => z.preprocess((v) => v === "on" || v === "true" || v === "1" || v === true, z.boolean()),
  uuid: () => z.string().uuid(),
  optUuid: () => z.preprocess((v) => (v === "" ? undefined : v), z.string().uuid().optional()),
};

export type Prev = ActionResult<unknown> | null;

/** Same as `action` but for use inside an exported `async function` in a "use server" file. */
export async function run<S extends z.ZodTypeAny, R = unknown>(fd: FormData, schema: S, fn: (input: z.infer<S>) => Promise<ActionResult<R> | void>): Promise<ActionResult<R>> {
  return action(schema, (i) => fn(i))(null, fd);
}
