import { useConvexAuth } from "convex/react";
import { Navigate, Outlet } from "react-router-dom";
import { useCurrentUser } from "../../hooks/useCurrentUser";

export default function AdminRoute() {
  const { isAuthenticated, isLoading: authLoading } = useConvexAuth();
  const { user, isLoading: userLoading } = useCurrentUser();

  if (authLoading || (isAuthenticated && userLoading)) {
    return (
      <div style={{ display: "flex", justifyContent: "center", padding: "4rem" }}>
        <div className="spinner" aria-label="Loading" />
      </div>
    );
  }

  if (!isAuthenticated) {
    return <Navigate to="/login" replace />;
  }

  if (user && user.role !== "ADMIN") {
    return <Navigate to="/dashboard" replace />;
  }

  return <Outlet />;
}
