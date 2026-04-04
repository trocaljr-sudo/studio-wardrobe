# Studio Wardrobe Hardening Checklist

## Cross-app polish

- [x] Sweep core screens for theme consistency in dark, light, and system mode
- [x] Bring detail flows onto the shared themed shell and ambient background
- [x] Normalize image framing so product shots fit more fully across wardrobe and detail surfaces
- [x] Keep private-image rendering resilient with signed URLs and null-safe fallbacks

## Web and cross-platform behavior

- [x] Restore web boot reliability and required providers/dependencies
- [x] Guard native-only picker imports so the web bundle can load cleanly
- [x] Add a cross-platform image source picker sheet for Add Item instead of platform-fragile fallback alerts
- [x] Keep iOS native action-sheet behavior where it already feels right

## Intelligence and history depth

- [x] Add weather-aware recommendation tuning with manual override
- [x] Layer local weather detection on top of manual weather controls
- [x] Cache local weather responses so the feature degrades more gracefully
- [x] Add one-tap actions for smart suggestions: save look, open in builder, assign to next event
- [x] Tune builder-assistant suggestions with selected occasions and tags
- [x] Surface a compact "What should I wear today" preview on the wardrobe home surface
- [x] Strengthen closet insights and usage signals from saved outfits and events

## Settings and profile depth

- [x] Expand settings into a fuller profile/settings surface
- [x] Add wardrobe snapshot stats
- [x] Add style-profile summary and learning signals
- [x] Add quick navigation links back into the main app areas
- [x] Keep appearance controls for system, light, and dark modes

## Navigation and flow cleanup

- [x] Keep post-save routes predictable for items, outfits, and events
- [x] Refresh core list screens on return from create/edit flows
- [x] Keep bottom navigation focused on the core destinations
- [x] Move add-item entry into the wardrobe home experience

## Verification

- [x] Typecheck passes with `npx tsc --noEmit`
- [x] Final commit checkpoint for this hardening pass
