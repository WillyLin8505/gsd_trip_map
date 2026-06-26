import Link from "next/link";
import { getUser } from "@/lib/auth/get-user";
import { Button } from "@/components/ui/button";

/**
 * Site header — server component that reflects auth state (AUTH-02/03/04).
 *
 * - Logged out: links to /login and /register.
 * - Logged in: link to saved itineraries (/itineraries), the user's email, and a
 *   sign-out button (POST /auth/signout).
 *
 * Reading auth state here keeps the home page itself anonymous-friendly (AUTH-01):
 * the planner works without an account; the header just adds account affordances.
 */
export async function SiteHeader() {
  const user = await getUser();

  return (
    <header className="border-b bg-white">
      <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
        <Link href="/" className="font-semibold">
          旅遊行程規劃器
        </Link>

        <nav className="flex items-center gap-3 text-sm">
          {user ? (
            <>
              <Link href="/itineraries" className="text-muted-foreground hover:text-foreground">
                我的行程
              </Link>
              <span className="hidden text-muted-foreground sm:inline">{user.email}</span>
              <form action="/auth/signout" method="post">
                <Button type="submit" variant="outline" size="sm">
                  登出
                </Button>
              </form>
            </>
          ) : (
            <>
              <Link href="/login" className="text-muted-foreground hover:text-foreground">
                登入
              </Link>
              <Button asChild size="sm">
                <Link href="/register">註冊</Link>
              </Button>
            </>
          )}
        </nav>
      </div>
    </header>
  );
}
