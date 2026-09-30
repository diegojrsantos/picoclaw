import { launcherFetch } from "@/api/http"

/**
 * How a session originated (see the backend classifier in
 * `web/backend/api/session.go`):
 * - "manual":  an interactive Web UI chat on the pico channel (writable).
 * - "bridge":  an external integration reusing the pico channel (read-only).
 * - "channel": any other channel (telegram, cli, ...) or pico automation such
 *   as cron jobs (read-only).
 * Empty/undefined for legacy sessions discovered without scope metadata.
 */
export type SessionSource = "manual" | "bridge" | "channel"

export interface SessionSummary {
  id: string
  title: string
  preview: string
  message_count: number
  created: string
  updated: string
  /** Origin channel ("pico", "telegram", "cli", ...); may be absent. */
  channel?: string
  /** Session classification; may be absent for legacy sessions. */
  source?: SessionSource
}

export interface SessionDetail {
  id: string
  messages: {
    role: "user" | "assistant"
    content: string
    created_at?: string
    kind?: "normal" | "thought" | "tool_calls"
    model_name?: string
    media?: string[]
    attachments?: {
      type?: "image" | "audio" | "video" | "file"
      url: string
      filename?: string
      content_type?: string
    }[]
    tool_calls?: {
      id?: string
      type?: string
      function?: {
        name?: string
        arguments?: string
      }
      extra_content?: {
        tool_feedback_explanation?: string
      }
    }[]
  }[]
  summary: string
  created: string
  updated: string
  /** Origin channel ("pico", "telegram", "cli", ...); may be absent. */
  channel?: string
  /** Session classification; may be absent for legacy sessions. */
  source?: SessionSource
}

export async function getSessions(
  offset: number = 0,
  limit: number = 20,
): Promise<SessionSummary[]> {
  const params = new URLSearchParams({
    offset: offset.toString(),
    limit: limit.toString(),
  })

  const res = await launcherFetch(`/api/sessions?${params.toString()}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch sessions: ${res.status}`)
  }
  return res.json()
}

export async function getSessionHistory(id: string): Promise<SessionDetail> {
  const res = await launcherFetch(`/api/sessions/${encodeURIComponent(id)}`)
  if (!res.ok) {
    throw new Error(`Failed to fetch session ${id}: ${res.status}`)
  }
  return res.json()
}

export async function deleteSession(id: string): Promise<void> {
  const res = await launcherFetch(`/api/sessions/${encodeURIComponent(id)}`, {
    method: "DELETE",
  })
  if (!res.ok) {
    throw new Error(`Failed to delete session ${id}: ${res.status}`)
  }
}
