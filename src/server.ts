import { serve } from "@hono/node-server";
import { app } from "./app.ts";
import { startPresenceLoop } from "./presence.ts";
import { startRealtimeLoop } from "./realtime.ts";

const port = Number(process.env.PORT ?? 8080);

startRealtimeLoop();
startPresenceLoop();

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`listening on http://0.0.0.0:${info.port}`);
});
