import { useConvexAuth } from "@convex-dev/auth/react";
import { Navigate, Link } from "react-router-dom";
import { MessageCircle, Users, ShieldCheck } from "lucide-react";
import { Button } from "../components/ui/button";

export function LandingPage(): JSX.Element {
  const { isAuthenticated, isLoading } = useConvexAuth();

  if (isLoading) {
    return <></>;
  }

  if (isAuthenticated) {
    return <Navigate to="/dashboard" replace />;
  }

  return (
    <main className="min-h-screen flex flex-col">
      {/* Hero */}
      <section className="flex-1 flex flex-col items-center justify-center px-4 py-16 text-center">
        <h1 className="text-[32px] md:text-[40px] font-medium tracking-[-0.02em] leading-tight text-foreground">
          A calm place to work through a difficult conversation.
        </h1>
        <p className="mt-4 text-lg text-muted-foreground max-w-md">
          Clarity guides you and the other person toward resolution — privately,
          at your own pace.
        </p>
        <Button asChild className="mt-8" size="lg">
          <Link to="/login">Start a case</Link>
        </Button>
      </section>

      {/* Three-step explainer */}
      <section className="py-16 px-4">
        <div className="max-w-3xl mx-auto grid grid-cols-1 md:grid-cols-3 gap-8 text-center">
          <div className="flex flex-col items-center gap-3">
            <MessageCircle
              className="h-8 w-8 text-muted-foreground"
              aria-hidden="true"
            />
            <h3 className="font-medium text-foreground">Private Coaching</h3>
            <p className="text-sm text-muted-foreground">
              Work through your thoughts with AI guidance before sharing.
            </p>
          </div>
          <div className="flex flex-col items-center gap-3">
            <Users
              className="h-8 w-8 text-muted-foreground"
              aria-hidden="true"
            />
            <h3 className="font-medium text-foreground">Shared Conversation</h3>
            <p className="text-sm text-muted-foreground">
              Come together when both sides are ready to talk.
            </p>
          </div>
          <div className="flex flex-col items-center gap-3">
            <ShieldCheck
              className="h-8 w-8 text-muted-foreground"
              aria-hidden="true"
            />
            <h3 className="font-medium text-foreground">Resolution</h3>
            <p className="text-sm text-muted-foreground">
              Reach understanding with structured support.
            </p>
          </div>
        </div>
      </section>

      {/* Privacy section */}
      <section className="py-16 px-4 text-center">
        <h2 className="text-xl font-medium text-foreground">
          Your words are yours. Here's how we protect them.
        </h2>
        <p className="mt-4 text-muted-foreground">
          <Link to="/privacy" className="underline hover:text-foreground">
            Read our privacy policy
          </Link>
        </p>
      </section>

      {/* Footer */}
      <footer className="py-8 px-4 border-t text-center text-sm text-muted-foreground">
        <nav className="flex justify-center gap-6">
          <Link to="/terms" className="hover:text-foreground">
            Terms
          </Link>
          <Link to="/privacy" className="hover:text-foreground">
            Privacy
          </Link>
          <Link to="/contact" className="hover:text-foreground">
            Contact
          </Link>
        </nav>
      </footer>
    </main>
  );
}
