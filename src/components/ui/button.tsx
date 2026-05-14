import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";

const buttonVariants = cva(
  [
    "inline-flex items-center justify-center gap-2",
    "font-medium leading-5 whitespace-nowrap",
    "border border-transparent rounded-[var(--radius-md)]",
    "transition-colors duration-[var(--dur-fast)]",
    "disabled:opacity-50 disabled:cursor-not-allowed disabled:pointer-events-none",
    "focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--accent)]",
  ].join(" "),
  {
    variants: {
      variant: {
        primary:
          "bg-[var(--accent)] text-[var(--accent-on)] border-[var(--accent)] hover:bg-[var(--accent-hover)] hover:border-[var(--accent-hover)]",
        secondary:
          "bg-[var(--bg-surface)] text-[var(--text-primary)] border-[var(--border-strong)] hover:bg-[var(--bg-surface-subtle)]",
        ghost:
          "bg-transparent text-[var(--text-primary)] border-transparent hover:bg-[var(--bg-surface-subtle)]",
        danger:
          "bg-[var(--danger)] text-white border-[var(--danger)] hover:opacity-90",
        link:
          "bg-transparent text-[var(--accent)] border-transparent underline underline-offset-2 hover:text-[var(--accent-hover)] p-0 h-auto",
      },
      size: {
        sm: "h-8 px-3 text-[13px] rounded-[var(--radius-sm)]",
        md: "h-10 px-4 text-[14px]",
        lg: "h-12 px-6 text-[15px]",
        icon: "h-9 w-9 p-2",
      },
    },
    defaultVariants: {
      variant: "primary",
      size: "md",
    },
  },
);

interface ButtonProps
  extends React.ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  asChild?: boolean;
}

const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, size, asChild = false, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";
    return (
      <Comp
        className={[buttonVariants({ variant, size }), className]
          .filter(Boolean)
          .join(" ")}
        ref={ref}
        {...props}
      />
    );
  },
);
Button.displayName = "Button";

export { Button, buttonVariants };
