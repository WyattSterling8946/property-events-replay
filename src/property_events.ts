import { createHmac, timingSafeEqual } from "node:crypto";
import { z } from "zod";

export function verifySignature(rawBody: Buffer, signature: string, secret: string): boolean {
  const expected = createHmac("sha256", secret).update(rawBody).digest("hex");
  const supplied = signature.startsWith("sha256=") ? signature.slice(7) : signature;
  if (!/^[a-f0-9]{64}$/i.test(supplied)) return false;
  return timingSafeEqual(Buffer.from(expected, "hex"), Buffer.from(supplied, "hex"));
}

const maintenanceRequest = z.object({
  event_id: z.string().min(1),
  type: z.literal("maintenance.requested"),
  property_id: z.string().min(1),
  tenant_id: z.string().min(1),
  urgency: z.enum(["routine", "urgent", "emergency"]),
  summary: z.string().min(1),
});

const tenantDocument = z.object({
  event_id: z.string().min(1),
  type: z.literal("tenant.document_uploaded"),
  property_id: z.string().min(1),
  tenant_id: z.string().min(1),
  document_id: z.string().min(1),
  document_kind: z.enum(["lease", "insurance", "identity"]),
});

const inspectionReminder = z.object({
  event_id: z.string().min(1),
  type: z.literal("inspection.reminder_due"),
  property_id: z.string().min(1),
  inspection_id: z.string().min(1),
  due_at: z.string().datetime(),
});

export const propertyEventSchema = z.discriminatedUnion("type", [
  maintenanceRequest,
  tenantDocument,
  inspectionReminder,
]);

export type PropertyEvent = z.infer<typeof propertyEventSchema>;

export type WorkItem = {
  event_id: string;
  property_id: string;
  lane: "maintenance" | "documents" | "inspections";
  priority: 1 | 2 | 3;
  action: string;
};

export function decideWork(event: PropertyEvent, now = new Date()): WorkItem {
  if (event.type === "maintenance.requested") {
    const priority = event.urgency === "emergency" ? 1 : event.urgency === "urgent" ? 2 : 3;
    return {
      event_id: event.event_id,
      property_id: event.property_id,
      lane: "maintenance",
      priority,
      action: `dispatch:${event.tenant_id}`,
    };
  }
  if (event.type === "tenant.document_uploaded") {
    return {
      event_id: event.event_id,
      property_id: event.property_id,
      lane: "documents",
      priority: event.document_kind === "lease" ? 1 : 2,
      action: `review:${event.document_id}`,
    };
  }
  const overdue = Date.parse(event.due_at) <= now.getTime();
  return {
    event_id: event.event_id,
    property_id: event.property_id,
    lane: "inspections",
    priority: overdue ? 1 : 3,
    action: `schedule:${event.inspection_id}`,
  };
}
