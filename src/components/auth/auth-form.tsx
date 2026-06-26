"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { createClient } from "@/lib/supabase/client";
import { credentialsSchema } from "@/lib/validation/auth";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
  CardFooter,
} from "@/components/ui/card";
import { Alert, AlertDescription } from "@/components/ui/alert";

export type AuthMode = "login" | "register";

const COPY: Record<
  AuthMode,
  { title: string; cta: string; switchText: string; switchHref: string; switchCta: string }
> = {
  login: {
    title: "登入",
    cta: "登入",
    switchText: "還沒有帳號？",
    switchHref: "/register",
    switchCta: "註冊",
  },
  register: {
    title: "註冊",
    cta: "建立帳號",
    switchText: "已經有帳號？",
    switchHref: "/login",
    switchCta: "登入",
  },
};

/**
 * Shared email+password auth form for /login and /register (AUTH-02) with a
 * Google OAuth button (AUTH-03).
 *
 * - Validates input client-side via credentialsSchema before any network call.
 * - On password success, refreshes the router so server components re-read the session.
 * - On register, surfaces Supabase's email-confirmation message when required.
 * - Google OAuth redirects through /auth/callback to exchange the code for a session.
 */
export function AuthForm({ mode }: { mode: AuthMode }) {
  const router = useRouter();
  const copy = COPY[mode];

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [info, setInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setInfo(null);

    const parsed = credentialsSchema.safeParse({ email, password });
    if (!parsed.success) {
      setError(parsed.error.issues[0]?.message ?? "輸入無效");
      return;
    }

    setLoading(true);
    const supabase = createClient();

    try {
      if (mode === "login") {
        const { error } = await supabase.auth.signInWithPassword(parsed.data);
        if (error) {
          setError("登入失敗，請確認電子郵件與密碼");
          return;
        }
        router.push("/");
        router.refresh();
      } else {
        const { data, error } = await supabase.auth.signUp({
          ...parsed.data,
          options: {
            emailRedirectTo: `${window.location.origin}/auth/callback`,
          },
        });
        if (error) {
          setError(error.message);
          return;
        }
        // When email confirmation is enabled, no session is returned yet.
        if (!data.session) {
          setInfo("確認信已寄出，請至信箱點擊連結完成註冊。");
          return;
        }
        router.push("/");
        router.refresh();
      }
    } finally {
      setLoading(false);
    }
  }

  async function handleGoogle() {
    setError(null);
    setLoading(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithOAuth({
      provider: "google",
      options: { redirectTo: `${window.location.origin}/auth/callback` },
    });
    if (error) {
      setError("無法啟動 Google 登入");
      setLoading(false);
    }
    // On success the browser is redirected by Supabase — no further action here.
  }

  return (
    <Card className="w-full max-w-sm">
      <CardHeader>
        <CardTitle>{copy.title}</CardTitle>
        <CardDescription>規劃並儲存你的旅遊行程</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-1">
            <label htmlFor="email" className="text-sm font-medium">
              電子郵件
            </label>
            <Input
              id="email"
              type="email"
              autoComplete="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
            />
          </div>
          <div className="space-y-1">
            <label htmlFor="password" className="text-sm font-medium">
              密碼
            </label>
            <Input
              id="password"
              type="password"
              autoComplete={mode === "login" ? "current-password" : "new-password"}
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </div>

          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}
          {info && (
            <Alert>
              <AlertDescription>{info}</AlertDescription>
            </Alert>
          )}

          <Button type="submit" className="w-full" disabled={loading}>
            {loading ? "處理中…" : copy.cta}
          </Button>
        </form>

        <div className="my-4 flex items-center gap-2 text-xs text-muted-foreground">
          <span className="h-px flex-1 bg-border" />
          或
          <span className="h-px flex-1 bg-border" />
        </div>

        <Button
          type="button"
          variant="outline"
          className="w-full"
          onClick={handleGoogle}
          disabled={loading}
        >
          使用 Google 登入
        </Button>
      </CardContent>
      <CardFooter className="justify-center text-sm text-muted-foreground">
        {copy.switchText}{" "}
        <Link href={copy.switchHref} className="ml-1 font-medium text-foreground underline">
          {copy.switchCta}
        </Link>
      </CardFooter>
    </Card>
  );
}
