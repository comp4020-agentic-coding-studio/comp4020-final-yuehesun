# Camera-based QR scanning: in-scene vs. the phone's own camera app

Two fundamentally different ideas get conflated under "scan the machine,"
and they have very different technical shapes.

## Option A — rely on the phone's native camera app (OS-level scanning)

The resident points their **actual phone camera app** (not our web page) at
a QR code — either a code physically printed and taped to a real machine,
or a code rendered on a screen/monitor mounted near the machines. The OS
decodes it and opens the encoded URL in the browser, landing on our existing
server-rendered claim page.

- Zero new client-side code for "scanning" itself — this is just a normal
  link, decoded by hardware/OS the resident already has.
- Works identically for a code taped to a literal washing machine (today, if
  we had real machines) or a code shown on a lobby display next to a 3D
  visualization.
- **This is almost certainly the right choice for us**, because our actual
  deployed context (no real washing machines available for marking — the
  entire reason this stage exists per Bill's feedback) means the "scan
  target" has to be something reproducible for a marker without physical
  access to a laundry room: a QR **rendered inside the 3D scene itself**,
  which the marker scans with their own real phone, exactly reproducing what
  a resident would do standing in a real laundry room looking at a real
  machine's code. The 3D scene supplies the "being physically present in
  the room" experience; the resident's own phone supplies the "scanning"
  experience — no camera code needs to run inside our web app at all.

## Option B — the 3D scene does the scanning itself (in-browser camera access)

The web page itself requests camera access (`getUserMedia`) and decodes
QR codes found in the video feed, inside the running web app — e.g. a
"scan mode" button that opens the device camera and recognizes a QR code
pointed at by the user, without leaving the page or using the OS camera.

- **Native `BarcodeDetector` API**: supported in Chrome/Edge (desktop +
  Android), but **not implemented in Firefox or Safari** as of this
  research — a real gap since Safari is the only rendering engine permitted
  on iOS, meaning a meaningful fraction of residents' phones would silently
  fail without a fallback.
  ([Scanbot SDK tutorial](https://scanbot.io/techblog/barcode-detection-api-tutorial/))
- **Fallback libraries** exist specifically because of this gap: **jsQR**
  (pure-JS decoder, works everywhere, no native camera hookup of its own —
  you still wire up `getUserMedia` yourself and feed it canvas frames) or
  wrapper libraries like **`qr-detector.js`** (uses native `BarcodeDetector`
  when available, falls back to jsQR otherwise) or **`@zxing/library`** /
  **`@mebjas/html5-qrcode`** (full scan-UI wrappers).
  ([dev.to QR scanner without BarcodeDetector](https://dev.to/icyzip/a-browser-qr-scanner-without-barcodedetector-or-a-cdn-3joc),
  [qr-detector.js on npm](https://npmjs.com/package/qr-detector))
- **WebXR doesn't help here directly.** WebXR's `immersive-ar` mode
  deliberately does **not** expose raw camera pixels to the page — the
  passthrough video is composited by the browser itself, and the page only
  gets to render 3D content *on top of* it, with no access to the pixels
  underneath for something like QR decoding. The official spec explainer
  confirms this is a deliberate privacy boundary, and a proposal to expose
  "camera-access" as a feature flag for pose-synchronized camera images is
  still just a proposal, not shipped.
  ([immersive-web raw-camera-access explainer](https://github.com/immersive-web/raw-camera-access/blob/main/explainer.md))
  So any in-browser scanning has to go through plain `getUserMedia` (a 2D
  camera feed, independent of any WebXR/AR session), with the "3D-ness" of
  our room limited to what's rendered, not available as camera input for
  recognition.
- **DOM Overlay API** exists for showing 2D UI (like a scan-target
  rectangle) on top of a WebXR immersive session, if we ever wanted a true
  AR mode later — not needed for QR decoding itself, just relevant if a
  future iteration wants an "AR view of the real laundry room" rather than
  a fully virtual 3D room.
  ([dom-overlays explainer](https://github.com/immersive-web/dom-overlays/blob/master/explainer.md))

## What this means for which option to build

**Option A (rely on the resident's/marker's real phone camera app,
scanning a code rendered inside our 3D scene) is simpler, more reliable
across devices, and more honest about what we're actually demonstrating** —
a resident in a real dorm would use their phone's normal camera, not a
special in-page scanner; our demo should show exactly that interaction, not
invent a different one just because we're missing physical machines. It
also sidesteps the Safari/`BarcodeDetector` gap entirely, since we're never
running scan logic inside our own page.

**Option B (in-page scanning) only becomes worth the added complexity and
cross-browser fallback code if the goal shifts to "a free-standing kiosk/AR
app that scans the *real world*"** — which is a different, bigger product
than a laundry-queue demo, and isn't what Bill's feedback asked for (he
asked to "pull out my phone IRL, point it at the washing machine" — i.e.
his own phone's own camera, Option A exactly).
