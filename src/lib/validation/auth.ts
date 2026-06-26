import { z } from "zod";

/**
 * Zod schema for email + password auth (login and register — AUTH-02).
 *
 * - email is trimmed and validated as an email address.
 * - password requires at least 8 characters (stricter than Supabase's default
 *   minimum of 6) so weak passwords are rejected client-side before any network call.
 *
 * Shared by the /login and /register forms and any server-side validation.
 */
export const credentialsSchema = z.object({
  email: z.string().trim().email("請輸入有效的電子郵件"),
  password: z.string().min(8, "密碼至少需要 8 個字元"),
});

export type Credentials = z.infer<typeof credentialsSchema>;
