export interface AgendorEnvelope<T> {
  data: T;
  meta?: { totalCount?: number | null };
  links?: { self?: string; next?: string | null };
}

export interface AgendorClientOptions {
  baseUrl: string;
  token: string;
  fetchImpl?: typeof fetch;
  minIntervalMs?: number;
  maxRetries?: number;
  sleep?: (milliseconds: number) => Promise<void>;
}

export interface AgendorCatalog {
  me: unknown;
  funnels: unknown[];
  dealStages: unknown[];
  dealStatuses: unknown[];
  leadOrigins: unknown[];
  dealCustomFields: unknown[];
  requestIds: string[];
}

export interface AgendorPersonInput {
  name: string;
  contact: { whatsapp: string; mobile?: string };
  leadOrigin?: number | string | null;
}

export interface AgendorDealInput {
  title: string;
  funnel: number | string;
  dealStage: number | string;
  dealStatusText: "ongoing" | "won" | "lost";
  customFields: Record<string, string | null>;
}

export interface AgendorTaskInput {
  text: string;
  type: "WHATSAPP";
  finished_date: string;
}

export class AgendorApiError extends Error {
  readonly status: number;
  readonly requestId: string | null;
  readonly responseBody: string;
  readonly retryable: boolean;

  constructor(status: number, requestId: string | null, responseBody: string) {
    super(`agendor_http_${status}`);
    this.name = "AgendorApiError";
    this.status = status;
    this.requestId = requestId;
    this.responseBody = responseBody.slice(0, 500);
    this.retryable = status === 408 || status === 429 || status >= 500;
  }
}

const defaultSleep = (milliseconds: number) => new Promise<void>((resolve) => setTimeout(resolve, milliseconds));

export class AgendorClient {
  private readonly baseUrl: string;
  private readonly token: string;
  private readonly fetchImpl: typeof fetch;
  private readonly minIntervalMs: number;
  private readonly maxRetries: number;
  private readonly sleep: (milliseconds: number) => Promise<void>;
  private nextAllowedAt = 0;

  constructor(options: AgendorClientOptions) {
    this.baseUrl = options.baseUrl.replace(/\/$/, "");
    this.token = options.token;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.minIntervalMs = options.minIntervalMs ?? 500;
    this.maxRetries = options.maxRetries ?? 3;
    this.sleep = options.sleep ?? defaultSleep;
  }

  async get(path: string): Promise<{ data: unknown; requestId: string | null }> {
    let lastError: AgendorApiError | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      await this.waitTurn();
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        headers: { Authorization: `Token ${this.token}`, Accept: "application/json" },
        redirect: "error"
      });
      const requestId = response.headers.get("X-Request-Id");
      const body = await response.text();
      if (response.ok) {
        let data: unknown = null;
        if (body) {
          try { data = JSON.parse(body); }
          catch { throw new AgendorApiError(502, requestId, "invalid_json_response"); }
        }
        return { data, requestId };
      }
      lastError = new AgendorApiError(response.status, requestId, body);
      if (!lastError.retryable || attempt === this.maxRetries) throw lastError;
      await this.sleep((2 ** attempt) * 500 + Math.floor(Math.random() * 250));
    }
    throw lastError ?? new Error("agendor_request_failed");
  }

  async post(path: string, body: unknown): Promise<{ data: unknown; requestId: string | null }> {
    return this.mutate("POST", path, body);
  }

  async put(path: string, body: unknown): Promise<{ data: unknown; requestId: string | null }> {
    return this.mutate("PUT", path, body);
  }

  async createPerson(input: AgendorPersonInput): Promise<{ data: unknown; requestId: string | null }> {
    return this.post("/people", input);
  }

  async createDeal(personId: number | string, input: AgendorDealInput): Promise<{ data: unknown; requestId: string | null }> {
    return this.post(`/people/${encodeURIComponent(String(personId))}/deals`, input);
  }

  async createTask(dealId: number | string, input: AgendorTaskInput): Promise<{ data: unknown; requestId: string | null }> {
    return this.post(`/deals/${encodeURIComponent(String(dealId))}/tasks`, input);
  }

  async deal(dealId: number | string): Promise<{ data: unknown; requestId: string | null }> {
    return this.get(`/deals/${encodeURIComponent(String(dealId))}`);
  }

  private async mutate(method: "POST" | "PUT", path: string, body: unknown): Promise<{ data: unknown; requestId: string | null }> {
    let lastError: AgendorApiError | null = null;
    for (let attempt = 0; attempt <= this.maxRetries; attempt += 1) {
      await this.waitTurn();
      const response = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        headers: { Authorization: `Token ${this.token}`, Accept: "application/json", "Content-Type": "application/json" },
        body: JSON.stringify(body),
        redirect: "error"
      });
      const requestId = response.headers.get("X-Request-Id");
      const responseBody = await response.text();
      if (response.ok) {
        let data: unknown = null;
        if (responseBody) {
          try { data = JSON.parse(responseBody); }
          catch { throw new AgendorApiError(502, requestId, "invalid_json_response"); }
        }
        return { data, requestId };
      }
      lastError = new AgendorApiError(response.status, requestId, responseBody);
      if (!lastError.retryable || attempt === this.maxRetries) throw lastError;
      await this.sleep((2 ** attempt) * 500 + Math.floor(Math.random() * 250));
    }
    throw lastError ?? new Error("agendor_request_failed");
  }

  async catalog(): Promise<AgendorCatalog> {
    const requestIds: string[] = [];
    const read = async (path: string): Promise<unknown> => {
      const result = await this.get(path);
      if (result.requestId) requestIds.push(result.requestId);
      return result.data;
    };
    const me = await read("/users/me");
    const funnels = await read("/funnels");
    const dealStages = await read("/deal_stages");
    const dealStatuses = await read("/deal_statuses");
    const leadOrigins = await read("/lead_origins");
    const dealCustomFields = await read("/custom_fields/deals");
    return {
      me,
      funnels: envelopeData(funnels),
      dealStages: envelopeData(dealStages),
      dealStatuses: envelopeData(dealStatuses),
      leadOrigins: envelopeData(leadOrigins),
      dealCustomFields: envelopeData(dealCustomFields),
      requestIds
    };
  }

  private async waitTurn(): Promise<void> {
    const now = Date.now();
    const delay = Math.max(0, this.nextAllowedAt - now);
    this.nextAllowedAt = Math.max(now, this.nextAllowedAt) + this.minIntervalMs;
    if (delay > 0) await this.sleep(delay);
  }
}

function envelopeData(value: unknown): unknown[] {
  if (Array.isArray(value)) return value;
  if (value && typeof value === "object" && Array.isArray((value as AgendorEnvelope<unknown[]>).data)) {
    return (value as AgendorEnvelope<unknown[]>).data;
  }
  return [];
}

export function createAgendorBaseUrl(value: string): string {
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error("agendor_https_required");
  if (url.pathname.replace(/\/$/, "") !== "/v3") throw new Error("agendor_api_v3_required");
  return url.toString().replace(/\/$/, "");
}
