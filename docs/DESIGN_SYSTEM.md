# InsightAI Design System

**Status:** Phase 0 design direction; component implementation begins in Phase 1

## Experience principles

InsightAI should feel calm, precise, and alive. The interface takes cues from modern SaaS products
that use disciplined spacing, strong typography, quiet surfaces, and intentional motion, without
copying another product's composition or visual identity.

1. **Clarity before density:** lead with the decision-relevant result and make detail available on
   demand.
2. **Evidence is part of the interface:** values, comparisons, filters, and caveats should never feel
   detached.
3. **Motion communicates change:** animation indicates loading, filtering, or state transition; it is
   not decoration.
4. **States are designed:** loading, empty, unavailable, warning, and error experiences receive the
   same care as success.
5. **Accessible by default:** semantics, keyboard behavior, contrast, focus, and reduced motion are
   component requirements.

## Color tokens

The Phase 0 shell establishes a light theme. Values may be tuned during accessible component and chart
testing; semantic names are the stable contract.

### Core surfaces and text

| Token              | Initial value | Use                                                               |
| ------------------ | ------------- | ----------------------------------------------------------------- |
| `background`       | `#F7F8FB`     | Application canvas                                                |
| `surface`          | `#FFFFFF`     | Cards, popovers, panels                                           |
| `surface-subtle`   | `#F0F2F7`     | Secondary regions and hover fills                                 |
| `foreground`       | `#172033`     | Primary text                                                      |
| `muted-foreground` | `#62708A`     | Secondary text; not for tiny low-contrast labels without checking |
| `border`           | `#DFE4EC`     | Default dividers and outlines                                     |
| `border-strong`    | `#C8D0DD`     | Emphasized boundaries                                             |

### Brand and semantic states

| Token          | Initial value | Use                                                 |
| -------------- | ------------- | --------------------------------------------------- |
| `accent`       | `#5B5BD6`     | Brand accent, selected state, primary action        |
| `accent-hover` | `#4949BC`     | Hover/active action                                 |
| `accent-soft`  | `#EEEEFF`     | Selected background and subtle emphasis             |
| `success`      | `#16875D`     | Confirmed success/positive status                   |
| `warning`      | `#A15C00`     | Caution and data-quality warning                    |
| `danger`       | `#C23A43`     | Error, destructive action, verified negative status |
| `info`         | `#2563A8`     | Neutral informational state                         |

Color is never the only carrier of status. Pair it with text, an icon, shape, or pattern. Positive and
negative chart colors describe direction only when direction is semantically good/bad; revenue decline
may be negative, while cost decline may be positive.

Dark theme is a future enhancement, not a Phase 1 requirement. Do not create a partly supported theme.

## Typography

- **Font stack:** Inter when bundled locally in a future phase, then system sans-serif fallbacks.
  Phase 0 deliberately uses the system stack to keep builds network-independent.
- **Display:** 48–60 px desktop / 36–44 px compact, weight 600, tight tracking, balanced wrapping.
- **Page title:** 30–36 px, weight 600.
- **Section title:** 20–24 px, weight 600.
- **Card title:** 14–16 px, weight 600.
- **Body:** 14–16 px, 1.5–1.65 line height.
- **Label/caption:** 12–13 px, weight 500–600 where needed.
- **Numbers:** enable tabular numerals for KPI tables and aligned comparisons; retain readable unit
  separation and accessible names.

Avoid using font weight alone for hierarchy. Limit line length to roughly 65–75 characters for prose.

## Spacing

Use a 4 px base with the working scale:

| Token      | Value |
| ---------- | ----- |
| `space-1`  | 4 px  |
| `space-2`  | 8 px  |
| `space-3`  | 12 px |
| `space-4`  | 16 px |
| `space-5`  | 20 px |
| `space-6`  | 24 px |
| `space-8`  | 32 px |
| `space-10` | 40 px |
| `space-12` | 48 px |
| `space-16` | 64 px |

Page gutters start at 20 px on mobile, 32 px on tablet/desktop, and use a readable maximum content
width. Dense analytical tables may use 12–16 px cells but must preserve touch targets.

## Radius and shadows

- **Small radius:** 8 px for compact inputs, badges, and small controls.
- **Default radius:** 12 px for buttons, inputs, tooltips, and nested panels.
- **Large radius:** 16 px for cards and dialogs.
- **Pill radius:** 999 px only for tags, segmented status, and avatars—not every button.
- **Card shadow:** low-opacity, wide, and short enough to preserve a professional flat hierarchy.
- **Overlay shadow:** stronger elevation for popovers/dialogs plus a border.

Use one elevation cue at a time where possible. A border is the default; shadow signals layering or a
featured surface.

## Card styling

Cards use the `surface` color, 1 px border, 16 px radius, and 20–24 px padding. KPI cards require:

- accessible title and optional definition affordance;
- value state (`loading`, `ready`, `not applicable`, `insufficient data`, `error`);
- unit and comparison semantics;
- filter/period consistency with the page;
- evidence entry point when a finding or explanation cites the value.

Avoid wrapping every piece of content in nested cards. Related charts and tables may share a single
section surface.

## Buttons

- **Primary:** accent fill, white text, for the one leading action in a region.
- **Secondary:** surface fill, visible border, foreground text.
- **Ghost:** transparent, with a clear hover/focus surface for low-emphasis actions.
- **Destructive:** danger treatment and confirmation proportional to reversibility.
- **Icon button:** minimum 40 × 40 px target, visible tooltip, and accessible name.

