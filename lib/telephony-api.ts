"use client"

import { api } from "@/lib/api"

export type TelephonyLine = "reservations" | "sales"
export type TelephonyMode = "ai" | "backup"
export type TelephonyConfig = {
  id: string; hotel_id: string; line: TelephonyLine; number: string; number_sid: string
  backup_number: string; backup_label: string; mode: TelephonyMode; version: number
  checked_at: string | null; ai_tested_at: string | null; backup_tested_at: string | null
}
export type TelephonyHotel = {
  hotel_id: string; display_name: string; is_active: boolean
  lines: "reservations" | "sales" | "both"; sales_line_enabled: boolean; sales_ready: boolean
  agent_phone_number: string | null; sales_agent_phone_number: string | null
}
export type TelephonyNumber = {
  number: string; number_sid: string | null; label: string; voice_capable: boolean
  hotel_id: string | null; hotel_name: string | null; line: TelephonyLine | null
  status: "not_connected" | "needs_attention" | "status_unavailable" | "backup_only" | "ai_connected"
  problems: string[]; current_route: Record<string, string> | null; config: TelephonyConfig | null
}
export type TelephonyPlanInput = {
  hotel_id: string; line: TelephonyLine; number_sid: string
  backup_number: string; backup_label: string; mode: TelephonyMode; acknowledge_takeover: boolean
}
export type TelephonyOperation = {
  id: string; status: "preview" | "queued" | "running" | "succeeded" | "failed" | "cancelled"
  number: string; request: TelephonyPlanInput; hotel_name: string; source_hotel_name: string | null
  current_route: Record<string, string>; steps: string[]; warnings: string[]; write_blockers: string[]
  progress: { phase?: string; compensation?: string }; error: string | null; created_at: string
}
export type TelephonyOverview = {
  connections: {
    environment: string; writes_enabled: boolean; write_blockers: string[]
    twilio_configured: boolean; twilio_account_sid: string | null
    livekit_configured: boolean; livekit_host: string | null
    recovery_domain: string | null; recovery_verified: boolean; worker_readiness: string
  }
  observed_at: string; errors: string[]; numbers: TelephonyNumber[]; hotels: TelephonyHotel[]
  operations: TelephonyOperation[]
}

const root = "/api/v1/admin/telephony"
export const fetchTelephony = (signal?: AbortSignal) => api<TelephonyOverview>(`${root}/numbers`, { signal })
export const previewTelephony = (body: TelephonyPlanInput) => api<TelephonyOperation>(`${root}/plans`, { method: "POST", body })
export const applyTelephony = (plan: TelephonyOperation, idempotencyKey: string, number: string) =>
  api<TelephonyOperation>(`${root}/operations`, { method: "POST", body: { plan_id: plan.id, idempotency_key: idempotencyKey, confirm_number: number } })
export const fetchTelephonyOperation = (id: string, signal?: AbortSignal) =>
  api<TelephonyOperation>(`${root}/operations/${encodeURIComponent(id)}`, { signal })
export const recordTelephonyTest = (config: TelephonyConfig, kind: "ai" | "backup") =>
  api<TelephonyConfig>(`${root}/hotels/${encodeURIComponent(config.hotel_id)}/lines/${config.line}/tests`, {
    method: "POST", body: { kind, expected_version: config.version, heard_expected_destination: true },
  })

export const cancelTelephonyOperation = (id: string) => api<TelephonyOperation>(`${root}/operations/${encodeURIComponent(id)}`, { method: "DELETE" })
