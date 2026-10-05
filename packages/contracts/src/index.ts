import { z } from "zod";

export const connectionStatuses = [
  "draft",
  "credentials_saved",
  "connected",
  "needs_webhook",
  "observing",
  "active",
  "needs_attention",
  "suspended"
] as const;

export const connectionStatusSchema = z.enum(connectionStatuses);
export type ConnectionStatus = z.infer<typeof connectionStatusSchema>;

export const connectionDiagnosticCategories = [
  "credentials", "permission", "not_found", "timeout", "rate_limit",
  "provider", "redirect", "network", "configuration", "unknown"
] as const;
export const connectionDiagnosticSchema = z.object({
  code: z.string().trim().min(1).max(100),
  category: z.enum(connectionDiagnosticCategories),
  httpStatus: z.number().int().min(100).max(599).nullable(),
  summary: z.string().trim().min(1).max(240)
});
export type ConnectionDiagnostic = z.infer<typeof connectionDiagnosticSchema>;

export const inboundClassifications = [
  "organic",
  "paid_complete",
  "paid_incomplete",
  "ignored_outbound",
  "ignored_group",
  "invalid_payload",
  "duplicate"
] as const;

export const inboundClassificationSchema = z.enum(inboundClassifications);
export type InboundClassification = z.infer<typeof inboundClassificationSchema>;

export const createConnectionSchema = z.object({
  workspaceId: z.string().uuid(),
  label: z.string().trim().min(2).max(80),
  baseUrl: z.string().url(),
  token: z.string().min(8).max(4096),
  instanceId: z.string().trim().min(1).max(160).optional()
});

export const updateConnectionSchema = z.object({
  label: z.string().trim().min(2).max(80),
  baseUrl: z.string().url(),
  token: z.string().min(8).max(4096).optional()
});

export const connectionSuspensionSchema = z.object({ suspended: z.boolean() });

export const createWorkspaceSchema = z.object({
  name: z.string().trim().min(2).max(100),
  slug: z.string().trim().toLowerCase().regex(/^[a-z0-9][a-z0-9-]{1,62}$/)
});

export const metaDestinationSchema = z.object({
  workspaceId: z.string().uuid(),
  datasetId: z.string().trim().min(4).max(128),
  pageId: z.string().trim().min(4).max(128),
  accessToken: z.string().min(16).max(8192),
  testEventCode: z.string().trim().max(128).optional()
});

export const createAgendorIntegrationSchema = z.object({
  workspaceId: z.string().uuid(),
  label: z.string().trim().min(2).max(80),
  baseUrl: z.string().url().optional().default("https://api.agendor.com.br/v3"),
  token: z.string().min(16).max(8192)
});

export const agendorModeSchema = z.object({
  mode: z.enum(["observation", "active"])
});

export const activationSchema = z.object({
  active: z.boolean()
});

export interface NormalizedInbound {
  externalMessageId: string | null;
  occurredAt: string;
  fromMe: boolean;
  isGroup: boolean;
  phone: string | null;
  displayName: string | null;
  ctwaClid: string | null;
  sourceId: string | null;
  sourceUrl: string | null;
  headline: string | null;
  classification: InboundClassification;
}

type JsonRecord = Record<string, unknown>;

function record(value: unknown): JsonRecord {
  return value !== null && typeof value === "object" && !Array.isArray(value)
    ? (value as JsonRecord)
    : {};
}

function firstString(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

function firstBoolean(...values: unknown[]): boolean {
  for (const value of values) {
    if (typeof value === "boolean") return value;
    if (value === "true" || value === 1 || value === "1") return true;
    if (value === "false" || value === 0 || value === "0") return false;
  }
  return false;
}

function normalizePhone(value: string | null): string | null {
  if (!value) return null;
  const local = value.split("@")[0] ?? "";
  const subscriber = local.split(":")[0] ?? "";
  const digits = subscriber.replace(/\D/g, "");
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

export function normalizeUazapiInbound(input: unknown, now = new Date()): NormalizedInbound {
  const root = record(input);
  const payload = record(root.payload);
  const data = record(root.data);
  const message = record(root.message ?? payload.message ?? data.message ?? payload ?? data);
  const key = record(message.key ?? root.key);
  const chat = record(message.chat ?? root.chat ?? data.chat);
  const sender = record(message.sender ?? root.sender ?? data.sender);
  const context = record(message.contextInfo ?? message.context ?? root.context);
  const referral = record(
    message.referral ?? context.referral ?? context.externalAdReply ?? root.referral ?? data.referral
  );

  const externalMessageId = firstString(
    message.id,
    message.messageId,
    key.id,
    root.messageId,
    root.id
  );
  const fromMe = firstBoolean(message.fromMe, key.fromMe, root.fromMe);
  const remoteJid = firstString(key.remoteJid, message.remoteJid, chat.id, root.chatId);
  const isGroup = firstBoolean(message.isGroup, chat.isGroup, root.isGroup) ||
    Boolean(remoteJid?.endsWith("@g.us"));
  const phone = normalizePhone(
    firstString(sender.phone, sender.id, message.phone, root.phone, remoteJid)
  );
  const displayName = firstString(
    sender.pushName,
    sender.name,
    message.pushName,
    root.pushName,
    root.senderName
  );
  const ctwaClid = firstString(
    referral.ctwa_clid,
    referral.ctwaClid,
    context.ctwa_clid,
    root.ctwa_clid
  );
  const sourceId = firstString(
    referral.source_id,
    referral.sourceId,
    referral.ad_id,
    referral.adId,
    root.source_id,
    root.ad_id
  );
  const sourceUrl = firstString(referral.source_url, referral.sourceUrl);
  const headline = firstString(referral.headline, referral.title);
  const timestamp = firstString(message.timestamp, root.timestamp, data.timestamp);
  const numericTimestamp = timestamp && /^\d+$/.test(timestamp) ? Number(timestamp) : null;
  const parsedTime = timestamp
    ? new Date(numericTimestamp === null ? timestamp : numericTimestamp > 1_000_000_000_000 ? numericTimestamp : numericTimestamp * 1000)
    : now;
  const occurredAt = Number.isNaN(parsedTime.getTime()) ? now.toISOString() : parsedTime.toISOString();

  let classification: InboundClassification;
  if (fromMe) classification = "ignored_outbound";
  else if (isGroup) classification = "ignored_group";
  else if (!phone) classification = "invalid_payload";
  else if (ctwaClid && sourceId) classification = "paid_complete";
  else if (ctwaClid || sourceId) classification = "paid_incomplete";
  else classification = "organic";

  return {
    externalMessageId,
    occurredAt,
    fromMe,
    isGroup,
    phone,
    displayName,
    ctwaClid,
    sourceId,
    sourceUrl,
    headline,
    classification
  };
}

export function buildConversionEventId(parts: {
  workspaceId: string;
  connectionId: string;
  externalMessageId: string;
}): string {
  return `${parts.workspaceId}:${parts.connectionId}:${parts.externalMessageId}:LeadSubmitted`;
}
