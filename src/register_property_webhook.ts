import { randomUUID } from "node:crypto";
import { z } from "zod";
import { infrai } from "./infrai_client.js";

const environmentSchema = z.object({
  PUBLIC_WEBHOOK_URL: z.string().url(),
  INFRAI_WEBHOOK_SECRET: z.string().min(32),
  INFRAI_WEBHOOK_EVENTS: z.string().min(1).transform((value) => value.split(",").map((event) => event.trim())).pipe(
    z.array(z.enum([
      "account.created", "account.updated", "account.absorbed", "account.device_linked", "account.deleted",
      "topup.succeeded", "topup.failed", "topup.review_started", "autorecharge.charged", "autorecharge.failed",
      "subscription.activated", "subscription.renewed", "subscription.cancelled", "kyc.status_changed",
      "tier.upgraded", "tier.downgraded", "wallet.low_balance", "wallet.expiring_soon", "wallet.expired",
      "email.queued", "email.sent", "email.delivered", "email.opened", "email.clicked", "email.bounced",
      "email.complained", "email.deferred", "email.cancelled", "email.unsubscribed", "email.auto_suppressed",
      "sms.queued", "sms.sent", "sms.delivered", "sms.failed", "sms.inbound",
      "image.job.completed", "image.job.failed", "video.job.completed", "video.job.failed",
      "ai.batch.completed", "ai.batch.failed", "captcha.verified", "captcha.failed",
      "realtime.channel.occupied", "realtime.channel.vacated", "realtime.member.added", "realtime.member.removed",
      "cron.executed", "cron.failed", "cron.missed", "queue.dlq", "observability.alert.fired",
      "error.captured", "error.rate_anomaly", "system.vendor.down", "system.maintenance.scheduled",
    ])).min(1),
  ),
});

const environment = environmentSchema.parse(process.env);
const webhook = await infrai.account.webhooks.register(
  {
    url: environment.PUBLIC_WEBHOOK_URL,
    events: environment.INFRAI_WEBHOOK_EVENTS,
    description: "Property operations platform notifications",
    secret: environment.INFRAI_WEBHOOK_SECRET,
  },
  randomUUID(),
);

console.log(JSON.stringify({ webhook_id: webhook.id }, null, 2));
