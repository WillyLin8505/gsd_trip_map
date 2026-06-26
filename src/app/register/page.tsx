import { AuthForm } from "@/components/auth/auth-form";

/**
 * /register — create an account with email+password (AUTH-02) or Google (AUTH-03).
 */
export default function RegisterPage() {
  return (
    <main className="flex flex-1 items-center justify-center px-4 py-12">
      <AuthForm mode="register" />
    </main>
  );
}
