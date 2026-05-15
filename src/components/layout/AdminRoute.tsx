import { useConvexAuth } from "@convex-dev/auth/react";
import { useQuery } from "convex/react";
import { Navigate } from "react-router-dom";
import { api } from "../../../convex/_generated/api";

export function AdminRoute({ children }: { children: React.ReactNode }) {
  const { isLoading, isAuthenticated } = useConvexAuth();
  const user = useQuery(
    api.users.me,
    isAuthenticated ? {} : "skip",
  );

  if (isLoading) {
    return (
      <div className="cc-loading-container" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <div aria-label="Loading" role="status">Loading…</div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user === undefined) {
    return (
      <div className="cc-loading-container" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <div aria-label="Loading" role="status">Loading…</div>
      </div>
    );
  }

  if (!user || user.role !== "ADMIN") {
    return <Navigate to="/dashboard" replace />;
  }

  return <>{children}</>;
}
