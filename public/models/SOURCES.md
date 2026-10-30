# 3D model sources

Every model here is CC0 (public domain) — see `research/3d-booking/asset-sourcing.md`
for the original research that identified these. Credit to Kenney isn't
required by CC0, but it's given anyway, matching this repo's existing habit
of citing sources throughout `research/3d-booking/`.

## washer.glb, dryer.glb, kitchenSink.glb, lampSquareCeiling.glb, table.glb

- **Source asset**: Kenney's "Furniture Kit"
- **Original page**: <https://kenney.nl/assets/furniture-kit>
- **License**: CC0 1.0 Universal (<https://creativecommons.org/publicdomain/zero/1.0/>)
- **Downloaded via**: the itch.io GLB mirror,
  <https://eclair-assets.itch.io/furniture-kit-glb-pack-140-free-cc0-3d-models>
  ("Furniture Kit GLB Pack" by Eclair Assets — a GLB-only redistribution of
  the same CC0 source, chosen because it ships ready-to-use `.glb` files
  directly, sidestepping an OBJ→glTF conversion step)
- Model names taken verbatim from the pack: `washer.glb`, `dryer.glb`,
  `kitchenSink.glb`, `lampSquareCeiling.glb`, `table.glb` (the last reused for
  both the ironing table and the drop-off shelf per `plans/3d-walkthrough.md`
  Stage 8.2 — no separate ironing-board or shelf model exists in the pack by
  name, and none is needed).

## character.glb + Textures/colormap.png

- **Source asset**: Kenney's "Mini Characters"
- **Original page**: <https://kenney.nl/assets/mini-characters>
- **License**: CC0 1.0 Universal (<https://creativecommons.org/publicdomain/zero/1.0/>)
- **Downloaded via**: kenney.nl directly (the "Continue without donating..."
  path on the donation prompt)
- One of the 12 interchangeable rigged characters (`character-male-a.glb`
  in the source pack, renamed `character.glb` here), chosen arbitrarily —
  per the plan, the character's own material is overridden with a single
  flat colour in code, so which of the 12 was picked makes no visible
  difference.
- **Packaging caveat** (documented in `research/3d-booking/asset-sourcing.md`
  before downloading): the GLB references an external texture file
  (`Textures/colormap.png`) rather than embedding it — kept alongside the
  model here for that reason, even though the in-code material override
  means the texture is never actually sampled at runtime.
- Animations embedded in the GLB include `idle`, `walk`, `pick-up`, and
  several others — `walk` and `idle` are what Stage 8.3 uses.
