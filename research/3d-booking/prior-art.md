# Prior art — spatial/3D visualizations of real-time queues and bookings

Researched for the 3D laundry-room demo direction (agreed after Bill
McAlister's crit feedback — see `process-notes.md`). Covers what's actually
shipped and working, vs. concept-only.

## Laundry-specific: LaundryView

The closest existing product to what we're building. Used at many US
university residences (Hamline, WKU, Texas Wesleyan, St. Thomas, Colorado
State, and even Disney hotels).

- After picking a building/room, LaundryView shows an **isometric
  room-layout view** of the actual laundry room — not just a list — letting
  residents see which physical machine (by its real position) is free before
  walking down. One source describes a "3-D View" accessible from
  `www.laundryview.com` on desktop.
  ([Hamline mobile access guide](https://www.hamline.edu/sites/default/files/2025-02/LaundryView-Mobile_access.pdf),
  [St. Thomas how-to](https://www.stthomas.edu/_media-library/_documents/residence-life/laundryview.pdf),
  [CSC ServiceWorks monitoring sheet](https://www.cscswacademic.com/wp-content/uploads/2019/01/LaundryView-Monitoring.pdf))
- Underlying data: each machine has hardware that reports machine number,
  status (running/empty/disabled), and time remaining — the same shape of
  data our `queue.ts`/`board-state.ts` already produces, just sourced from
  real sensors instead of app-driven state.
  ([open-source iOS client README](https://github.com/laddng/LaundryView))
- LaundryView also does **usage reports** (busiest times) and **text
  alerts** when a cycle finishes — both already on our gap list (`plan.md`
  #2 push notifications, and the already-built `/simulation` peak-times
  idea from crit 10's plan #7).
- **What LaundryView does NOT do**: no scan-to-claim, no live walkthrough,
  no clickable 3D interaction — the "3-D view" is a static isometric
  illustration for wayfinding, not an operable scene. This is exactly the
  gap Bill is pointing at: a spatial *view* of status already exists in the
  market, but nobody's shown it as something you *act through*.

## Digital twin dashboards (buildings/facilities)

The broader category our idea belongs to: a real-time 3D representation of
a physical space, driven by live backend data.

- **RPI CASE digital-twin dashboard** — a real deployed prototype (university
  lab, 50+ sensors for temperature/humidity/occupancy), rendered with
  **Three.js** in the browser, backed by Node-RED + a NoSQL database. Closest
  in scale and tech stack to what we could build: one room, one small
  dataset, server-rendered real-time values piped into a Three.js scene.
  ([case.rpi.edu](https://www.case.rpi.edu/researchprojects/digital-twin-dashboard))
- **DTB-BMS (open source, GitHub)** — connects BIM + IoT data; uses
  **CesiumJS**/Mapbox for 3D, Node-RED/MongoDB for the data pipeline. Bigger
  scope (whole-building geospatial) than we need.
  ([github.com/mac999/digital_twin](https://github.com/mac999/digital_twin))
- **Commercial platforms** (Altotech/Alto Vision, Contexus, KiloIoT, AWS IoT
  TwinMaker via Grafana) all converge on the same shape: a 3D model of the
  space + IoT sensor overlays + click-to-inspect equipment. All are
  B2B/enterprise products, not demos; none expose source, but they confirm
  the pattern ("spatial view + live data overlay + click an object to see
  its state/history") is an established, not speculative, category.
  ([Altotech](https://altotech.ai/solutions/building-digital-twin),
  [Contexus](https://contexus.io/),
  [KiloIoT](https://kiloiot.io/product/digital-building-twin/),
  [AWS IoT TwinMaker Grafana plugin](https://grafana.com/docs/plugins/grafana-iot-twinmaker-app/latest.md))

## Meeting-room booking in 3D

Closer to our exact shape (book one of N resources, each with live status).

- **Caucus** (student/internship project, open source on GitHub) — full-stack
  meeting-room booking with an **interactive 3D floor plan**: rotate/zoom/pan,
  select a room, switch floors, a room-details panel with a 3D preview.
  Colour-coded live status: green occupants + highlight = in progress, grey +
  traffic cones = inactive/unbookable. This is the single closest prior-art
  match to "clickable 3D room with live per-object state" that is openly
  documented, even though it's a student project, not a polished commercial
  product.
  ([GitHub — stewartdaniel291004-dot/meeting-room-booking](https://github.com/stewartdaniel291004-dot/meeting-room-booking))
- **anny** and **YAROOMS** — commercial room-booking tools with interactive
  3D/2D office maps and live occupancy; YAROOMS additionally runs a
  "room panel" app on a tablet mounted outside each room, syncing live with
  the booking backend — a physical/digital pairing somewhat analogous to a
  QR code taped to a washing machine.
  ([YAROOMS room panel](https://www.yarooms.com/product/room-panel),
  [best-of list mentioning anny's 3D floor plan](https://peoplemanagingpeople.com/tools/meeting-room-book-software/))
- **Skedda** — simpler "live floor plan" (not full 3D) showing every space's
  real-time status on phone or desktop.
  ([Skedda](https://www.skedda.com/platform/meeting-room-booking-system))

**Takeaway for our project:** every real example that got traction kept the
3D rendering itself fairly simple (isometric or a static-camera 3D model you
orbit/pan, not a full first-person game world) and spent the actual design
effort on tying live backend state to per-object colour/label. None of the
researched examples do camera-based QR scanning *into* the 3D view itself —
the physical-to-digital bridge (where one exists, as in YAROOMS's room panel)
is a separate physical device/screen, not part of the 3D scene's own
rendering. This is a genuine gap our idea could fill, not something we're
replicating — see `ideas.md` for how that shapes the recommended direction.

## Spatial presence (Gather.town-style)

Relevant only if we want to show "who else is in the room right now," not
just machine state (CLAUDE.md's #6 research question).

- Gather.town: pixel-art 2D (deliberately not 3D/VR, for accessibility and
  lower barrier to entry), avatar-based, proximity triggers video/audio.
  No official engineering write-up of the networking layer was found.
  ([MakeUseOf overview](https://www.makeuseof.com/use-gather-town-bring-remote-teams-together/))
- A third-party open-source Gather-inspired clone uses React + Node/Express +
  WebSockets (real-time avatar positions) + WebRTC (peer video), a
  conventional real-time-multiplayer stack.
  ([github.com/Anujgosavi/GatherTown](https://github.com/Anujgosavi/GatherTown))
- **Relevance to us:** full avatar presence is a materially different (and
  much bigger) feature than what the brief needs — it requires a persistent
  websocket connection per client and a position broadcast loop, which is a
  new real-time transport alongside the SSE one `realtime.ts` already runs.
  Treated as a stretch/non-core idea in `ideas.md`, not a baseline
  requirement.
