## WOR-99 — Prompt assembly module

Added `convex/lib/prompts.ts`, a centralized prompt-assembly function
(`assemblePrompt`) that every AI interaction in Clarity routes through.
It enforces strict context isolation per role: Private Coach sees only
the acting party's data, Synthesis includes both parties with an
anti-quotation safeguard, Coach receives joint history plus synthesis
texts (never raw private messages), and Draft Coach is limited to the
drafting user's own synthesis. Template-version instructions are
injected when a category-specific template is available.
