import assert from "node:assert/strict";
import { test } from "node:test";
import { createHmac } from "node:crypto";
import { decideWork, propertyEventSchema, verifySignature } from "../src/property_events.js";

test("an overdue inspection becomes a priority-one scheduling item", () => {
  const event = propertyEventSchema.parse({
    event_id: "evt_inspection_42",
    type: "inspection.reminder_due",
    property_id: "property_oak_12",
    inspection_id: "inspection_42",
    due_at: "2026-09-26T09:00:00.000Z",
  });

  assert.deepEqual(decideWork(event, new Date("2026-09-27T09:00:00.000Z")), {
    event_id: "evt_inspection_42",
    property_id: "property_oak_12",
    lane: "inspections",
    priority: 1,
    action: "schedule:inspection_42",
  });
});

test("the receiver checks the raw request body signature", () => {
  const body = Buffer.from('{"event_id":"evt_7"}');
  const secret = "local-test-secret-with-at-least-32-characters";
  const signature = createHmac("sha256", secret).update(body).digest("hex");
  assert.equal(verifySignature(body, `sha256=${signature}`, secret), true);
  assert.equal(verifySignature(Buffer.from("changed"), `sha256=${signature}`, secret), false);
});
