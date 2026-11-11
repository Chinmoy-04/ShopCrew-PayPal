# Distinct scent photography

Generated with the built-in `image_gen` tool. Each scent has its own environment,
lighting, palette and composition while retaining the ivory ceramic vessel and
forest-green label with the scent name printed in ivory serif type. Production assets are saved in
`apps/web/public/images/hearth-wick/<scent>-scene.webp` (960px) and
`<scent>-scene-480.webp` (480px), for cedar, linen, fig, night, honey and citrus.
The storefront and product detail page share these assets.

## Verification

- Web TypeScript check and production build passed; all twelve responsive assets
  are present in the production output.
- Chromium checks with fixture catalog responses passed at 1440px and 390px:
  all six new images decoded successfully, and all six product detail routes
  loaded their new images with descriptive alt text.
- Desktop and mobile storefront screenshots were visually reviewed and saved
  locally as `.data/product-scenes-shop-1440.png` and
  `.data/product-scenes-shop-390.png`.

## Final prompts

### Label edit pass

Built-in `image_gen` edits used each existing scene as the edit target. Final
assets replace the same 960px/480px WebP files; the image URLs include
`?v=labels-1` to refresh cached photos. Exact label names: Cedar & Smoke,
Linen & Sea Salt, Fig Leaf, Night Market, Honey Tobacco, Citrus Grove.

Shared edit prompt (substitute the exact name for `{NAME}`):

> Use case: precise-object-edit. Input image is the edit target: existing candle product photograph. Edit ONLY the blank forest-green rectangular label on the candle. Print the exact scent name "{NAME}" in warm ivory, centered, elegant readable medium-weight serif lettering, two lines if needed, large enough to fill approximately 75% of label width with comfortable margins. Match all six products with the same refined typography. Text must look physically printed on the green paper label, following its cylindrical curvature and perspective, with natural scene lighting. Preserve the forest-green label, candle, vessel, wick, flame or smoke, all props, scene, lighting, color, framing, and composition exactly. Do not add brand name, tiny text, logos, extra words, borders, ornaments, or anything elsewhere. Keep the image square. Exact text (verbatim): "{NAME}".

The original scene-generation prompts follow for provenance.

### honey

Use case: product-mockup. Create one square photorealistic premium editorial ecommerce candle photograph, 1024x1024. Brand family Hearth & Wick: one cylindrical ivory ceramic candle, cream wax, single wick, small blank deep forest-green rectangular label, no lettering. Keep that product identity consistent, but make the entire environment and photographic composition specific to this scent. Real tactile materials and convincing photography. Candle must be clearly visible and occupy approximately 45-55 percent of frame height with safe margins for square cropping. No collage, no graphic overlays, no typography, no watermark. Honey Tobacco. Intimate amber-lit study at dusk. Candle sits on a dark walnut writing desk, photographed low at three-quarter angle, on the left of center. Rich caramel light rakes across the ceramic. Behind it, an unfocused cognac leather chair and tobacco-brown plaster make a warm enveloping scene. A small piece of honeycomb on a dark glazed dish and softly curled dried tobacco leaves rest naturally on the desk to the right. Deep warm browns, honey gold highlights and long moody shadows. No cigarettes, no cigars. This must look like a warm study, never a beige studio product setup.

### night

Use case: product-mockup. Create one square photorealistic premium editorial ecommerce candle photograph, 1024x1024. Brand family Hearth & Wick: one cylindrical ivory ceramic candle, cream wax, single wick, small blank deep forest-green rectangular label, no lettering. Keep that product identity consistent, but make the entire environment and photographic composition specific to this scent. Real tactile materials and convincing photography. Candle must be clearly visible and occupy approximately 45-55 percent of frame height with safe margins for square cropping. No collage, no graphic overlays, no typography, no watermark. Night Market. A cinematic urban evening scene on a dark slate outdoor cafe ledge after rain, low three-quarter view, candle on the right of center with a gently lit wick. Behind it, strongly blurred distant amber market lanterns and muted plum city light reflected on wet asphalt. A flowering jasmine vine enters from the upper left, a single elegant twist of orange peel lies by the vessel. Deep indigo, smoky violet, warm orange bokeh, night atmosphere with enough soft light that the ivory candle and green blank label are visible. Sophisticated realistic night photography, not a studio backdrop.

