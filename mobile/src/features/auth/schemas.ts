import { z } from 'zod';

/** Error values are i18n keys under `auth.errors`. */
export const PASSWORD_MIN = 8;

const email = z.string().trim().toLowerCase().email('email');
const password = z.string().min(PASSWORD_MIN, 'passwordShort');

export const signInSchema = z.object({ email, password: z.string().min(1, 'passwordShort') });

export const signUpSchema = z
  .object({ email, password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'passwordMismatch' });

export const emailOnlySchema = z.object({ email });

export const newPasswordSchema = z
  .object({ password, confirm: z.string() })
  .refine((v) => v.password === v.confirm, { path: ['confirm'], message: 'passwordMismatch' });

/** First error per field, as i18n keys. */
export function fieldErrors(result: z.ZodSafeParseResult<unknown>): Record<string, string> {
  if (result.success) return {};
  const out: Record<string, string> = {};
  for (const issue of result.error.issues) {
    const key = String(issue.path[0] ?? '');
    if (!out[key]) out[key] = issue.message;
  }
  return out;
}
