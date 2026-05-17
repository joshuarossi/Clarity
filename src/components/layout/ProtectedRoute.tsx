import { useConvexAuth } from "@convex-dev/auth/react";
import { Navigate, useLocation } from "react-router-dom";
import { LoadingSpinner } from "./LoadingSpinner";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const location = useLocation();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    const redirectParam = encodeURIComponent(
      location.pathname + location.search,
    );
    return <Navigate to={`/login?redirect=${redirectParam}`} replace />;
  }

  return <>{children}</>;
}
