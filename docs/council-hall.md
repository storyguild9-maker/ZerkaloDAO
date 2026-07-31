# Council Hall

The inner temple is a council hall: every connected person receives a visible seat at the round table.

## Core Idea

- One connection maps to one council seat.
- A seat is not just UI. It is a spatial presence marker inside the 3D hall.
- The round table is the shared field: discussion, decisions, rituals, and future collaborative mechanics happen around it.
- The far portal axis remains as the deeper inner path, while the table is the social center.

## Seat States

- `open` - the place exists but nobody is currently connected.
- `reserved` - a participant/session is expected, invited, or queued.
- `present` - an active connected participant occupies the place.

## Current Implementation

- Seat schema: `src/lib/councilHall.ts`.
- 3D rendering: `src/components/DaoInnerSanctum.tsx`.
- Concept references: `public/images/inner-council/`.

The first implementation uses 12 seats around the table. Later this can be linked to live sessions from Supabase or WebSocket presence.

## Meshy Asset Breakdown

Priority objects to generate as individual 3D assets:

1. Round marble-and-gold council table.
2. Ornate council chair, neutral version.
3. Ornate council chair, occupied/present version.
4. Gold table rim and circular inlay set.
5. Central table sigil disk.
6. White marble floor tile with gold filigree.
7. Black marble floor tile with gold filigree.
8. Gothic-gold arch window module.
9. Tall white-gold column module.
10. Black-gold-violet column module.
11. Violet crystal column insert.
12. Wall candle/candelabra module.
13. Hanging golden ceiling lamp.
14. Ceiling circular mandala panel.
15. Waterfall side feature.
16. Garden planter with white flowers.
17. Mountain vista arch frame.
18. Golden filigree arch detail.
19. Small ceremonial table object set.
20. Seat presence light marker.
## Generated Meshy References

First council-hall image reference package saved in `public/images/meshy-references/`:

- `82-council-round-marble-gold-table.png`
- `83-ornate-council-chair-neutral.png`
- `84-white-gold-gothic-column.png`
- `85-black-gold-violet-crystal-column.png`
- `86-gothic-gold-arch-window-module.png`
- `87-stained-glass-lancet-panel.png`
- `88-marble-gold-side-waterfall-feature.png`
- `89-ceiling-circular-mandala-disk.png`
- `90-gold-filigree-floor-inlay-set.png`
- `91-council-seat-presence-light-marker.png`
