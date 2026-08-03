# UI primitives

Phase 1 implements the shared accessible primitives used by the application shell: buttons, icon
buttons, cards, badges, tooltips, select presentations, skeletons, feedback states, section headers,
and the responsive table shell.

Primitives consume semantic tokens from `src/app/globals.css`. Variants use
`class-variance-authority`; class composition uses `clsx` and `tailwind-merge`. Add a shadcn/ui
primitive only when a future interaction needs its behavior, then adapt it to these tokens and remove
unused generated examples.

Feature-specific content and business semantics do not belong in this directory.