### fig

Use case: product-mockup. Create one square photorealistic premium editorial ecommerce candle photograph, 1024x1024. Brand family Hearth & Wick: one cylindrical ivory ceramic candle, cream wax, single wick, small blank deep forest-green rectangular label, no lettering. Keep that product identity consistent, but make the entire environment and photographic composition specific to this scent. Real tactile materials and convincing photography. Candle must be clearly visible and occupy approximately 45-55 percent of frame height with safe margins for square cropping. No collage, no graphic overlays, no typography, no watermark. Fig Leaf. Lush Mediterranean garden afternoon, camera looking diagonally down from 45 degrees. Unlit ivory candle on the lower right of a moss-green glazed outdoor table, large living fig leaves form a bold canopy and cast crisp leafy shadows across the table and vessel. A cut ripe purple fig and one whole fig near the upper left, blurred living foliage beyond. Fresh botanical green, purple fruit, dappled bright sunlight, generous organic negative space. Garden setting is the main scene, not a beige wall with small foreground ingredients.

### cedar

Use case: product-mockup. Create one square photorealistic premium editorial ecommerce candle photograph, 1024x1024. Brand family Hearth & Wick: one cylindrical ivory ceramic candle, cream wax, single wick, small blank deep forest-green rectangular label, no lettering. Keep that product identity consistent, but make the entire environment and photographic composition specific to this scent. Real tactile materials and convincing photography. Candle must be clearly visible and occupy approximately 45-55 percent of frame height with safe margins for square cropping. No collage, no graphic overlays, no typography, no watermark. Cedar & Smoke. Architectural woodland still life in a dark cedar-lined cabin. Candle stands on an end-grain cedar stump slightly left of center, low eye-level photograph. Vertical rough cedar boards and a softly blurred shadowed forest opening behind it. One tiny wisp of smoke rises naturally from a just-extinguished wick. Split reddish cedar timber creates strong diagonal lines on the right. Rich reddish wood, deep charcoal shadows, cool misty forest side-light, dramatic tactile atmosphere. No fire or flames apart from extinguished candle, no beige limestone, no foreground ingredient arrangement.

### linen

Use case: product-mockup. Create one square photorealistic premium editorial ecommerce candle photograph, 1024x1024. Brand family Hearth & Wick: one cylindrical ivory ceramic candle, cream wax, single wick, small blank deep forest-green rectangular label, no lettering. Keep that product identity consistent, but make the entire environment and photographic composition specific to this scent. Real tactile materials and convincing photography. Candle must be clearly visible and occupy approximately 45-55 percent of frame height with safe margins for square cropping. No collage, no graphic overlays, no typography, no watermark. Linen & Sea Salt. Fresh coastal bedroom morning. Ivory candle sits on a whitewashed wooden windowsill at the right third, shot from slightly above at an oblique angle. A sheer white linen curtain billows inward through the left half of the scene, with a soft-focus pale blue sea and hazy horizon visible through the open window behind. Rumpled washed linen drapes along the sill; a small shallow ceramic dish with a few sea salt crystals is subtle. Cool airy whites, chalk, powder blue and soft sunlight. Light breathable lifestyle photography, visibly coastal setting, no beige studio wall.

### citrus

Use case: product-mockup. Create one square photorealistic premium editorial ecommerce candle photograph, 1024x1024. Brand family Hearth & Wick: one cylindrical ivory ceramic candle, cream wax, single wick, small blank deep forest-green rectangular label, no lettering. Keep that product identity consistent, but make the entire environment and photographic composition specific to this scent. Real tactile materials and convincing photography. Candle must be clearly visible and occupy approximately 45-55 percent of frame height with safe margins for square cropping. No collage, no graphic overlays, no typography, no watermark. Citrus Grove. Vibrant sun-drenched orange orchard still life. Ivory candle on a faded terracotta garden pedestal at left of center, photographed from a high oblique angle. An orange branch laden with two whole bitter oranges and glossy green leaves hangs through upper right. One freshly cut orange half on the pedestal catches hard noon sun. Background is blurred orchard greenery, saturated orange and terracotta with deep leaf-green shadows. Graphic diagonal sun shadow, lively Mediterranean warmth, spacious premium photography, no beige studio wall.
