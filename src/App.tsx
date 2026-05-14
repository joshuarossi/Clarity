import { useEffect } from "react";
import { Routes, Route, useLocation, Link } from "react-router-dom";
import { useConvexAuth } from "convex/react";
import TopNav from "./components/layout/TopNav";
import ProtectedRoute from "./components/auth/ProtectedRoute";
import AdminRoute from "./components/auth/AdminRoute";
import LandingPage from "./routes/LandingPage";
import LoginPage from "./routes/LoginPage";
import InviteAcceptPage from "./routes/InviteAcceptPage";
import Dashboard from "./routes/Dashboard";
import NewCasePage from "./routes/NewCasePage";
import CaseDetail from "./routes/CaseDetail";
import PrivateCoachingView from "./routes/PrivateCoachingView";
import JointChatView from "./routes/JointChatView";
import ClosedCaseView from "./routes/ClosedCaseView";
import TemplatesListPage from "./routes/admin/TemplatesListPage";
import TemplateEditPage from "./routes/admin/TemplateEditPage";
import AuditLogPage from "./routes/admin/AuditLogPage";

function FocusOnNavigate() {
  const location = useLocation();

  useEffect(() => {
    const h1 = document.querySelector("h1");
    if (h1) {
      h1.setAttribute("tabindex", "-1");
      h1.focus();
    }
  }, [location.pathname]);

  return null;
}

function NotFound() {
  const { isAuthenticated } = useConvexAuth();

  return (
    <main data-testid="page-not-found">
      <h1>Page not found</h1>
      <p>
        <Link to={isAuthenticated ? "/dashboard" : "/"}>
          {isAuthenticated ? "Go to Dashboard" : "Go to Home"}
        </Link>
      </p>
    </main>
  );
}

export default function App() {
  return (
    <>
      <TopNav />
      <FocusOnNavigate />
      <Routes>
        {/* Public routes */}
        <Route path="/" element={<LandingPage />} />
        <Route path="/login" element={<LoginPage />} />
        <Route path="/invite/:token" element={<InviteAcceptPage />} />

        {/* Protected routes */}
        <Route element={<ProtectedRoute />}>
          <Route path="/dashboard" element={<Dashboard />} />
          <Route path="/cases/new" element={<NewCasePage />} />
          <Route path="/cases/:caseId" element={<CaseDetail />}>
            <Route path="private" element={<PrivateCoachingView />} />
            <Route path="joint" element={<JointChatView />} />
            <Route path="closed" element={<ClosedCaseView />} />
          </Route>
        </Route>

        {/* Admin routes */}
        <Route element={<AdminRoute />}>
          <Route path="/admin/templates" element={<TemplatesListPage />} />
          <Route path="/admin/templates/:id" element={<TemplateEditPage />} />
          <Route path="/admin/audit" element={<AuditLogPage />} />
        </Route>

        {/* 404 catch-all */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </>
  );
}
