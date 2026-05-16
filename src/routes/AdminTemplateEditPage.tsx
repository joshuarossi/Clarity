import * as React from "react";
import { useParams, useNavigate } from "react-router-dom";
import { useQuery, useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import type { Id } from "../../convex/_generated/dataModel";
import { Button } from "../components/ui/button";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
} from "../components/ui/Dialog";

export function AdminTemplateEditPage(): React.ReactElement {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();

  const templateId = id as Id<"templates">;
  const template = useQuery(
    api.admin.get,
    id ? { templateId } : "skip"
  );
  const versions = useQuery(
    api.admin.listVersions,
    id ? { templateId } : "skip"
  );

  const publishNewVersion = useMutation(api.admin.publishNewVersion);
  const archiveTemplate = useMutation(api.admin.archive);

  const [globalGuidance, setGlobalGuidance] = React.useState("");
  const [coachInstructions, setCoachInstructions] = React.useState("");
  const [draftCoachInstructions, setDraftCoachInstructions] = React.useState("");
  const [notes, setNotes] = React.useState("");
  const [publishing, setPublishing] = React.useState(false);
  const [archiving, setArchiving] = React.useState(false);
  const [viewingVersionId, setViewingVersionId] = React.useState<string | null>(null);
  const [archiveDialogOpen, setArchiveDialogOpen] = React.useState(false);

  // Pre-populate form when template data loads
  const currentVersion = template?.currentVersion;
  const [formInitialized, setFormInitialized] = React.useState(false);

  React.useEffect(() => {
    if (currentVersion && !formInitialized) {
      setGlobalGuidance(currentVersion.globalGuidance ?? "");
      setCoachInstructions(currentVersion.coachInstructions ?? "");
      setDraftCoachInstructions(currentVersion.draftCoachInstructions ?? "");
      setFormInitialized(true);
    }
  }, [currentVersion, formInitialized]);

  // Loading state
  if (template === undefined || versions === undefined) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8" data-testid="page-admin-template-edit">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
          <div className="lg:col-span-2 space-y-4">
            {[1, 2, 3, 4].map((i) => (
              <div key={i} className="animate-pulse h-16 bg-gray-200 rounded" />
            ))}
          </div>
          <div className="space-y-4">
            {[1, 2, 3].map((i) => (
              <div key={i} className="animate-pulse h-12 bg-gray-200 rounded" />
            ))}
          </div>
        </div>
      </main>
    );
  }

  // Template not found
  if (template === null) {
    return (
      <main className="mx-auto max-w-7xl px-4 py-8" data-testid="page-admin-template-edit">
        <h1 className="text-2xl font-bold mb-4">Template not found</h1>
        <a href="/admin/templates" className="text-blue-600 underline">
          Back to Templates
        </a>
      </main>
    );
  }

  const isArchived = template.archivedAt != null;

  const handlePublish = async () => {
    if (!globalGuidance.trim()) return;
    setPublishing(true);
    try {
      await publishNewVersion({
        templateId: template._id,
        globalGuidance,
        coachInstructions: coachInstructions || undefined,
        draftCoachInstructions: draftCoachInstructions || undefined,
        notes: notes || undefined,
      });
      setNotes("");
      setFormInitialized(false);
    } finally {
      setPublishing(false);
    }
  };

  const handleArchive = async () => {
    setArchiving(true);
    try {
      await archiveTemplate({ templateId: template._id });
      navigate("/admin/templates");
    } finally {
      setArchiving(false);
      setArchiveDialogOpen(false);
    }
  };

  return (
    <main className="mx-auto max-w-7xl px-4 py-8" data-testid="page-admin-template-edit">
      <div className="flex items-center gap-3 mb-6">
        <h1 className="text-2xl font-bold">{template.name}</h1>
        {isArchived && (
          <span className="inline-block px-2 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-600">
            Archived
          </span>
        )}
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left pane: Form */}
        <div className="lg:col-span-2" data-testid="template-edit-form-pane">
          {/* Read-only context fields */}
          <div className="mb-6 space-y-4">
            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="template-category">
                Category
              </label>
              <select
                id="template-category"
                className="w-full border rounded px-3 py-2 bg-gray-50"
                value={template.category}
                disabled
                aria-label="Category"
              >
                <option value={template.category}>{template.category}</option>
              </select>
            </div>

            <div>
              <label className="block text-sm font-medium mb-1" htmlFor="template-name">
                Name
              </label>
              <input
                id="template-name"
                type="text"
                className="w-full border rounded px-3 py-2 bg-gray-50"
                value={template.name}
                disabled
                aria-label="Name"
              />
            </div>
          </div>

          {/* Editable content fields — hidden if archived */}
          {!isArchived && (
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="global-guidance">
                  Global Guidance
                </label>
                <textarea
                  id="global-guidance"
                  className="w-full border rounded px-3 py-2 min-h-[160px] font-mono text-sm"
                  value={globalGuidance}
                  onChange={(e) => setGlobalGuidance(e.target.value)}
                  aria-label="Global Guidance"
                  placeholder="Markdown content for global coaching guidance..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="coach-instructions">
                  Coach Instructions
                </label>
                <textarea
                  id="coach-instructions"
                  className="w-full border rounded px-3 py-2 min-h-[100px] font-mono text-sm"
                  value={coachInstructions}
                  onChange={(e) => setCoachInstructions(e.target.value)}
                  aria-label="Coach Instructions"
                  placeholder="Instructions for the AI coach..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="draft-coach-instructions">
                  Draft Coach Instructions
                </label>
                <textarea
                  id="draft-coach-instructions"
                  className="w-full border rounded px-3 py-2 min-h-[100px] font-mono text-sm"
                  value={draftCoachInstructions}
                  onChange={(e) => setDraftCoachInstructions(e.target.value)}
                  aria-label="Draft Coach Instructions"
                  placeholder="Instructions for draft coaching sessions..."
                />
              </div>

              <div>
                <label className="block text-sm font-medium mb-1" htmlFor="version-notes">
                  Notes
                </label>
                <textarea
                  id="version-notes"
                  className="w-full border rounded px-3 py-2 min-h-[80px]"
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  aria-label="Notes"
                  placeholder="Changelog notes for this version (admin-only)..."
                />
              </div>

              <div className="flex gap-3 pt-4">
                <Button
                  onClick={handlePublish}
                  disabled={publishing || !globalGuidance.trim()}
                  aria-label="Publish New Version"
                >
                  {publishing ? "Publishing..." : "Publish New Version"}
                </Button>

                <Dialog open={archiveDialogOpen} onOpenChange={setArchiveDialogOpen}>
                  <DialogTrigger asChild>
                    <Button
                      className="bg-red-600 hover:bg-red-700 text-white"
                      aria-label="Archive Template"
                    >
                      Archive Template
                    </Button>
                  </DialogTrigger>
                  <DialogContent aria-label="Archive confirmation">
                    <DialogTitle>Archive Template</DialogTitle>
                    <DialogDescription>
                      Are you sure you want to archive &ldquo;{template.name}&rdquo;?
                    </DialogDescription>
                    <p className="mt-2 text-sm" data-testid="pinned-cases-count">
                      {template.pinnedCasesCount === 0
                        ? "No cases are currently pinned to this template."
                        : `${template.pinnedCasesCount} case${template.pinnedCasesCount === 1 ? " is" : "s are"} currently pinned to this template. They will continue working, but new cases won't be able to select this template.`}
                    </p>
                    <div className="flex gap-3 mt-4 justify-end">
                      <DialogClose asChild>
                        <Button className="bg-gray-200 text-gray-800 hover:bg-gray-300">
                          Cancel
                        </Button>
                      </DialogClose>
                      <Button
                        className="bg-red-600 hover:bg-red-700 text-white"
                        onClick={handleArchive}
                        disabled={archiving}
                        aria-label="Confirm Archive"
                      >
                        {archiving ? "Archiving..." : "Confirm Archive"}
                      </Button>
                    </div>
                  </DialogContent>
                </Dialog>
              </div>
            </div>
          )}
        </div>

        {/* Right pane: Version history timeline */}
        <div data-testid="template-version-timeline">
          <h2 className="text-lg font-semibold mb-4">Version History</h2>

          {versions.length === 0 && (
            <p className="text-gray-500 text-sm">No versions published yet.</p>
          )}

          <div className="space-y-3">
            {versions.map((ver) => (
              <div
                key={ver._id}
                className="border rounded p-3"
                data-testid="version-entry"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-medium">v{ver.version}</span>
                  <Button
                    className="text-xs px-2 py-1"
                    onClick={() =>
                      setViewingVersionId(
                        viewingVersionId === ver._id ? null : ver._id
                      )
                    }
                    aria-label={`View version ${ver.version}`}
                  >
                    View
                  </Button>
                </div>
                <p className="text-xs text-gray-500 mt-1">
                  {new Date(ver.publishedAt).toLocaleDateString()} &mdash;{" "}
                  {ver.publishedByDisplayName}
                </p>
                {ver.notes && (
                  <p className="text-xs text-gray-600 mt-1 truncate">
                    {ver.notes}
                  </p>
                )}

                {/* Read-only view of version content */}
                {viewingVersionId === ver._id && (
                  <div
                    className="mt-3 p-3 bg-gray-50 rounded text-sm space-y-2"
                    data-testid="version-readonly-view"
                  >
                    <div>
                      <span className="font-medium text-xs">Global Guidance:</span>
                      <pre className="whitespace-pre-wrap mt-1 text-xs font-mono">
                        {ver.globalGuidance}
                      </pre>
                    </div>
                    {ver.coachInstructions && (
                      <div>
                        <span className="font-medium text-xs">Coach Instructions:</span>
                        <pre className="whitespace-pre-wrap mt-1 text-xs font-mono">
                          {ver.coachInstructions}
                        </pre>
                      </div>
                    )}
                    {ver.draftCoachInstructions && (
                      <div>
                        <span className="font-medium text-xs">Draft Coach Instructions:</span>
                        <pre className="whitespace-pre-wrap mt-1 text-xs font-mono">
                          {ver.draftCoachInstructions}
                        </pre>
                      </div>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>
    </main>
  );
}