All variants include hover, pressed, focus-visible, disabled, and loading behavior. Loading preserves
width, announces progress where appropriate, and prevents duplicate submission.

## Inputs and filters

Inputs use a surface background, visible border, 40–44 px minimum height, 12 px radius, clear label,
optional help text, and inline validation tied through accessible descriptions. Placeholder text is
never the only label.

Filters must show active state and result context, support keyboard operation, and provide a clear
reset path. Apply immediately only when recalculation is fast and predictable; otherwise use an
explicit Apply action and show unapplied changes.

## Charts

Recharts is planned for Phase 4. Chart design rules apply regardless of library:

- Choose the chart from the analytical question, not visual variety.
- Use line charts for time, bars for categorical comparison, and tables when exact lookup dominates.
- Avoid 3D, gauges, decorative gradients, dual axes by default, and pie charts with many categories.
- Use zero baselines for bars. If a line axis is truncated, make the domain clear.
- Keep a stable categorical palette and reserve semantic colors for true status.
- Format currency, percent, and counts consistently with KPI cards.
- Tooltips show dimension, exact value, period, and relevant comparison; they remain keyboard/touch
  accessible through an alternate interaction or data table.
- Provide a concise text summary or table for essential values.
- Do not animate from misleading baselines or replay motion on every minor focus change.

Initial categorical sequence, subject to contrast testing: `#5B5BD6`, `#2D7FB8`, `#16875D`,
`#B36B23`, `#8B5CB8`, `#C04E67`, `#5C708F`, `#7A8F3A`.

## Icons

Lucide is planned for Phase 1. Use 16, 18, 20, or 24 px icons with consistent 1.75–2 px visual
weight. Icons support labels; they do not replace unfamiliar text. Decorative icons are hidden from
assistive technology, while interactive icons receive explicit accessible names.

## Loading states

- Show a skeleton that approximates stable final geometry after a brief delay to avoid flicker.
- Preserve the current result while a lightweight filter recalculates when doing so cannot be
  confused with updated data; mark it as updating.
- Use progress for uploads/parsing when measurable.
- Do not animate skeletons under reduced-motion preference.
- Announce meaningful long-running state changes with a polite live region, not every visual pulse.

## Empty states

Differentiate:

- no dataset selected;
- no rows match active filters;
- a valid dataset has no activity in the period;
- the metric is not applicable;
- there is insufficient comparison history.

Each state names the reason and offers one safe next action such as reset filters, change period, or
review validation. Empty charts must not show fabricated sample values in a real analysis context.

## Error states

- Put field errors next to the field and summary errors at the affected section.
- State what failed, what remains reliable, and what the user can do.
- Preserve the original upload and mapping after recoverable validation errors.
- Provide retry only for retryable operations.
- Never collapse a calculation/data-quality failure into zero.
- Use technical identifiers in expandable detail, not as the primary message.

## Motion and microinteractions

Use 120–180 ms for small hover/press/focus transitions and 180–280 ms for panel/filter transitions.
Preferred easing is an ease-out curve for entering and standard ease for state changes.

Planned patterns:

- KPI values transition only between verified calculation states; an accessible text update remains
  immediate.
- Charts interpolate smoothly after filter changes without obscuring new scales.
- Cards lift at most 1–2 px on hover when they are interactive.
- Tooltips enter quickly and remain stable enough to inspect.
- Success feedback is quiet and proportional; errors do not shake repeatedly.

All essential meaning must be available with animation disabled. Honor `prefers-reduced-motion` by
removing nonessential transforms, count-up animation, parallax, and repeated motion.

## Accessibility standards

- Target WCAG 2.2 AA.
- Maintain at least 4.5:1 contrast for normal text and 3:1 for large text and meaningful UI graphics.
- Preserve logical heading order, landmarks, native controls, labels, and DOM reading order.
- Provide visible focus with at least the target contrast/area required by WCAG 2.2.
- Minimum pointer target is 24 × 24 CSS px per WCAG; target 40 × 40 px for primary product controls.
- Avoid keyboard traps; return focus predictably when dialogs/popovers close.
- Announce validation and asynchronous result changes appropriately.
- Provide text/table alternatives for essential chart information.
- Test at 200% browser zoom and with Windows high-contrast/forced-colors behavior.
- Never rely on hover alone for evidence or definitions.

## Responsive breakpoints

Content is mobile-first. Working breakpoints align with Tailwind defaults:

| Name  | Minimum width | Intent                                              |
| ----- | ------------: | --------------------------------------------------- |
| Base  |          0 px | Single-column compact flow                          |
| `sm`  |        640 px | Wider controls and two-column opportunities         |
| `md`  |        768 px | Tablet navigation and denser layouts                |
| `lg`  |       1024 px | Dashboard grid and persistent side regions          |
| `xl`  |       1280 px | Expanded analytical canvas                          |
| `2xl` |       1536 px | Maximum-density layouts with controlled line length |

Breakpoints are content decisions, not device labels. KPI grids should move from one to two to four
columns only when labels and comparison text remain readable. Data tables may use controlled
horizontal scrolling with sticky identity columns; the page itself should not overflow.

## Phase 1 implementation checklist

- Convert tokens to a complete CSS theme and document any changed contrast values.
- Add shadcn/ui primitives individually and remove unused generated examples.
- Build component state matrices before composing the dashboard shell.
- Add an accessibility test setup appropriate to interactive components.
- Verify compact, tablet, desktop, zoom, forced-colors, and reduced-motion states.
- Use structural placeholder labels rather than fake business numbers.
