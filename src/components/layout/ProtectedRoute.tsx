import { useConvexAuth } from "@convex-dev/auth/react";
import { Navigate } from "react-router-dom";
import { LoadingSpinner } from "./LoadingSpinner";

export function ProtectedRoute({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  return <>{children}</>;
}
