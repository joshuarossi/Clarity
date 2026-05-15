import { Routes, Route, Navigate, useParams, useLocation } from "react-router-dom";
import { useConvexAuth } from "@convex-dev/auth/react";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { AdminRoute } from "./components/layout/AdminRoute";
import { TopNav } from "./components/layout/TopNav";

/* ---------- Stub page components ---------- */

function HomePage() {
  return <main><h1 data-testid="page-home">Home</h1></main>;
}

function LoginPage() {
  return <main><h1 data-testid="page-login">Login</h1></main>;
}

function InvitePage() {
  const { token } = useParams();
  return <main><h1 data-testid="page-invite">Invite {token}</h1></main>;
}

function DashboardPage() {
  return <main><h1 data-testid="page-dashboard">Dashboard</h1></main>;
}

function NewCasePage() {
  return <main><h1 data-testid="page-new-case">New Case</h1></main>;
}

function CaseDetailPage() {
  return <main><h1 data-testid="page-case-detail">Case Detail</h1></main>;
}

function CasePrivatePage() {
  const { caseId } = useParams();
  return <main><h1 data-testid="page-case-private">Private Coaching</h1><span data-caseid={caseId} /></main>;
}

function CaseJointPage() {
  const { caseId } = useParams();
  return <main><h1 data-testid="page-case-joint">Joint Session</h1><span data-caseid={caseId} /></main>;
}

function CaseClosedPage() {
  const { caseId } = useParams();
  return <main><h1 data-testid="page-case-closed">Closed</h1><span data-caseid={caseId} /></main>;
}

function AdminTemplatesPage() {
  return <main><h1 data-testid="page-admin-templates">Templates</h1></main>;
}

function AdminTemplateDetailPage() {
  const { id } = useParams();
  return <main><h1 data-testid="page-admin-template-detail">Template {id}</h1></main>;
}

function AdminAuditPage() {
  return <main><h1 data-testid="page-admin-audit">Audit Log</h1></main>;
}

function NotFoundPage() {
  return (
    <main>
      <h1 data-testid="page-not-found">Page not found</h1>
      <a href="/dashboard">Go to Dashboard</a>
    </main>
  );
}

/* ---------- Layout ---------- */

function AppLayout() {
  const { isAuthenticated } = useConvexAuth();
  const location = useLocation();
  const caseMatch = location.pathname.match(/^\/cases\/([^/]+)\/(private|joint|closed)$/);

  if (!isAuthenticated) {
    return <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route path="/invite/:token" element={<InvitePage />} />
      <Route path="/" element={<HomePage />} />
      <Route path="*" element={<Navigate to="/login" replace />} />
    </Routes>;
  }

  const phaseMap: Record<string, string> = {
    private: "Private Coaching",
    joint: "Joint Session",
    closed: "Closed",
  };

  return (
    <>
      {caseMatch ? (
        <TopNav variant="case-detail" caseId={caseMatch[1]} casePhase={phaseMap[caseMatch[2]]} />
      ) : (
        <TopNav variant="logged-in" />
      )}
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={<Navigate to="/dashboard" replace />} />
        <Route path="/invite/:token" element={<InvitePage />} />
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/cases/new" element={<ProtectedRoute><NewCasePage /></ProtectedRoute>} />
        <Route path="/cases/:caseId" element={<ProtectedRoute><CaseDetailPage /></ProtectedRoute>} />
        <Route path="/cases/:caseId/private" element={<ProtectedRoute><CasePrivatePage /></ProtectedRoute>} />
        <Route path="/cases/:caseId/joint" element={<ProtectedRoute><CaseJointPage /></ProtectedRoute>} />
        <Route path="/cases/:caseId/closed" element={<ProtectedRoute><CaseClosedPage /></ProtectedRoute>} />
        <Route path="/admin/templates" element={<AdminRoute><AdminTemplatesPage /></AdminRoute>} />
        <Route path="/admin/templates/:id" element={<AdminRoute><AdminTemplateDetailPage /></AdminRoute>} />
        <Route path="/admin/audit" element={<AdminRoute><AdminAuditPage /></AdminRoute>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}

export default function App() {
  return <AppLayout />;
}
