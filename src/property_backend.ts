import { createServer } from "node:http";
import { ZodError } from "zod";
import { infrai, InfraiError } from "./infrai_client.js";
import { decideWork, propertyEventSchema, verifySignature } from "./property_events.js";

const server = createServer(async (request, response) => {
  if (request.method !== "POST" || request.url !== "/webhooks/infrai") {
    response.writeHead(404).end();
    return;
  }

  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  const rawBody = Buffer.concat(chunks);
  const secret = process.env.INFRAI_WEBHOOK_SECRET;
  const signature = request.headers["x-infrai-signature"];

  if (!secret || typeof signature !== "string" || !verifySignature(rawBody, signature, secret)) {
    response.writeHead(401, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "invalid signature" }));
    return;
  }

  try {
    const event = propertyEventSchema.parse(JSON.parse(rawBody.toString("utf8")));
    const work = decideWork(event);
    const published = await infrai.queue.publish({ queue: "property-events", payload: work }, event.event_id);
    response.writeHead(202, { "Content-Type": "application/json" }).end(
      JSON.stringify({ accepted: true, event_id: event.event_id, message_id: published.message_id, decision: work }),
    );
  } catch (error) {
    if (error instanceof ZodError || error instanceof SyntaxError) {
      response.writeHead(400, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "invalid event" }));
      return;
    }
    if (error instanceof InfraiError && error.status < 500) {
      response.writeHead(error.status, { "Content-Type": "application/json" }).end(
        JSON.stringify({ error: error.code, details: error.details }),
      );
      return;
    }
    response.writeHead(502, { "Content-Type": "application/json" }).end(JSON.stringify({ error: "queue publish failed" }));
  }
});

const port = Number(process.env.PORT ?? "3000");
server.listen(port, () => console.log(`Property event receiver listening on http://localhost:${port}`));
