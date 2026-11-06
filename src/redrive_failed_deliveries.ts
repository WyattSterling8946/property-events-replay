import { randomUUID } from "node:crypto";
import { z } from "zod";
import { infrai } from "./infrai_client.js";

const argumentsSchema = z.object({
  webhookId: z.string().min(1),
  queue: z.string().min(1),
  redrive: z.boolean(),
});

const values = process.argv.slice(2);
const args = argumentsSchema.parse({
  webhookId: values[0],
  queue: values[1] ?? "property-events",
  redrive: values.includes("--redrive"),
});

const history = await infrai.account.webhooks.deliveries(args.webhookId);
const failed = history.deliveries.filter((delivery) => delivery.status === "failed");
console.log(JSON.stringify({ webhook_id: args.webhookId, failed_deliveries: failed }, null, 2));

if (args.redrive) {
  const result = await infrai.queue.dlq.redrive(args.queue, randomUUID());
  console.log(JSON.stringify({ queue: args.queue, redriven: result.redriven }, null, 2));
}
