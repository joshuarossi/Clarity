import { Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useConvexAuth } from "@convex-dev/auth/react";
import { ProtectedRoute } from "./components/layout/ProtectedRoute";
import { AdminRoute } from "./components/layout/AdminRoute";
import { TopNav } from "./components/layout/TopNav";
import { LoginPage } from "./routes/LoginPage";
import { ProfilePage } from "./routes/ProfilePage";
import { NewCasePage } from "./routes/NewCasePage";
import { InviteSharingPage } from "./routes/InviteSharingPage";
import { InviteAcceptPage } from "./routes/InviteAcceptPage";
import { DashboardPage } from "./routes/DashboardPage";
import { CasePrivatePage } from "./routes/CasePrivatePage";
import { CaseDetailPage } from "./routes/CaseDetailPage";
import { ReadyForJointView } from "./routes/ReadyForJointView";
import { JointChatView } from "./routes/JointChatView";
import { ClosedCaseView } from "./routes/ClosedCaseView";
import { AdminTemplatesPage } from "./routes/AdminTemplatesPage";
import { AdminTemplateEditPage } from "./routes/AdminTemplateEditPage";

/* ---------- Stub page components ---------- */

function HomePage() {
  return <main><h1 data-testid="page-home">Home</h1></main>;
}

/* CasePrivatePage — imported from src/routes/CasePrivatePage.tsx */

/* JointChatView — imported from src/routes/JointChatView.tsx */

/* CaseClosedPage — replaced by imported ClosedCaseView */

/* AdminTemplateDetailPage — replaced by imported AdminTemplateEditPage */

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
  const { isAuthenticated, isLoading } = useConvexAuth();
  const location = useLocation();
  const caseMatch = location.pathname.match(/^\/cases\/([^/]+)\/(private|ready|joint|closed)$/);

  const phaseMap: Record<string, string> = {
    private: "Private Coaching",
    ready: "Ready for Joint Session",
    joint: "Joint Session",
    closed: "Closed",
  };

  return (
    <>
      {isAuthenticated && !isLoading && (
        caseMatch ? (
          <TopNav variant="case-detail" caseId={caseMatch[1]} casePhase={phaseMap[caseMatch[2]]} />
        ) : (
          <TopNav variant="logged-in" />
        )
      )}
      <Routes>
        <Route path="/" element={<HomePage />} />
        <Route path="/login" element={isAuthenticated && !isLoading ? <Navigate to="/dashboard" replace /> : <LoginPage />} />
        <Route path="/invite/:token" element={<InviteAcceptPage />} />
        <Route path="/profile" element={<ProtectedRoute><ProfilePage /></ProtectedRoute>} />
        <Route path="/dashboard" element={<ProtectedRoute><DashboardPage /></ProtectedRoute>} />
        <Route path="/cases/new" element={<ProtectedRoute><NewCasePage /></ProtectedRoute>} />
        <Route path="/cases/:caseId/invite" element={<ProtectedRoute><InviteSharingPage /></ProtectedRoute>} />
        <Route path="/cases/:caseId" element={<ProtectedRoute><CaseDetailPage /></ProtectedRoute>} />
        <Route path="/cases/:caseId/ready" element={<ProtectedRoute><ReadyForJointView /></ProtectedRoute>} />
        <Route path="/cases/:caseId/private" element={<ProtectedRoute><CasePrivatePage /></ProtectedRoute>} />
        <Route path="/cases/:caseId/joint" element={<ProtectedRoute><JointChatView /></ProtectedRoute>} />
        <Route path="/cases/:caseId/closed" element={<ProtectedRoute><ClosedCaseView /></ProtectedRoute>} />
        <Route path="/admin/templates" element={<AdminRoute><AdminTemplatesPage /></AdminRoute>} />
        <Route path="/admin/templates/:id" element={<AdminRoute><AdminTemplateEditPage /></AdminRoute>} />
        <Route path="/admin/audit" element={<AdminRoute><AdminAuditPage /></AdminRoute>} />
        <Route path="*" element={<NotFoundPage />} />
      </Routes>
    </>
  );
}

export default function App() {
  return <AppLayout />;
}
