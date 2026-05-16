import * as React from "react";
import { usePaginatedQuery } from "convex/react";
import { api } from "../../convex/_generated/api";

type AuditEntry = {
  _id: string;
  actorUserId: string;
  actorDisplayName: string;
  action: string;
  targetType: string;
  targetId: string;
  metadata?: Record<string, unknown>;
  createdAt: number;
  _creationTime: number;
};

export function AdminAuditLogPage(): React.ReactElement {
  const [actorFilter, setActorFilter] = React.useState("");
  const [actionFilter, setActionFilter] = React.useState("");
  const [dateFrom, setDateFrom] = React.useState("");
  const [dateTo, setDateTo] = React.useState("");
  const [selectedEntry, setSelectedEntry] = React.useState<AuditEntry | null>(null);

  const queryArgs: Record<string, string | number> = {};
  if (actorFilter) queryArgs.actor = actorFilter;
  if (actionFilter) queryArgs.action = actionFilter;
  if (dateFrom) queryArgs.dateFrom = new Date(dateFrom).getTime();
  if (dateTo) queryArgs.dateTo = new Date(dateTo + "T23:59:59.999").getTime();

  const { results, status, loadMore } = usePaginatedQuery(
    api.admin.listAuditLog,
    queryArgs,
    { initialNumItems: 25 }
  );

  return (
    <main className="mx-auto max-w-6xl px-4 py-8">
      <h1 className="text-2xl font-bold mb-6" data-testid="page-admin-audit">
        Audit Log
      </h1>

      {/* Filter bar */}
      <div className="flex flex-wrap gap-4 mb-6" role="search" aria-label="Audit log filters">
        <input
          type="text"
          placeholder="Filter by actor ID..."
          value={actorFilter}
          onChange={(e) => setActorFilter(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
          aria-label="Filter by actor"
          data-testid="filter-actor"
        />
        <select
          value={actionFilter}
          onChange={(e) => setActionFilter(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
          aria-label="Filter by action type"
          data-testid="filter-action"
        >
          <option value="">All actions</option>
          <option value="TEMPLATE_CREATED">TEMPLATE_CREATED</option>
          <option value="TEMPLATE_PUBLISHED">TEMPLATE_PUBLISHED</option>
          <option value="TEMPLATE_ARCHIVED">TEMPLATE_ARCHIVED</option>
        </select>
        <input
          type="date"
          value={dateFrom}
          onChange={(e) => setDateFrom(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
          aria-label="Date from"
          data-testid="filter-date-from"
        />
        <input
          type="date"
          value={dateTo}
          onChange={(e) => setDateTo(e.target.value)}
          className="border rounded px-3 py-2 text-sm"
          aria-label="Date to"
          data-testid="filter-date-to"
        />
      </div>

      {/* Loading skeleton */}
      {status === "LoadingFirstPage" && (
        <table className="w-full" aria-label="Audit Log">
          <thead>
            <tr className="border-b">
              <th scope="col" className="text-left py-2 px-3 font-medium">Actor</th>
              <th scope="col" className="text-left py-2 px-3 font-medium">Action</th>
              <th scope="col" className="text-left py-2 px-3 font-medium">Target</th>
              <th scope="col" className="text-left py-2 px-3 font-medium">Timestamp</th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3].map((i) => (
              <tr key={i} className="animate-pulse">
                <td className="py-2 px-3"><div className="h-4 bg-gray-200 rounded w-24" /></td>
                <td className="py-2 px-3"><div className="h-4 bg-gray-200 rounded w-32" /></td>
                <td className="py-2 px-3"><div className="h-4 bg-gray-200 rounded w-28" /></td>
                <td className="py-2 px-3"><div className="h-4 bg-gray-200 rounded w-36" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {/* Empty state */}
      {status !== "LoadingFirstPage" && results.length === 0 && (
        <p className="text-gray-500 text-center mt-8" data-testid="empty-state">
          No audit log entries found.
        </p>
      )}

      {/* Data table */}
      {status !== "LoadingFirstPage" && results.length > 0 && (
        <>
          <table className="w-full" aria-label="Audit Log" data-testid="audit-log-table">
            <thead>
              <tr className="border-b">
                <th scope="col" className="text-left py-2 px-3 font-medium">Actor</th>
                <th scope="col" className="text-left py-2 px-3 font-medium">Action</th>
                <th scope="col" className="text-left py-2 px-3 font-medium">Target</th>
                <th scope="col" className="text-left py-2 px-3 font-medium">Timestamp</th>
              </tr>
            </thead>
            <tbody>
              {results.map((entry) => (
                <tr
                  key={entry._id}
                  className="border-b cursor-pointer hover:bg-gray-50"
                  onClick={() => setSelectedEntry(entry)}
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      e.preventDefault();
                      setSelectedEntry(entry);
                    }
                  }}
                  data-testid="audit-log-row"
                >
                  <td className="py-2 px-3">{entry.actorDisplayName}</td>
                  <td className="py-2 px-3">
                    {entry.action}
                    {entry.metadata && (entry.metadata as Record<string, unknown>).isSolo && (
                      <span className="ml-2 text-xs bg-yellow-100 text-yellow-800 px-1.5 py-0.5 rounded" data-testid="solo-badge">
                        SOLO
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-3">{entry.targetType}:{entry.targetId}</td>
                  <td className="py-2 px-3">
                    {new Date(entry.createdAt).toLocaleString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {/* Pagination */}
          {status === "CanLoadMore" && (
            <div className="mt-4 flex justify-center">
              <button
                onClick={() => loadMore(25)}
                className="px-4 py-2 border rounded text-sm hover:bg-gray-50"
                data-testid="load-more"
              >
                Load More
              </button>
            </div>
          )}
          {status === "LoadingMore" && (
            <div className="mt-4 flex justify-center">
              <span className="text-sm text-gray-500">Loading...</span>
            </div>
          )}
        </>
      )}

      {/* Detail drawer (right-side sheet) */}
      {selectedEntry && (
        <div
          className="fixed inset-0 z-50 flex"
          role="dialog"
          aria-modal="true"
          aria-label="Audit log entry detail"
          data-testid="audit-detail-drawer"
        >
          {/* Backdrop */}
          <div
            className="flex-1 bg-black/50"
            onClick={() => setSelectedEntry(null)}
          />
          {/* Sheet panel */}
          <div
            className="w-full max-w-md bg-white shadow-xl p-6 overflow-y-auto"
            role="document"
          >
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-semibold">Entry Detail</h2>
              <button
                onClick={() => setSelectedEntry(null)}
                aria-label="Close"
                className="text-gray-500 hover:text-gray-700 text-xl"
                data-testid="drawer-close"
                autoFocus
              >
                &times;
              </button>
            </div>
            <dl className="mb-4 text-sm space-y-2">
              <div>
                <dt className="font-medium text-gray-600">Actor</dt>
                <dd>{selectedEntry.actorDisplayName}</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-600">Action</dt>
                <dd>{selectedEntry.action}</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-600">Target</dt>
                <dd>{selectedEntry.targetType}:{selectedEntry.targetId}</dd>
              </div>
              <div>
                <dt className="font-medium text-gray-600">Timestamp</dt>
                <dd>{new Date(selectedEntry.createdAt).toLocaleString()}</dd>
              </div>
            </dl>
            <h3 className="text-sm font-medium text-gray-600 mb-2">Metadata</h3>
            <pre
              className="bg-gray-100 p-4 rounded text-xs overflow-x-auto"
              style={{ fontFamily: "'JetBrains Mono', monospace" }}
              data-testid="metadata-json"
            >
              {JSON.stringify(selectedEntry.metadata, null, 2)}
            </pre>
          </div>
        </div>
      )}

      {/* Keyboard handler for closing drawer with Escape */}
      {selectedEntry && <EscapeHandler onEscape={() => setSelectedEntry(null)} />}
    </main>
  );
}

function EscapeHandler({ onEscape }: { onEscape: () => void }) {
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onEscape();
    };
    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [onEscape]);
  return null;
}
