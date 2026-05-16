import * as React from "react";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "../ui/Dialog";
import { handleConvexError } from "../../lib/errorHandler";

interface ClosureModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onProposeClosure: (summary: string) => Promise<void>;
  onUnilateralClose: (reason?: string) => Promise<void>;
  otherPartyName: string;
}

type ModalView = "idle" | "resolved" | "not-resolved";

export function ClosureModal({
  open,
  onOpenChange,
  onProposeClosure,
  onUnilateralClose,
  otherPartyName,
}: ClosureModalProps): React.ReactElement {
  const [view, setView] = React.useState<ModalView>("idle");
  const [summary, setSummary] = React.useState("");
  const [reason, setReason] = React.useState("");
  const [loading, setLoading] = React.useState(false);
  const [error, setError] = React.useState<string | null>(null);

  // Reset state when open prop transitions to false (covers parent-driven closures)
  React.useEffect(() => {
    if (!open) {
      setView("idle");
      setSummary("");
      setReason("");
      setError(null);
      setLoading(false);
    }
  }, [open]);

  // Reset state when modal closes
  const handleOpenChange = (nextOpen: boolean) => {
    if (!nextOpen) {
      setView("idle");
      setSummary("");
      setReason("");
      setError(null);
      setLoading(false);
    }
    onOpenChange(nextOpen);
  };

  const handlePropose = async () => {
    if (!summary.trim()) return;
    setLoading(true);
    setError(null);
    try {
      await onProposeClosure(summary.trim());
      handleOpenChange(false);
    } catch (err) {
      console.error("Failed to propose closure:", err);
      setError(handleConvexError(err).message);
    } finally {
      setLoading(false);
    }
  };

  const handleUnilateralClose = async () => {
    setLoading(true);
    setError(null);
    try {
      await onUnilateralClose(reason.trim() || undefined);
      handleOpenChange(false);
    } catch (err) {
      console.error("Failed to close session:", err);
      setError(handleConvexError(err).message);
    } finally {
      setLoading(false);
    }
  };

  const handleTakeABreak = () => {
    window.close();
    // If browser blocks window.close(), just close the modal
    handleOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="cc-closure-modal">
        <DialogTitle>Close Session</DialogTitle>

        {view === "idle" && (
          <>
            <DialogDescription>
              How would you like to close this session?
            </DialogDescription>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                gap: 12,
                marginTop: 16,
              }}
            >
              <button
                type="button"
                className="cc-btn cc-btn-primary"
                onClick={() => setView("resolved")}
              >
                Resolved
              </button>
              <button
                type="button"
                className="cc-btn cc-btn-warning"
                onClick={() => setView("not-resolved")}
              >
                Not resolved
              </button>
              <button
                type="button"
                className="cc-btn cc-btn-ghost"
                onClick={handleTakeABreak}
              >
                Take a break
              </button>
            </div>
          </>
        )}

        {view === "resolved" && (
          <>
            <DialogDescription>
              Briefly describe what you agreed to.
            </DialogDescription>
            <textarea
              value={summary}
              onChange={(e) => setSummary(e.target.value)}
              placeholder="Briefly describe what you agreed to"
              rows={5}
              aria-label="Closure summary"
              style={{
                width: "100%",
                marginTop: 12,
                padding: "8px 12px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-default)",
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
                resize: "none",
              }}
            />
            <p
              style={{
                fontSize: 13,
                color: "var(--text-secondary)",
                marginTop: 8,
              }}
            >
              {otherPartyName} will see this summary and confirm.
            </p>
            {error && (
              <p
                style={{
                  color: "var(--danger)",
                  fontSize: 13,
                  marginTop: 8,
                }}
              >
                {error}
              </p>
            )}
            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
                marginTop: 16,
              }}
            >
              <button
                type="button"
                className="cc-btn cc-btn-ghost cc-btn-sm"
                onClick={() => {
                  setView("idle");
                  setSummary("");
                  setError(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="cc-btn cc-btn-primary cc-btn-sm"
                onClick={handlePropose}
                disabled={loading || !summary.trim()}
              >
                Propose Resolution
              </button>
            </div>
          </>
        )}

        {view === "not-resolved" && (
          <>
            <DialogDescription>
              This closes the case immediately for both of you.{" "}
              {otherPartyName} will be notified.
            </DialogDescription>
            <textarea
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Reason (optional)"
              rows={5}
              aria-label="Closure reason"
              style={{
                width: "100%",
                marginTop: 12,
                padding: "8px 12px",
                borderRadius: "var(--radius-md)",
                border: "1px solid var(--border-default)",
                background: "var(--bg-surface)",
                color: "var(--text-primary)",
                resize: "none",
              }}
            />
            {error && (
              <p
                style={{
                  color: "var(--danger)",
                  fontSize: 13,
                  marginTop: 8,
                }}
              >
                {error}
              </p>
            )}
            <div
              style={{
                display: "flex",
                gap: 8,
                justifyContent: "flex-end",
                marginTop: 16,
              }}
            >
              <button
                type="button"
                className="cc-btn cc-btn-ghost cc-btn-sm"
                onClick={() => {
                  setView("idle");
                  setReason("");
                  setError(null);
                }}
              >
                Cancel
              </button>
              <button
                type="button"
                className="cc-btn cc-btn-danger cc-btn-sm"
                onClick={handleUnilateralClose}
                disabled={loading}
              >
                Close without resolution
              </button>
            </div>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
