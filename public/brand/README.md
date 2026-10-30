# globe identity assets

`globe-mark.svg` is the original scalable production symbol, composed from smooth open orbital ribbons with rounded terminals and a pink, orange, red, blue and teal gradient. It contains no text, registration mark, generic map grid or Manifold monogram. `components/brand.tsx` pairs it with the exact lowercase HTML wordmark `globe`; the text inherits the surrounding color.

`globe-concept.png` preserves the transparent concept made with the built in image generation tool on 2026 10 29. The supplied Manifold screenshot was inspected only as a style reference. It was not copied into a production asset. The vector is an original code native refinement of the generated orbital concept, so small navigation sizes remain clean.

Generation prompt:

> Use case: logo-brand. Asset type: original brand SYMBOL ONLY for globe, a premium property discovery application. Create a single original drawn globe symbol on genuine transparent background, no text or lettering. Smooth continuous open ribbon strokes describe an expressive tilted orb with 2 or 3 flowing intersecting orbital curves. Inspired by the reference's luminous flat multicolor handwriting and restrained tech aesthetic, but DO NOT reproduce its m monogram. Flat vector-friendly ribbon, rounded terminals, consistent generous stroke weight, subtle flowing gradient pink into orange red into blue and teal green. Asymmetric human drawn orbital sphere silhouette, not a generic longitude latitude globe grid, no continents, no 3D, no bevel, no shadow, no glow haze, no decoration, no registration mark, no background. Centered, large readable silhouette with clean edges and modest margins. Intended to work as a small 32 px symbol beside an exact HTML lowercase wordmark. Produce only one symbol.

API: `Brand({ size = 36, markOnly = false, className, style })` and `GlobeMark({ size = 36, className })`. The symbol is decorative inside Brand, while the full component exposes the accessible brand name. A standalone decorative GlobeMark should sit in a link or button with its own accessible name.
