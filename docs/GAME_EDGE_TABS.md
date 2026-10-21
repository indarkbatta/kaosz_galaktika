# Main game navigation – external file-folder tabs

The player dashboard now uses eight protruding **left-edge** kartoték tabs, matching the approved mockup. The old header menu was removed, not copied inside the modal. The original Bridge, Combat, Map, Character, Ship, Cantina, Cargo, and Log views and their handlers remain unchanged.

- `src/components/GameEdgeTabs.tsx`: dedicated, reusable HU/EN tab component. Each item is a real button with an outline icon, active state, tooltip, tab semantics, and ArrowUp / ArrowDown / Home / End keyboard support.
- `src/CaptainDashboard.tsx`: game pages continue to be selected by existing `tab` state; navigation now lives just outside the outer game frame, so it does not consume screen real estate within the view. The command header only shows command/captain identity.
- `src/captain-dashboard.css`: dark industrial chamfered external tabs, cyan active accent; the game view remains clipped to its main frame.
- `src/styles.css`: the shared `ch-v2-mount` reserves space for protruding tabs. On narrow viewports, labels collapse to icon-only while retaining accessible button names.

No changes to Supabase, game rules, or the editor navigation. To verify: build the feature branch, visually inspect all eight tabs and narrow widths, check keyboard accessibility and switching, confirm there are no horizontal header tabs. Manual Vercel release only when requested.
