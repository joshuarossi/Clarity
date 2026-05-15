export function LoadingSpinner() {
  return (
    <div className="cc-loading-container" style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
      <div aria-label="Loading" role="status">Loading…</div>
    </div>
  );
}
