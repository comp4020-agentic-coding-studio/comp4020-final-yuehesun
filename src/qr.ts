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
