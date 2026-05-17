import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { Navigate } from "react-router-dom";
import { api } from "../../../convex/_generated/api";
import { LoadingSpinner } from "./LoadingSpinner";

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(api.users.me, isAuthenticated ? {} : "skip");

  if (isLoading) {
    return <LoadingSpinner />;
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user === undefined) {
    return <LoadingSpinner />;
  }

  if (user === null) {
    return <Navigate to="/dashboard" replace />;
  }

  if (user.role !== "ADMIN") {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
