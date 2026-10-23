# Global captain header (HV-064)

Approved layout: captain, species/class/level, energy/regeneration, XP/upgrade points and ship name appear as text in the global application header. The dashboard renders status into the application header host using a React portal, keeping its existing authoritative data and refill action. The portal is removed when leaving the game. Login and editor mastheads retain their normal layout.

The internal command header and four summary cards are removed. Every game tab shares a taller and wider viewport-based frame; Loadout places its inner tabs beside the panel title. Inventory slot sizes scale into the reclaimed space. Main game navigation tabs retain official Lucide icons and keyboard navigation, with a plain rounded rectangle silhouette and no clipped or projecting decoration.

Validation: TypeScript/Vite build, browser checks for portal placement outside the game window, absence of old cards, nine unclipped rounded tabs, full labels, expanded game height, fitting Loadout inventory, and live energy refresh at 1920×1080, 1366×768 and 1280×720. Existing five-slot Loadout browser regression also passes.

No database migration is needed. Implementation does not deploy automatically.
