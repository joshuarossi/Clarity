import { useNavigate } from "react-router-dom";
import { useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "../components/ui/button";

export function AdminTemplatesPage(): React.ReactElement {
  const navigate = useNavigate();
  const templates = useQuery(api.admin.listAll);

  return (
    <main className="mx-auto max-w-5xl px-4 py-8">
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold" data-testid="page-admin-templates">
          Templates
        </h1>
        <Button
          onClick={() => navigate("/admin/templates/new")}
          aria-label="New Template"
        >
          + New Template
        </Button>
      </div>

      {templates === undefined && (
        <table className="w-full" aria-label="Templates">
          <thead>
            <tr>
              <th className="text-left py-2 px-3">Category</th>
              <th className="text-left py-2 px-3">Name</th>
              <th className="text-left py-2 px-3">Current Version</th>
              <th className="text-left py-2 px-3">Status</th>
              <th className="text-left py-2 px-3">Pinned Cases</th>
            </tr>
          </thead>
          <tbody>
            {[1, 2, 3].map((i) => (
              <tr key={i} className="animate-pulse">
                <td className="py-2 px-3"><div className="h-4 bg-gray-200 rounded w-20" /></td>
                <td className="py-2 px-3"><div className="h-4 bg-gray-200 rounded w-32" /></td>
                <td className="py-2 px-3"><div className="h-4 bg-gray-200 rounded w-8" /></td>
                <td className="py-2 px-3"><div className="h-4 bg-gray-200 rounded w-16" /></td>
                <td className="py-2 px-3"><div className="h-4 bg-gray-200 rounded w-8" /></td>
              </tr>
            ))}
          </tbody>
        </table>
      )}

      {templates !== undefined && templates.length === 0 && (
        <p className="text-gray-500 mt-8" data-testid="empty-state">
          No templates yet. The app will use a built-in default baseline. Create a template when you want to tune the Coach&#x2019;s behavior per category.
        </p>
      )}

      {templates !== undefined && templates.length > 0 && (
        <table className="w-full" aria-label="Templates">
          <thead>
            <tr className="border-b">
              <th className="text-left py-2 px-3 font-medium">Category</th>
              <th className="text-left py-2 px-3 font-medium">Name</th>
              <th className="text-left py-2 px-3 font-medium">Current Version</th>
              <th className="text-left py-2 px-3 font-medium">Status</th>
              <th className="text-left py-2 px-3 font-medium">Pinned Cases</th>
            </tr>
          </thead>
          <tbody>
            {templates.map((template) => {
              const isArchived = template.archivedAt !== undefined;
              return (
                <tr
                  key={template._id}
                  className={`border-b cursor-pointer hover:bg-gray-50 ${isArchived ? "archived-muted opacity-60" : ""}`}
                  onClick={() => navigate(`/admin/templates/${template._id}`)}
                  role="link"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === " ") {
                      navigate(`/admin/templates/${template._id}`);
                    }
                  }}
                >
                  <td className="py-2 px-3">{template.category}</td>
                  <td className="py-2 px-3">{template.name}</td>
                  <td className="py-2 px-3">
                    {template.currentVersion ?? "—"}
                  </td>
                  <td className="py-2 px-3">
                    <span
                      className={`inline-block px-2 py-0.5 rounded-full text-xs font-medium ${
                        isArchived
                          ? "bg-gray-100 text-gray-600"
                          : "bg-green-100 text-green-800"
                      }`}
                    >
                      {isArchived ? "Archived" : "Active"}
                    </span>
                  </td>
                  <td className="py-2 px-3">{template.pinnedCasesCount}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      )}
    </main>
  );
}
