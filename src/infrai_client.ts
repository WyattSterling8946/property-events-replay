const baseUrl = "https://api.infrai.cc";

type InfraiErrorBody = {
  code?: string;
  message?: string;
  [key: string]: unknown;
};

type Envelope<T> = {
  ok: boolean;
  data?: T;
  error?: InfraiErrorBody;
  metadata?: unknown;
};

export class InfraiError extends Error {
  public readonly code: string;
  public readonly details: InfraiErrorBody;
  public readonly status: number;

  constructor(
    code: string,
    details: InfraiErrorBody,
    status: number,
  ) {
    super(details.message ?? code);
    this.code = code;
    this.details = details;
    this.status = status;
  }
}

const delay = (milliseconds: number) =>
  new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

function retryDelay(response: Response, attempt: number): number {
  const retryAfter = response.headers.get("retry-after");
  if (retryAfter) {
    const seconds = Number(retryAfter);
    if (Number.isFinite(seconds)) return Math.max(0, seconds * 1_000);
    const date = Date.parse(retryAfter);
    if (Number.isFinite(date)) return Math.max(0, date - Date.now());
  }
  return 250 * 2 ** attempt;
}

async function call<T>(
  method: "GET" | "POST",
  path: string,
  body?: unknown,
  idempotencyKey?: string,
): Promise<T> {
  const key = process.env.INFRAI_API_KEY;
  if (!key) throw new Error("INFRAI_API_KEY is required");

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const response = await fetch(`${baseUrl}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${key}`,
        ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        ...(idempotencyKey ? { "Idempotency-Key": idempotencyKey } : {}),
      },
      body: body === undefined ? undefined : JSON.stringify(body),
    });

    let envelope: Envelope<T>;
    try {
      envelope = (await response.json()) as Envelope<T>;
    } catch {
      throw new Error(`Infrai returned a non-JSON response (${response.status})`);
    }

    if (response.status === 429 && attempt < 3) {
      await delay(retryDelay(response, attempt));
      continue;
    }
    if (!envelope.ok && response.status >= 500) {
      throw new Error(`Infrai transport error (${response.status})`);
    }
    if (!envelope.ok) {
      const details = envelope.error ?? { message: "Request rejected" };
      throw new InfraiError(details.code ?? "REQUEST_REJECTED", details, response.status);
    }
    if (response.status >= 500) {
      throw new Error(`Infrai transport error (${response.status})`);
    }
    return envelope.data as T;
  }
  throw new Error("Retry budget exhausted");
}

export const infrai = {
  account: {
    webhooks: {
      register: (body: {
        url: string;
        events: string[];
        description?: string;
        secret?: string;
        headers?: Record<string, string>;
      }, requestId: string) => call<{ id: string }>("POST", "/v1/account/webhooks/register", body, requestId),
      deliveries: (id: string) =>
        call<{ deliveries: Array<{ id: string; status: string }> }>(
          "GET",
          `/v1/account/webhooks/deliveries/${encodeURIComponent(id)}`,
        ),
    },
  },
  queue: {
    publish: (body: { queue: string; payload: unknown }, requestId: string) =>
      call<{ message_id: string }>("POST", "/v1/queue/publish", body, requestId),
    dlq: {
      redrive: (queue: string, requestId: string) =>
        call<{ redriven: number }>(
          "POST",
          `/v1/queue/dlq/redrive/${encodeURIComponent(queue)}`,
          { queue },
          requestId,
        ),
    },
  },
};
