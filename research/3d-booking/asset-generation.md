# Generating image assets for the 3D scene

Not part of the original research fork's brief — added after an Ed
Discussion post (course staff reminder, week 6 lecture) surfaced a course-
provided image generation API that's relevant if the 3D walkthrough (see
`../../plans/3d-walkthrough.md`) ends up wanting generated textures
(machine fronts, floor/wall materials, a hero image) rather than flat
colours or hand-built geometry alone.

## The course-provided endpoint

```sh
curl -s https://strproxy.comp.anu.edu.au/api/images/generations \
  -H "Authorization: Bearer sk-...(the same virtual key Claude Code sessions use)" \
  -H "content-type: application/json" \
  -d '{"model":"flux-schnell","prompt":"a watercolour quokka"}'
```

- Same `sk-` key already used for Claude Code's own API traffic, routed
  through the course proxy — no separate Replicate (or other) account
  needed.
- Response matches the OpenAI images wire format: `{"data": [{"url": ...}]}`.
- `GET /api/images/models` (same auth) lists the allowed models, sizes,
  per-image price, and remaining image budget.
- One named example model: `flux-schnell`. The full allowlist is a fixed,
  queryable list via the models endpoint above, not enumerated here.

## Budget — read this before generating anything

- **Flat $30 for the entire course, at $0.10/image ≈ 300 images total** —
  not per week, not per project. This is a shared, one-time allowance, not
  something that resets.
- Separate from the weekly Claude Code token budget — exhausting one
  doesn't touch the other.
- A failed or empty generation costs nothing.
- Exceeding the budget returns HTTP 429; an invalid model/size/`n`
  parameter returns 400 naming the valid options.

## Two things that will silently bite if ignored

1. **Generated image URLs expire.** Download and commit (or otherwise
   persist) anything worth keeping immediately after generating it — the
   proxy doesn't store the bytes itself, only brokers the call.
2. **Requires the ANU network or a VPN**, same restriction as the course's
   `/api/me` balance endpoint. A generation call from off that network
   will fail regardless of key validity.

## Where this could apply to the 3D walkthrough

`plans/3d-walkthrough.md`'s "Open design questions" section already
defaults to **simple built three.js geometry first** (boxes, cylinders,
flat materials) for the room and machines — cheap, fully controllable,
and spends no image budget. Generated textures are a candidate only where
flat colour/geometry alone would look obviously cheap, e.g.:

- A machine's front-panel texture (drum/door detail) if box geometry
  alone reads as too plain up close.
- A floor or wall texture for the room shell.
- A static hero/marketing image for `README.md` or a `/laundry` landing
  splash, separate from the live 3D scene itself.

Given the 300-image course-wide budget, the right default is: **generate
one or two candidate textures per surface, by hand, reviewed before
committing** (same "look at it before shipping" discipline as
`research/design-review.md`'s screenshot review process) — not a batch or
programmatic generation loop. Nothing in this stage's plan currently
calls for programmatic/runtime generation (e.g. generating a texture per
request) — every generated asset here is a one-time, offline, committed
file, the same shape as `sim/results.json` or a downloaded reference
image elsewhere in `research/`.

## Third-party alternatives (if the course allowlist doesn't cover a need, or the budget runs out)

Noted for completeness, roughly cheapest first — not currently needed
given the course proxy covers `flux-schnell` and similar models already:

- **Pollinations** — generates directly from a URL, no key required.
- **Hugging Face Inference** — free tier covering several open models
  (SDXL, FLUX-schnell) via one token.
- **fal.ai** / **Replicate** — pay-per-image, trial credits, current
  models (FLUX, Ideogram).
- **Google AI Studio** — free tier including Imagen, if a Google account
  is available.

If ever used, keep any third-party API token out of source (an untracked
environment variable), never a committed file.
