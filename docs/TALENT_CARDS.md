# HV-055 talent cards

Implements the approved dark industrial card layout: three equal-height cards, full uncropped artwork, branch label and vector symbol, prominent effect summaries, short HU/EN flavor text, gold selected state and bottom-aligned selection controls. Creation fits three choices without scrolling at 1280×720; later learning retains its scrolling list of levels. The existing game artwork is reused, not the flattened concept mockup.

Details use a styled modal dialog with keyboard focus management and Escape dismissal. Full descriptions, level and incoming prerequisites stay available there. Template-only planned-level/branch boilerplate is removed from the displayed rule description. Authored descriptions remain unchanged in the database.

Effect values are formatted from actual node/power effects. Power cooldown, duration and usage limit are not hardcoded. The catalog migration adds only published powers referenced by the caller's visible trees and localized skill names. It preserves the existing owner/auth checks and all learning/point behavior. Known human/Mercenary names have localized flavor copy; custom nodes retain full authored text in Details.

Validation: production build; CharacterPage creation and later learning browser contract suite, including selection, modal Escape, effect summaries, contain image sizing and no vertical card overflow at 1280×720. SQL rollback test verifies scoped published power metadata, localized skills and anonymous denial against the linked database.

Release: apply `20261022174624_talent_card_presentation.sql` before deploying this frontend. This is an additive catalog change compatible with the current frontend. No point, reward or character data migration.
