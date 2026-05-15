import { useState, type FormEvent } from "react";
import { useConvexAuth, useAuthActions } from "@convex-dev/auth/react";
import { useSearchParams, Navigate } from "react-router-dom";
import { Button } from "../components/ui/button";

function safeRedirect(value: string | null): string {
  if (value && value.startsWith("/") && !value.startsWith("//")) {
    return value;
  }
  return "/dashboard";
}

export function LoginPage(): React.ReactElement {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const { signIn } = useAuthActions();
  const [searchParams] = useSearchParams();
  const redirectTo = safeRedirect(searchParams.get("redirect"));

  const [email, setEmail] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [magicLinkSent, setMagicLinkSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  if (isAuthenticated && !isLoading) {
    return <Navigate to={redirectTo} replace />;
  }

  async function handleMagicLink(e: FormEvent) {
    e.preventDefault();
    setError(null);
    if (!email.trim()) {
      setError("Please enter an email address.");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setError("Please enter a valid email address.");
      return;
    }
    setSubmitting(true);
    try {
      await signIn("magic-link", { email });
      setMagicLinkSent(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send magic link. Please try again.");
    } finally {
      setSubmitting(false);
    }
  }

  async function handleGoogleOAuth() {
    setError(null);
    try {
      const result = await signIn("google");
      if (result.redirect) {
        window.location.href = result.redirect.toString();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "Google sign-in failed. Please try again.");
    }
  }

  return (
    <main
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
      }}
    >
      <div
        className="cc-card"
        style={{ maxWidth: 400, width: "100%", padding: "2rem" }}
      >
        <h1>Sign in to Clarity</h1>

        {magicLinkSent ? (
          <div role="status">
            <p>Check your email for a sign-in link.</p>
            <p style={{ fontSize: "0.875rem", color: "var(--cc-text-muted, #6b7280)" }}>
              We sent a magic link to <strong>{email}</strong>.
            </p>
          </div>
        ) : (
          <>
            <form onSubmit={handleMagicLink} noValidate>
              <div style={{ marginBottom: "1rem" }}>
                <label htmlFor="login-email">Email address</label>
                <input
                  id="login-email"
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@example.com"
                  required
                  disabled={isLoading || submitting}
                  autoComplete="email"
                  style={{ display: "block", width: "100%", marginTop: "0.25rem" }}
                />
                {error && (
                  <p role="alert" style={{ color: "var(--cc-danger, #dc2626)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
                    {error}
                  </p>
                )}
              </div>
              <Button
                type="submit"
                variant="primary"
                disabled={isLoading || submitting}
                style={{ width: "100%" }}
              >
                Send magic link
              </Button>
            </form>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                margin: "1rem 0",
              }}
            >
              <hr style={{ flex: 1 }} />
              <span style={{ fontSize: "0.75rem", color: "var(--cc-text-muted, #6b7280)" }}>or</span>
              <hr style={{ flex: 1 }} />
            </div>

            <Button
              type="button"
              variant="secondary"
              onClick={handleGoogleOAuth}
              disabled={isLoading}
              style={{ width: "100%" }}
            >
              Continue with Google
            </Button>

            <p style={{ fontSize: "0.75rem", color: "var(--cc-text-muted, #6b7280)", marginTop: "1.5rem", textAlign: "center" }}>
              By signing in, you agree to our Terms and Privacy Policy
            </p>
          </>
        )}
      </div>
    </main>
  );
}
