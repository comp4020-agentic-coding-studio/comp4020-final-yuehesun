// plans/laundry-presence.md Stage 1: a minimal SSE frame reader. No
// existing spec file reads an SSE stream's body at all (checked before
// writing this — every realtime check elsewhere in this codebase polls
// ordinary non-streaming endpoints, or uses Playwright screenshots
// against a real browser's own EventSource) — this is new ground, a
// plain reader against the web-standard ReadableStream Node's own fetch
// already returns, not a shortcut past an existing pattern.

export interface SSEFrame {
  event: string;
  data: string;
}

// Reads frames off an SSE response body until `until` returns true for
// one of them, or `timeoutMs` elapses. Returns every frame seen, in
// order. The wire format is SSE's own plain "event: name\ndata:
// payload\n\n" shape — parsed directly, no library, matching this
// project's own established "no new dependency for a handful of lines"
// preference.
export async function readFramesUntil(response: Response, until: (frame: SSEFrame) => boolean, timeoutMs = 3000): Promise<SSEFrame[]> {
  if (!response.body) throw new Error("response has no readable body");
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  const frames: SSEFrame[] = [];
  let buffer = "";
  const deadline = Date.now() + timeoutMs;

  try {
    while (Date.now() < deadline) {
      const remaining = deadline - Date.now();
      const { value, done } = await Promise.race([
        reader.read(),
        new Promise<{ value: undefined; done: true }>((resolve) => setTimeout(() => resolve({ value: undefined, done: true }), remaining)),
      ]);
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let sepIndex: number;
      while ((sepIndex = buffer.indexOf("\n\n")) !== -1) {
        const rawFrame = buffer.slice(0, sepIndex);
        buffer = buffer.slice(sepIndex + 2);
        const frame = parseFrame(rawFrame);
        if (frame) {
          frames.push(frame);
          if (until(frame)) return frames;
        }
      }
    }
    return frames;
  } finally {
    await reader.cancel().catch(() => undefined);
  }
}

function parseFrame(raw: string): SSEFrame | undefined {
  let event = "message";
  const dataLines: string[] = [];
  for (const line of raw.split("\n")) {
    if (line.startsWith("event:")) event = line.slice(6).trim();
    else if (line.startsWith("data:")) dataLines.push(line.slice(5).trim());
  }
  if (dataLines.length === 0 && event === "message") return undefined;
  return { event, data: dataLines.join("\n") };
}
