# Web 3D tech stack options, against our existing constraints

Existing constraints from `docs/adr/0003-tech-stack.md`: Hono server,
TypeScript/Node 24 run directly (no build step), Hono JSX + htmx for pages,
one Fly machine at 256MB RAM, one Dockerfile. Any 3D addition is evaluated
against whether it needs a bundler/build step — introducing one is a real
architectural change (new Dockerfile stage, new toolchain), not a drop-in.

## Rendering engines

| Engine | Needs a build step? | Bundle size (min+gzip) | Declarative HTML or imperative JS? | Notes |
|---|---|---|---|---|
| **three.js** | No — works via a single CDN `<script>` tag | ~185 kB | Imperative (write JS to build the scene) | Smallest, most flexible, largest ecosystem/tutorial base. Standard raycaster + `OrbitControls` pattern for clickable objects is well documented. ([LogRocket comparison](https://blog.logrocket.com/three-js-vs-babylon-js/), [sbcode.net raycaster tutorial](https://sbcode.net/threejs/mousepick/)) |
| **Babylon.js** | No — CDN script tag works, same as three.js | ~1.8 MB (full `@babylonjs/core`) | Imperative, but with more built-in conveniences (camera controls, materials, physics, a visual Inspector/Playground) out of the box | ~25 lines for a basic scene vs three.js's ~40, per comparison sources — but ~10x the bundle size if importing the full core. ([utsubo.com comparison](https://www.utsubo.com/blog/threejs-vs-babylonjs-vs-playcanvas-comparison)) |
| **A-Frame** | No — single `<script>` tag, HTML-based (`<a-scene>`, `<a-entity>`) | Built on three.js under the hood | **Declarative HTML** — scenes are markup, not JS | Explicitly designed for "nothing to install, no build step." Ships `<a-gltf-model>` as a built-in primitive for glTF assets. Click/hover interaction isn't built-in like a 2D `onclick` — needs a raycaster-based cursor component (`<a-cursor>` or a gaze/laser cursor), which is a few extra lines but well documented. WebXR/VR-ready by default (bonus if we ever want a phone-AR mode). ([aframe.io docs](https://aframe.io/docs/1.8.0/introduction/), [CSS-Tricks intro](https://css-tricks.com/minecraft-webvr-html-using-frame/)) |
| **`<model-viewer>`** (Google) | No — single `<script>` tag, a true web component (`<model-viewer src="...">`) | Small, purpose-built | Declarative HTML, single-model only | Built for viewing *one* model with optional AR hand-off, not a multi-object interactive scene. Does support **hotspots**: child elements become clickable/interactive points tied to 3D positions on the model, including camera-fly-to behavior per hotspot. ([web.dev article](https://web.dev/articles/model-viewer), [modelviewer.dev hotspot examples](https://modelviewer.dev/examples/annotations/)) **Verdict: too limited for a whole room with ~10 independently-stateful machines** — it's built around one glTF file as the unit, not a scene graph of many objects each bound to live data. Could work if the *entire room* were exported as one glTF and hotspots were laid over fixed positions, but that's fighting the tool rather than using it as intended. |
| **PlayCanvas (engine only, via CDN)** | No — engine itself loads via CDN (jsDelivr/cdnjs), new **Web Components** wrapper also CDN-loadable | ~615 kB | Mix — can be used imperatively or via the newer declarative Web Components API | The *editor* (cloud IDE, asset pipeline, one-click publish) is a separate, heavier workflow not needed here — we'd use just the engine. ([PlayCanvas web components](https://developer.playcanvas.com/user-manual/web-components/getting-started/), [cdnjs listing](https://cdnjs.com/libraries/playcanvas)) |
| **Spline (exported runtime)** | Depends — Spline is a design tool; it exports either a `<spline-viewer>` web component (CDN, no build) or a React component (needs a bundler) | Viewer-component size not confirmed in research | Declarative via `<spline-viewer>` | Not independently verified in this research pass beyond general awareness — would need a follow-up check before committing to it; flagged here only as a known option, not vetted. |

**Bottom line on build step**: three.js, Babylon.js, A-Frame, `<model-viewer>`,
and PlayCanvas's Web Components variant **all work via a plain `<script>`
tag added to our existing Hono JSX pages**, with zero change to
`docs/adr/0003-tech-stack.md`'s "no build step" decision. React Three Fiber
is the one mainstream option that's off the table outright — it requires
React plus a bundler (Vite/webpack), which would mean introducing a second,
incompatible rendering philosophy (client-side component framework) next to
our existing server-rendered htmx pages — a real architectural fork, not a
script tag.

## Recommendation shape (not a final call — see `ideas.md`)

For "~10 machines in one small room, each independently clickable, each
bound to live server state, no multi-object model-authoring pipeline
desired": **three.js** (full imperative control, smallest footprint, most
tutorials for exactly the raycaster-click-on-object pattern we need) or
**A-Frame** (same engine underneath, but HTML-declarative — arguably a
better fit next to Hono JSX's own HTML-generation style, since a machine's
3D representation could be emitted as `<a-box>`/`<a-entity>` tags directly
from server-rendered JSX, with per-machine `data-status` attributes driven
by the same `board-state.ts` values that already feed the 2D board). Both
avoid a build step; both have well-documented click-to-select patterns.
Babylon.js's extra built-ins (Inspector, GUI, physics) aren't needed for a
static room with clickable machines, so its 10x bundle size isn't clearly
worth it here.

## QR generation (server side)

- **`qrcode`** (npm) is the standard, most-used Node.js package for
  generating QR codes server-side (`QRCode.toDataURL(url)` → base64 PNG)
  or client-side. 6,674+ dependent projects on npm.
  ([npm: qrcode](https://www.npmjs.com/package/qrcode),
  [thecodebarbarian.com walkthrough](https://thecodebarbarian.com/creating-qr-codes-with-node-js.html))
- Fits our stack directly: Hono route renders a machine's QR as a data URL
  or SVG, no new infra, no external service call, works offline/self-hosted
  (important since the whole app already runs in one Fly container with no
  outbound dependencies per ADR 0003's minimalism).

## Camera-based scanning (if the 3D scene itself should "look through the
phone camera" rather than relying on the phone's native camera app)

Covered in depth in `webxr-scanning.md` — summary here: the **native
`BarcodeDetector` API** exists (Chrome/Edge desktop + Android) but is
**unsupported in Firefox and Safari** as of this research
([Scanbot tutorial](https://scanbot.io/techblog/barcode-detection-api-tutorial/)),
which is a real problem on iPhone specifically (Safari is the only engine
allowed on iOS). A JS fallback decoder (**jsQR** or **@zxing/library**) is
needed for cross-browser reliability regardless of which 3D engine is
chosen. ([dev.to QR scanner without BarcodeDetector](https://dev.to/icyzip/a-browser-qr-scanner-without-barcodedetector-or-a-cdn-3joc))
