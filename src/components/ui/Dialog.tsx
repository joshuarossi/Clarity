import * as React from "react";
import * as RadixDialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";

const Dialog = RadixDialog.Root;

const DialogTrigger = RadixDialog.Trigger;

const DialogClose = RadixDialog.Close;

const DialogContent = React.forwardRef<
  React.ComponentRef<typeof RadixDialog.Content>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Content> & {
    className?: string;
  }
>(({ className, children, ...props }, ref) => (
  <RadixDialog.Portal>
    <RadixDialog.Overlay className="cc-dialog-overlay" />
    <RadixDialog.Content
      ref={ref}
      className={["cc-dialog-content", className].filter(Boolean).join(" ")}
      {...props}
    >
      {children}
      <RadixDialog.Close className="cc-dialog-close" aria-label="Close">
        <X size={16} />
      </RadixDialog.Close>
    </RadixDialog.Content>
  </RadixDialog.Portal>
));
DialogContent.displayName = "DialogContent";

const DialogTitle = React.forwardRef<
  React.ComponentRef<typeof RadixDialog.Title>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Title>
>(({ className, ...props }, ref) => (
  <RadixDialog.Title
    ref={ref}
    className={["cc-dialog-title", className].filter(Boolean).join(" ")}
    {...props}
  />
));
DialogTitle.displayName = "DialogTitle";

const DialogDescription = React.forwardRef<
  React.ComponentRef<typeof RadixDialog.Description>,
  React.ComponentPropsWithoutRef<typeof RadixDialog.Description>
>(({ className, ...props }, ref) => (
  <RadixDialog.Description
    ref={ref}
    className={["cc-dialog-description", className].filter(Boolean).join(" ")}
    {...props}
  />
));
DialogDescription.displayName = "DialogDescription";

export {
  Dialog,
  DialogTrigger,
  DialogContent,
  DialogTitle,
  DialogDescription,
  DialogClose,
};
