import { useState, useRef, useCallback, type FormEvent } from "react";
import { useMutation } from "convex/react";
import { useNavigate } from "react-router-dom";
import { Lock } from "lucide-react";
import { api } from "../../convex/_generated/api";
import { Button } from "../components/ui/button";

const CATEGORIES = [
  { value: "workplace", label: "Workplace" },
  { value: "family", label: "Family" },
  { value: "personal", label: "Personal relationship" },
  { value: "contractual", label: "Contractual / business" },
  { value: "other", label: "Other" },
] as const;

const MAIN_TOPIC_SOFT_LIMIT = 140;

interface FormErrors {
  category?: string;
  mainTopic?: string;
  description?: string;
}

export function NewCasePage(): React.ReactElement {
  const createCase = useMutation(api.cases.create);
  const navigate = useNavigate();

  const [category, setCategory] = useState("");
  const [mainTopic, setMainTopic] = useState("");
  const [description, setDescription] = useState("");
  const [desiredOutcome, setDesiredOutcome] = useState("");
  const [otherPartyName, setOtherPartyName] = useState("");
  const [isSolo, setIsSolo] = useState(false);

  const [advancedOpen, setAdvancedOpen] = useState(false);
  const [errors, setErrors] = useState<FormErrors>({});
  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const descriptionRef = useRef<HTMLTextAreaElement>(null);
  const categoryRef = useRef<HTMLFieldSetElement>(null);
  const mainTopicRef = useRef<HTMLInputElement>(null);

  const autoGrowDescription = useCallback(() => {
    const el = descriptionRef.current;
    if (!el) return;
    el.style.height = "auto";
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 24;
    const minHeight = 5 * lineHeight;
    el.style.height = `${Math.max(el.scrollHeight, minHeight)}px`;
  }, []);

  function validate(): FormErrors {
    const errs: FormErrors = {};
    if (!category) errs.category = "Please select a category.";
    if (!mainTopic.trim()) errs.mainTopic = "Please enter a topic.";
    if (!description.trim()) errs.description = "Please enter a description.";
    return errs;
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setSubmitError(null);

    const errs = validate();
    setErrors(errs);

    if (Object.keys(errs).length > 0) {
      // Focus first invalid field
      if (errs.category) {
        categoryRef.current?.querySelector<HTMLInputElement>('input[type="radio"]')?.focus();
      } else if (errs.mainTopic) {
        mainTopicRef.current?.focus();
      } else if (errs.description) {
        descriptionRef.current?.focus();
      }
      return;
    }

    setSubmitting(true);
    try {
      const result = await createCase({
        category,
        mainTopic: mainTopic.trim(),
        description: description.trim(),
        desiredOutcome: desiredOutcome.trim(),
        ...(isSolo ? { isSolo: true } : {}),
      });
      if (isSolo) {
        navigate(`/cases/${result.caseId}/private`);
      } else {
        navigate(`/cases/${result.caseId}/invite`, {
          state: { otherPartyName },
        });
      }
    } catch (err) {
      console.error("Case creation failed:", err);
      setSubmitError(
        err instanceof Error
          ? err.message
          : "Something went wrong. Please try again.",
      );
    } finally {
      setSubmitting(false);
    }
  }

  const counterClass =
    mainTopic.length > MAIN_TOPIC_SOFT_LIMIT
      ? "cc-text-warning"
      : undefined;

  return (
    <main
      style={{
        display: "flex",
        justifyContent: "center",
        minHeight: "100vh",
        padding: "2rem 1rem",
      }}
    >
      <div style={{ maxWidth: 600, width: "100%" }}>
        <h1>Create a new case</h1>

        <form onSubmit={handleSubmit} noValidate>
          {/* --- Category radio cards --- */}
          <fieldset
            ref={categoryRef}
            style={{ border: "none", padding: 0, margin: "0 0 1.5rem" }}
          >
            <legend style={{ fontWeight: 600, marginBottom: "0.5rem" }}>
              Category
            </legend>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))",
                gap: "0.5rem",
              }}
            >
              {CATEGORIES.map((cat) => (
                <label
                  key={cat.value}
                  htmlFor={`category-${cat.value}`}
                  className="cc-radio-card"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    padding: "0.75rem 1rem",
                    cursor: "pointer",
                    border:
                      category === cat.value
                        ? "2px solid var(--accent)"
                        : "2px solid var(--border-default)",
                    borderRadius: "0.5rem",
                    background:
                      category === cat.value
                        ? "var(--accent-subtle)"
                        : undefined,
                  }}
                >
                  <input
                    type="radio"
                    id={`category-${cat.value}`}
                    name="category"
                    value={cat.value}
                    checked={category === cat.value}
                    onChange={() => setCategory(cat.value)}
                    style={{ position: "absolute", opacity: 0, width: 0, height: 0 }}
                  />
                  <span>{cat.label}</span>
                </label>
              ))}
            </div>
            {errors.category && (
              <p
                role="alert"
                style={{
                  color: "var(--danger)",
                  fontSize: "0.875rem",
                  marginTop: "0.25rem",
                }}
              >
                {errors.category}
              </p>
            )}
          </fieldset>

          {/* --- Main topic --- */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label htmlFor="main-topic" style={{ fontWeight: 600 }}>
              In one sentence, what&apos;s this about?
            </label>
            <p
              id="main-topic-helper"
              style={{
                fontSize: "0.875rem",
                color: "var(--text-secondary)",
                marginTop: "0.25rem",
                marginBottom: "0.25rem",
              }}
            >
              This will be visible to the other person when they accept the
              invitation. Keep it factual, not emotional.
            </p>
            <input
              ref={mainTopicRef}
              id="main-topic"
              type="text"
              value={mainTopic}
              onChange={(e) => setMainTopic(e.target.value)}
              aria-describedby="main-topic-helper main-topic-counter"
              disabled={submitting}
              style={{ display: "block", width: "100%" }}
            />
            <p
              id="main-topic-counter"
              className={counterClass}
              style={{
                fontSize: "0.75rem",
                marginTop: "0.25rem",
                color: counterClass
                  ? "var(--warning)"
                  : "var(--text-secondary)",
              }}
            >
              {mainTopic.length}/{MAIN_TOPIC_SOFT_LIMIT}
            </p>
            {errors.mainTopic && (
              <p
                role="alert"
                style={{
                  color: "var(--danger)",
                  fontSize: "0.875rem",
                  marginTop: "0.25rem",
                }}
              >
                {errors.mainTopic}
              </p>
            )}
          </div>

          {/* --- Description (private) --- */}
          <div style={{ marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <label htmlFor="description" style={{ fontWeight: 600 }}>
                Private to you
              </label>
              <span
                tabIndex={0}
                aria-label="Privacy info"
                aria-describedby="description-privacy-tooltip"
                title="Only you and the AI coach will see this."
                style={{ cursor: "help", display: "inline-flex" }}
              >
                <Lock size={16} aria-hidden="true" />
                <span
                  id="description-privacy-tooltip"
                  style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap" }}
                >
                  Only you and the AI coach will see this.
                </span>
              </span>
            </div>
            <p
              id="description-helper"
              style={{
                fontSize: "0.875rem",
                color: "var(--text-secondary)",
                marginTop: "0.25rem",
                marginBottom: "0.25rem",
              }}
            >
              Describe your situation in detail.
            </p>
            <textarea
              ref={descriptionRef}
              id="description"
              value={description}
              onChange={(e) => {
                setDescription(e.target.value);
                autoGrowDescription();
              }}
              rows={5}
              aria-describedby="description-helper"
              disabled={submitting}
              style={{
                display: "block",
                width: "100%",
                resize: "none",
                overflow: "hidden",
              }}
            />
            {errors.description && (
              <p
                role="alert"
                style={{
                  color: "var(--danger)",
                  fontSize: "0.875rem",
                  marginTop: "0.25rem",
                }}
              >
                {errors.description}
              </p>
            )}
          </div>

          {/* --- Desired outcome (private) --- */}
          <div style={{ marginBottom: "1.5rem" }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
              <label htmlFor="desired-outcome" style={{ fontWeight: 600 }}>
                Private to you
              </label>
              <span
                tabIndex={0}
                aria-label="Privacy info"
                aria-describedby="outcome-privacy-tooltip"
                title="Only you and the AI coach will see this."
                style={{ cursor: "help", display: "inline-flex" }}
              >
                <Lock size={16} aria-hidden="true" />
                <span
                  id="outcome-privacy-tooltip"
                  style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0,0,0,0)", whiteSpace: "nowrap" }}
                >
                  Only you and the AI coach will see this.
                </span>
              </span>
            </div>
            <p
              id="desired-outcome-helper"
              style={{
                fontSize: "0.875rem",
                color: "var(--text-secondary)",
                marginTop: "0.25rem",
                marginBottom: "0.25rem",
              }}
            >
              What outcome are you hoping for?
            </p>
            <textarea
              id="desired-outcome"
              value={desiredOutcome}
              onChange={(e) => setDesiredOutcome(e.target.value)}
              rows={3}
              aria-describedby="desired-outcome-helper"
              disabled={submitting}
              style={{ display: "block", width: "100%", resize: "vertical" }}
            />
          </div>

          {/* --- Other party name --- */}
          <div style={{ marginBottom: "1.5rem" }}>
            <label htmlFor="other-party-name" style={{ fontWeight: 600 }}>
              Other party&apos;s name
            </label>
            <p
              id="other-party-helper"
              style={{
                fontSize: "0.875rem",
                color: "var(--text-secondary)",
                marginTop: "0.25rem",
                marginBottom: "0.25rem",
              }}
            >
              Just a first name or nickname is fine
            </p>
            <input
              id="other-party-name"
              type="text"
              value={otherPartyName}
              onChange={(e) => setOtherPartyName(e.target.value)}
              aria-describedby="other-party-helper"
              disabled={submitting}
              style={{ display: "block", width: "100%" }}
            />
          </div>

          {/* --- Advanced disclosure (solo mode) --- */}
          <div style={{ marginBottom: "1.5rem" }}>
            <button
              type="button"
              onClick={() => setAdvancedOpen(!advancedOpen)}
              aria-expanded={advancedOpen}
              style={{
                cursor: "pointer",
                fontWeight: 600,
                background: "none",
                border: "none",
                padding: 0,
                font: "inherit",
              }}
            >
              Advanced
            </button>
            {advancedOpen && (
              <div style={{ marginTop: "0.5rem", paddingLeft: "0.25rem" }}>
                <label
                  htmlFor="solo-mode"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.5rem",
                    cursor: "pointer",
                  }}
                >
                  <input
                    id="solo-mode"
                    type="checkbox"
                    checked={isSolo}
                    onChange={(e) => setIsSolo(e.target.checked)}
                    disabled={submitting}
                  />
                  Create this as a solo test case (I&apos;ll play both parties)
                </label>
              </div>
            )}
          </div>

          {/* --- Submit --- */}
          {submitError && (
            <p
              role="alert"
              style={{
                color: "var(--danger)",
                fontSize: "0.875rem",
                marginBottom: "0.75rem",
              }}
            >
              {submitError}
            </p>
          )}
          <Button
            type="submit"
            variant="primary"
            disabled={submitting}
            style={{ width: "100%" }}
          >
            {submitting ? "Creating..." : "Create case"}
          </Button>
        </form>
      </div>
    </main>
  );
}
