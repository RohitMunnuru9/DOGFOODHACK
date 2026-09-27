# White clay interface

The signed-in portal uses a white clay design with warm terracotta, sage, and sand accents. The selected concept is [02-clay.png](ui-concepts/02-clay.png). UI text, counts, deadlines, progress, and actions use the existing event API.

## Navigation and state

The organizer workspace opens on Overview. Submissions, Teams, Judging, Results, Community, and Settings separate the work into focused views. Participants open their submission workspace; judges open their assigned reviews. Sidebar and role highlights move with spring transitions.

Views fade between sections while keeping form elements mounted, so switching tabs preserves unfinished form entries. Event changes replace the old content with a skeleton until a complete, current event snapshot is ready. Stale responses cannot overwrite a newer selection. Saving uses an indeterminate progress strip while retaining the visible content.

## Controls and motion

- Custom comboboxes support arrows, Home/End, Enter/Space, Escape, typeahead, outside dismissal, and multi-select judge tracks. Hidden inputs preserve form submission values.
- Date/time fields accept typed local timestamps or a custom calendar with month navigation, keyboard day navigation, hour/minute lists, Today, Clear, and Done. Invalid calendar dates are rejected before submission. Existing conversions to API timestamps remain intact.
- Numeric fields have custom increment/decrement controls; checkboxes and file-upload surfaces use the same clay styling. File selection still opens the operating system's secure file picker.
- Pointer-responsive cards rotate by at most one degree on either axis. Progress fills animate. Motion respects `prefers-reduced-motion`; cursor effects also require a fine pointer.
- Public galleries, project details, invitation pages, embeds, and certificates share the light material. Public gallery filters progressively enhance to custom dropdowns; the underlying HTML forms remain available without JavaScript.

## Verification

`npx playwright test` covers the existing account, submission, judging, voting, archive, and publication workflows plus keyboard dropdowns, multi-select values, date/time selection, number steppers, draft preservation, rapid navigation, skeleton loading, and reduced motion. The visual test captures every organizer section at a 390px viewport and asserts no horizontal page overflow. Desktop and phone screenshots are written to `test-results/clay-*.png`.

The API's role isolation, deadlines, atomic writes, archives, scoring, and publication rules are unchanged by the visual redesign. Run the Python suite and the unmodified host acceptance checker alongside the browser suite as described in [TESTING.md](../TESTING.md).
