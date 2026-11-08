// Pure URL assembly for a machine's QR code payload, split out of
// src/app.ts's GET /machines/:id/qrcode.png route so it's directly
// testable without decoding a rendered PNG image (this project has no QR
// decode dependency, and adding one just to test a URL string would be
// disproportionate — see docs/adr/0012's addendum for the product
// decision this implements).
export function scanUrlFor(origin: string, machineId: number, identity: string | undefined): URL {
  const url = new URL(`/laundry/scan/${machineId}`, origin);
  if (identity) url.searchParams.set("room", identity);
  return url;
}

// The deployed app sits behind Fly's proxy, which terminates TLS, so the
// Node server only ever sees plain http and `new URL(c.req.url).origin`
// comes out as http://… even though every real visit is https
// (fly.toml: force_https = true). A QR code must encode the https origin
// the phone should actually open. Local hosts have no TLS in front of
// them, so they keep the origin as computed.
export function publicOrigin(requestUrl: string): string {
  const url = new URL(requestUrl);
  const isLocal = url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "[::1]";
  if (!isLocal) url.protocol = "https:";
  return url.origin;
}
