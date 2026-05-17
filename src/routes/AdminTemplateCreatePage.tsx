import * as React from "react";
import { useNavigate } from "react-router-dom";
import { useMutation } from "convex/react";
import { api } from "../../convex/_generated/api";
import { Button } from "../components/ui/button";
import { handleConvexError } from "../lib/errorHandler";

export function AdminTemplateCreatePage(): React.ReactElement {
  const navigate = useNavigate();
  const createTemplate = useMutation(api.admin.create);

  const [category, setCategory] = React.useState("");
  const [name, setName] = React.useState("");
  const [globalGuidance, setGlobalGuidance] = React.useState("");
  const [coachInstructions, setCoachInstructions] = React.useState("");
  const [draftCoachInstructions, setDraftCoachInstructions] = React.useState("");
  const [creating, setCreating] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  const canSubmit =
    category.trim() !== "" &&
    name.trim() !== "" &&
    globalGuidance.trim() !== "" &&
    !creating;

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canSubmit) return;
    setCreating(true);
    setError(null);
    try {
      const newTemplateId = await createTemplate({
        category: category.trim(),
        name: name.trim(),
        globalGuidance,
        coachInstructions: coachInstructions || undefined,
        draftCoachInstructions: draftCoachInstructions || undefined,
      });
      navigate(`/admin/templates/${newTemplateId}`);
    } catch (err) {
      const { message } = handleConvexError(err);
      setError(message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <main className="mx-auto max-w-3xl px-4 py-8" data-testid="page-admin-template-create">
      <h1 className="text-2xl font-bold mb-6">New Template</h1>

      <form onSubmit={handleSubmit} className="space-y-4">
        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="template-category">
            Category
          </label>
          <input
            id="template-category"
            type="text"
            className="w-full border rounded px-3 py-2"
            value={category}
            onChange={(e) => setCategory(e.target.value)}
            aria-label="Category"
            placeholder="e.g. workplace, family, roommate"
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="template-name">
            Name
          </label>
          <input
            id="template-name"
            type="text"
            className="w-full border rounded px-3 py-2"
            value={name}
            onChange={(e) => setName(e.target.value)}
            aria-label="Name"
            placeholder="Template name"
          />
        </div>

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
            placeholder="Instructions for the AI coach (optional)..."
          />
        </div>

        <div>
          <label className="block text-sm font-medium mb-1" htmlFor="draft-coach-instructions">
            Draft Coaching Instructions
          </label>
          <textarea
            id="draft-coach-instructions"
            className="w-full border rounded px-3 py-2 min-h-[100px] font-mono text-sm"
            value={draftCoachInstructions}
            onChange={(e) => setDraftCoachInstructions(e.target.value)}
            aria-label="Draft Coaching Instructions"
            placeholder="Instructions for draft coaching sessions (optional)..."
          />
        </div>

        {error && (
          <p className="text-red-600 text-sm" role="alert">{error}</p>
        )}

        <div className="flex gap-3 pt-4">
          <Button
            type="submit"
            disabled={!canSubmit}
            aria-label="Create Template"
          >
            {creating ? "Creating..." : "Create Template"}
          </Button>
          <Button
            type="button"
            className="bg-gray-200 text-gray-800 hover:bg-gray-300"
            onClick={() => navigate("/admin/templates")}
          >
            Cancel
          </Button>
        </div>
      </form>
    </main>
  );
}
