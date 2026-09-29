import { sha256Hex } from "./crypto";

export interface MetaEventInput {
  eventId: string;
  occurredAt: string;
  phone: string;
  ctwaClid: string;
  pageId: string;
  sourceId: string;
  testEventCode?: string | null;
}

export async function buildMetaPayload(input: MetaEventInput): Promise<Record<string, unknown>> {
  const payload: Record<string, unknown> = {
    data: [{
      event_name: "LeadSubmitted",
      event_time: Math.floor(new Date(input.occurredAt).getTime() / 1000),
      event_id: input.eventId,
      action_source: "business_messaging",
      messaging_channel: "whatsapp",
      user_data: {
        ph: [await sha256Hex(input.phone)],
        ctwa_clid: input.ctwaClid
      },
      custom_data: {
        page_id: input.pageId,
        ad_id: input.sourceId
      }
    }]
  };
  if (input.testEventCode) payload.test_event_code = input.testEventCode;
  return payload;
}

export function isRetryableMetaStatus(status: number): boolean {
  return status === 408 || status === 429 || status >= 500;
}

