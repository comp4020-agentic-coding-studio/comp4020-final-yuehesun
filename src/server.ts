import { serve } from "@hono/node-server";
import { app } from "./app.ts";
import { startRealtimeLoop } from "./realtime.ts";

const port = Number(process.env.PORT ?? 8080);

startRealtimeLoop();

serve({ fetch: app.fetch, port, hostname: "0.0.0.0" }, (info) => {
  console.log(`listening on http://0.0.0.0:${info.port}`);
});
