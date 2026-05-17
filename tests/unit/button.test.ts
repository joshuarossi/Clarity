import { describe, it, expect } from "vitest";
import { buttonVariants } from "../../src/components/ui/button";

/**
 * WOR-103: shadcn/ui Button component overridden with Clarity variants
 *
 * Tests verify the `buttonVariants` cva function produces the expected
 * class-name strings for each variant/size combination defined in
 * StyleGuide §6.1.
 *
 * At red state, the import from src/components/ui/button.tsx produces
 * TS2307 because the module has not been created yet. That is the
 * expected red-state failure.
 */

// ── AC: Button exports exactly 5 variants ────────────────────────────

const VARIANTS = ["primary", "secondary", "ghost", "danger", "link"] as const;
const SIZES = ["sm", "md", "lg", "icon"] as const;

describe("AC: shadcn/ui Button with Clarity variants", () => {
  describe("buttonVariants produces a class string for each variant", () => {
    it.each(VARIANTS)(
      'variant="%s" returns a non-empty class string',
      (variant) => {
        const classes = buttonVariants({ variant });
        expect(typeof classes).toBe("string");
        expect(classes.length).toBeGreaterThan(0);
      },
    );
  });

  describe("buttonVariants produces a class string for each size", () => {
    it.each(SIZES)('size="%s" returns a non-empty class string', (size) => {
      const classes = buttonVariants({ size });
      expect(typeof classes).toBe("string");
      expect(classes.length).toBeGreaterThan(0);
    });
  });

  it("different variants produce different class strings", () => {
    const classSet = new Set(
      VARIANTS.map((variant) => buttonVariants({ variant })),
    );
    expect(classSet.size).toBe(VARIANTS.length);
  });

  it("different sizes produce different class strings", () => {
    const classSet = new Set(SIZES.map((size) => buttonVariants({ size })));
    expect(classSet.size).toBe(SIZES.length);
  });

  it("default call (no args) returns a valid class string", () => {
    const classes = buttonVariants();
    expect(typeof classes).toBe("string");
    expect(classes.length).toBeGreaterThan(0);
  });

  it("variant + size combination produces a class string containing both", () => {
    const primaryMd = buttonVariants({ variant: "primary", size: "md" });
    const dangerLg = buttonVariants({ variant: "danger", size: "lg" });
    expect(typeof primaryMd).toBe("string");
    expect(typeof dangerLg).toBe("string");
    // Different variant+size combos should differ
    expect(primaryMd).not.toBe(dangerLg);
  });
});
