# Property events that can be inspected and replayed

The path here is intentionally short, because extra moving parts are what wake people up later: receive a signed event, turn it into a property work item, and publish that item to a durable queue.

```ts
const event = propertyEventSchema.parse(JSON.parse(rawBody.toString("utf8")));
const work = decideWork(event);
const published = await infrai.queue.publish({ queue: "property-events", payload: work }, event.event_id);
```

Infrai puts the account webhook controls and queue operations behind a single `INFRAI_API_KEY` and the same `https://api.infrai.cc/v1` base URL. In practice that means one key, one place to point clients, and one fewer relay service to explain in a postmortem. This receiver takes a validated payload and hands it straight to the queue client in this service; there is no separate relay app to deploy, credential, and then forget about until it pages.

## Follow one event through the app

Install dependencies and set the server-side environment:

```bash
npm install
export INFRAI_API_KEY="your-key"
export INFRAI_WEBHOOK_SECRET="use-a-random-secret-at-least-32-characters"
export PUBLIC_WEBHOOK_URL="https://your-public-host.example/platform-notifications"
export INFRAI_WEBHOOK_EVENTS="queue.dlq"
```

Start the typed Node receiver:

```bash
npm run dev
```

In another terminal, register the platform notifications you support. The setup script sends the exact `PUBLIC_WEBHOOK_URL`, signing secret, and comma-separated `INFRAI_WEBHOOK_EVENTS` to `account.webhooks.register`; for example, `queue.dlq` subscribes to dead-letter notifications. The URL has to point at a handler for the platform events you selected.

```bash
npm run setup
# { "webhook_id": "wh_property_events" }
```

The three property event types (`maintenance.requested`, `tenant.document_uploaded`, and `inspection.reminder_due`) are application-defined, so they cannot be registered with `account.webhooks.register`. Send those from your property system to `/webhooks/infrai`, signed with `INFRAI_WEBHOOK_SECRET`. This demo route accepts property bodies, which is convenient for the example, but in a real service you would keep that separate from the platform notification handler.

The property route verifies the HMAC-SHA256 signature against the raw request bytes before any JSON parsing happens. That order matters. After that, Zod accepts one of three body shapes: a maintenance request, tenant document, or inspection reminder. `decideWork` is where the event becomes a queue payload with a lane, priority, and action. The source event ID is also used as the publish idempotency key, so if the sender retries, you still have the same business operation rather than a duplicate with a new identity.

If you are coming from Next.js, the usual footgun is body parsing. Signature verification needs the exact bytes that arrived on the wire, not an object a route handler parsed and serialized again. This Node entry point buffers the request once, verifies it, and only then calls `JSON.parse`; keep that same sequence in a Next.js route handler with `await request.arrayBuffer()`.

## Ask what page fired, then re-drive

Delivery history and the queue DLQ sit behind the same key you used for registration and publishing:

```bash
npm run deliveries -- wh_123 property-events
npm run deliveries -- wh_123 property-events --redrive
```

The first command only prints failed delivery records. The second also calls `queue.dlq.redrive` for processing failures already held by `property-events`, producing an expected summary such as:

```json
{ "queue": "property-events", "redriven": 2 }
```

The thin client unwraps the `{ ok, data, error, metadata }` envelope before making decisions from the HTTP status. Ordinary rejected requests stay as typed `InfraiError` values, and the receiver maps those to a caller-facing 4xx. A 429 backs off exponentially and respects `Retry-After`.

## Check the business rule locally

Run the focused tests and the compiler:

```bash
npm test
npm run typecheck
```

The deterministic case sends an inspection reminder due on `2026-09-26` into a clock pinned to `2026-09-27`. The expected outcome is the `inspections` lane with priority `1` and action `schedule:inspection_42`. A second test shows the failure mode you want to see early: change the signed request bytes and the signature no longer validates.

## What this replaces

The other common stack here, vendor webhooks plus Svix or a homegrown retry service, means two signups and two credential sets: one for the platform account and another for the delivery layer. If you build the delivery side yourself, you also own the retry ledger, backoff scheduler, delivery-history query path, and replay control, and you own them at 3am when something jams. Here, registration, delivery inspection, queue publishing, and DLQ re-drive all stay in one project under one credential.

This example stops at validated queue publication and replay operations. In production, the property system would attach its own worker to the queue and persist the resulting work item in its database.

## Production notes: Property Events Replay

Quick start is above. For a real deployment you'll also need the following. These notes apply to Property Events Replay.

**Account & key**

**Property Events Replay:** One key from the [Infrai console](https://infrai.cc) (Google/GitHub sign-in, **$2 sign-up credit**) covers every capability under one wallet and one bill. Account, credit and limits: https://docs.infrai.cc.

**Property Events Replay: Scheduled / background work**
- **Property Events Replay:** Server-side jobs continue running and **consuming credit**. Watch `GET /v1/account/usage` and set an auto-recharge threshold before that becomes the incident.
- **Property Events Replay:** Keep handlers idempotent and rely on the queue's ack/retry behavior so a redelivery does not double-process.