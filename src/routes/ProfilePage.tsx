import { useState, useEffect } from "react";
import { useQuery, useMutation } from "convex/react";
import { useAuthActions } from "@convex-dev/auth/react";
import { useNavigate } from "react-router-dom";
import { api } from "../../convex/_generated/api";
import { Button } from "../components/ui/button";
import { LoadingSpinner } from "../components/layout/LoadingSpinner";

export function ProfilePage(): React.ReactElement {
  const user = useQuery(api.users.me);
  const updateDisplayName = useMutation(api.users.updateDisplayName);
  const { signOut } = useAuthActions();
  const navigate = useNavigate();

  const [displayName, setDisplayName] = useState("");
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  useEffect(() => {
    if (user?.displayName != null) {
      setDisplayName(user.displayName);
    }
  }, [user?.displayName]);

  if (user === undefined) {
    return <LoadingSpinner />;
  }

  if (user === null) {
    return (
      <main style={{ display: "flex", justifyContent: "center", alignItems: "center", minHeight: "100vh" }}>
        <div className="cc-card" style={{ maxWidth: 400, width: "100%", padding: "2rem" }}>
          <p role="alert">Unable to load your profile. Please try signing in again.</p>
        </div>
      </main>
    );
  }

  async function handleSaveDisplayName() {
    const trimmed = displayName.trim();
    if (!trimmed) return;
    setSaving(true);
    setSaved(false);
    setSaveError(null);
    try {
      await updateDisplayName({ displayName: trimmed });
      setSaved(true);
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : "Failed to save display name. Please try again.");
    } finally {
      setSaving(false);
    }
  }

  async function handleSignOut() {
    try {
      await signOut();
    } catch {
      // Best-effort sign-out — navigate to login regardless.
    }
    navigate("/login");
  }

  return (
    <main
      style={{
        display: "flex",
        justifyContent: "center",
        alignItems: "center",
        minHeight: "100vh",
      }}
    >
      <div
        className="cc-card"
        style={{ maxWidth: 400, width: "100%", padding: "2rem" }}
      >
        <h1>Profile</h1>

        <div style={{ marginBottom: "1.5rem" }}>
          <label htmlFor="profile-display-name">Display name</label>
          <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.25rem" }}>
            <input
              id="profile-display-name"
              type="text"
              value={displayName}
              onChange={(e) => {
                setDisplayName(e.target.value);
                setSaved(false);
              }}
              disabled={saving}
              style={{ flex: 1 }}
            />
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={handleSaveDisplayName}
              disabled={saving || !displayName.trim()}
            >
              Save
            </Button>
          </div>
          {saved && (
            <p role="status" style={{ fontSize: "0.875rem", color: "var(--cc-success, #16a34a)", marginTop: "0.25rem" }}>
              Display name updated.
            </p>
          )}
          {saveError && (
            <p role="alert" style={{ color: "var(--cc-danger, #dc2626)", fontSize: "0.875rem", marginTop: "0.25rem" }}>
              {saveError}
            </p>
          )}
        </div>

        <div style={{ marginBottom: "1.5rem" }}>
          <span>Email</span>
          <p style={{ marginTop: "0.25rem" }}>
            {user.email}
          </p>
        </div>

        <Button
          type="button"
          variant="secondary"
          onClick={handleSignOut}
          style={{ width: "100%" }}
        >
          Sign out
        </Button>
      </div>
    </main>
  );
}
