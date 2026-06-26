import { AuthForm } from "@/components/auth/auth-form";

/**
 * /login — email+password and Google sign-in (AUTH-02 / AUTH-03).
 *
 * Anonymous planning (Phase 03) does not require this page; it is only needed to
 * save and share itineraries (Phase 04).
 */
export default function LoginPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <AuthForm mode="login" />
    </main>
  );
}
