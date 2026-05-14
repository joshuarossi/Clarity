import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { Slot } from "@radix-ui/react-slot";

const buttonVariants = cva("cc-btn", {
  variants: {
    variant: {
      primary: "cc-btn-primary",
      secondary: "cc-btn-secondary",
      ghost: "cc-btn-ghost",
      danger: "cc-btn-danger",
      link: "cc-btn-link",
    },
    size: {
      sm: "cc-btn-sm",
      md: "cc-btn-md",
      lg: "cc-btn-lg",
      icon: "cc-btn-icon",
    },
  },
  defaultVariants: {
    variant: "primary",
    size: "md",
  },
});

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
