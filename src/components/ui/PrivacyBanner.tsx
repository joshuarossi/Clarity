import * as React from "react";
import { Lock } from "lucide-react";
import {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "./Dialog";

interface PrivacyBannerProps {
  copy: React.ReactNode;
  className?: string;
}

export function PrivacyBanner({
  copy,
  className,
}: PrivacyBannerProps): React.ReactElement {
  return (
    <div className={["cc-banner-privacy", className].filter(Boolean).join(" ")}>
      <Dialog>
        <DialogTrigger asChild>
          <button
            type="button"
            className="cc-banner-privacy-lock"
            aria-label="Learn more about privacy"
          >
            <Lock size={16} />
          </button>
        </DialogTrigger>
        <DialogContent>
          <DialogTitle>Your privacy</DialogTitle>
          <DialogDescription>
            This conversation is completely private. Only you and your AI coach
            can see it. None of it is shared with the other party.
          </DialogDescription>
        </DialogContent>
      </Dialog>
      <span>{copy}</span>
    </div>
  );
}
