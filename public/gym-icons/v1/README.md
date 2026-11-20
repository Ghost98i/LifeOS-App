# LifeOS Gym Equipment SVG Set (V2 — High-Contrast Industrial Blocks)

All **39** SVG files in `public/gym-icons/v1/` are **100% original first-party vector illustrations authored for Celestian LifeOS** (updated 2026-11-19). No third-party icons, Noun Project assets, Icons8 assets, embedded attributions, or external packages remain in this directory.

## Visual & Technical Contract (V2)

- **Subject rule:** Strictly gym equipment, machines, benches, racks, cables, barbells, plates, dumbbells, and workout tools. **Zero human figures, silhouettes, or stick figures.**
- **Geometry:** Clean `viewBox="0 0 64 64"`, useful artwork filling 84%–90% of the canvas (effective bounds ~4..60), thick solid mechanical blocks (`rx="2"` to `"3"`, minimum structural widths 3.5px–4.5px), LF line endings, no editor metadata, no scripts, no external fonts.
- **Unified V2 High-Contrast Palette (dark & light mode legible from 24px):**
  - Primary metallic frame / structure (Titanio Medio): `#94A3B8`
  - Upholstery, bases, secondary blocks & depth (Pizarra Media): `#64748B`
  - Shafts, rails, highlights & plane separation (Acero Claro): `#CBD5E1`
  - Functional LifeOS Accent (`#6366F1`, secondary depth `#4F46E5`, minimal highlight `#818CF8`): reserved exclusively for loaded weights, active stacks, push rollers, dumbbell heads, or primary moving assemblies.
  - Dark slates (`#0F172A`, `#1E293B`, `#334155`) are prohibited so silhouettes never disappear against dark UI buttons.
- **Generator:** Regenerate deterministically via `node scripts/generate-etapa-b-assets.mjs`.

## License Status

- **Author / Rights Holder:** Celestian LifeOS (first-party original artwork).
- **Distribution Status:** **GO — cleared for commercial and Play Store distribution.** Every entry in `src/lib/gymIconRegistry.ts` is marked `licenseStatus: 'first-party-original'` and verified automatically by `src/lib/gymArtwork.test.ts`.
