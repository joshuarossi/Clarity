import { Outlet } from "react-router-dom";

export default function CaseDetail() {
  return (
    <main data-testid="page-case-detail">
      <h1>Case Detail</h1>
      <Outlet />
    </main>
  );
}
