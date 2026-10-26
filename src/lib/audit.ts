// ADEEB ENTERPRISES — Audit log service
// Records all sensitive operations for traceability.

import { prisma } from "./prisma";

export interface AuditParams {
  userId?: string;
  userEmail?: string;
  action: string;
  entity: string;
  entityId?: string;
  before?: object | null;
  after?: object | null;
  note?: string;
  ipAddress?: string;
  userAgent?: string;
}

export async function audit(params: AuditParams): Promise<void> {
  try {
    await prisma.auditLog.create({
      data: {
        userId: params.userId,
        userEmail: params.userEmail,
        action: params.action,
        entity: params.entity,
        entityId: params.entityId,
        before: params.before ? JSON.stringify(params.before) : null,
        after: params.after ? JSON.stringify(params.after) : null,
        note: params.note,
        ipAddress: params.ipAddress,
        userAgent: params.userAgent,
      },
    });
  } catch (err) {
    // Audit failures must never crash the main operation
    console.error("[AUDIT] Failed to write audit log:", err);
  }
}

export const AUDIT_ACTIONS = {
  CREATE: "CREATE",
  UPDATE: "UPDATE",
  DELETE: "DELETE",
  REVERSE: "REVERSE",
  IMPORT_START: "IMPORT_START",
  IMPORT_CONFIRM: "IMPORT_CONFIRM",
  IMPORT_REJECT: "IMPORT_REJECT",
  VC_MAP: "VC_MAP",
  CASHEX_CONFIRM: "CASHEX_CONFIRM",
  CASHEX_OVERRIDE: "CASHEX_OVERRIDE",
  CASHEX_REVERSE: "CASHEX_REVERSE",
  LOGIN: "LOGIN",
  LOGOUT: "LOGOUT",
  SETTINGS_CHANGE: "SETTINGS_CHANGE",
  OPENING_BALANCE_CHANGE: "OPENING_BALANCE_CHANGE",
  PARTY_DEACTIVATE: "PARTY_DEACTIVATE",
} as const;
