import { useCallback, useEffect, useRef, useState } from "react"

import {
  type SessionSource,
  type SessionSummary,
  deleteSession,
  getSessions,
} from "@/api/sessions"

/**
 * Page size for the sessions fetch. The sidebar shows a compact list, so a
 * single first page is usually enough; `loadMore` keeps paginating on demand.
 */
const PAGE_SIZE = 30

export interface SidebarSessionGroup {
  /** Sessions from the interactive Web UI (source === "manual"). */
  chats: SessionSummary[]
  /**
   * Sessions owned by another channel (telegram, cli, ...) or by pico
   * automation (cron, bridges). These are read-only from the Web UI.
   */
  channels: SessionSummary[]
}

interface UseSidebarSessionsResult {
  group: SidebarSessionGroup
  /** Total number of sessions loaded so far (chats + channels). */
  count: number
  isLoading: boolean
  loadError: boolean
  hasMore: boolean
  /** (Re)load from the first page. */
  refresh: () => void
  /** Load the next page and append it. */
  loadMore: () => void
  /** Hard-delete a session and drop it from the local list. */
  remove: (id: string) => Promise<void>
}

const EMPTY_GROUP: SidebarSessionGroup = { chats: [], channels: [] }

/**
 * Classify a session into "chats" (writable Web UI chats) or "channels"
 * (everything else, read-only). Legacy sessions without a `source` are treated
 * as chats so they stay reachable and writable, matching the store's
 * "unknown = writable" rule.
 */
function isChatSession(session: SessionSummary): boolean {
  const source: SessionSource | undefined = session.source
  return source === undefined || source === "manual"
}

function partition(sessions: SessionSummary[]): SidebarSessionGroup {
  const chats: SessionSummary[] = []
  const channels: SessionSummary[] = []
  for (const session of sessions) {
    if (isChatSession(session)) {
      chats.push(session)
    } else {
      channels.push(session)
    }
  }
  return { chats, channels }
}

/**
 * Loads and groups the session history for the global sidebar.
 *
 * This replaces the old `useSessionHistory` hook that fed the header dropdown:
 * the sidebar is always mounted (see `app-layout.tsx`), so it fetches once on
 * mount and re-fetches when the gateway becomes available or when a session is
 * opened/deleted. Grouping happens client-side (SDD #3406 Part 2-A §4.4/§6.1).
 */
export function useSidebarSessions({
  enabled,
  activeSessionId,
  onDeletedActiveSession,
}: {
  /** Skip fetching while false (e.g. the group is collapsed). */
  enabled: boolean
  /** Currently active session id, used to trigger a refresh after a switch. */
  activeSessionId: string
  /** Called when the active session is deleted so the caller can reset. */
  onDeletedActiveSession: () => void
}): UseSidebarSessionsResult {
  const [sessions, setSessions] = useState<SessionSummary[]>([])
  const [isLoading, setIsLoading] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const offsetRef = useRef(0)
  const inFlightRef = useRef(false)
  const mountedRef = useRef(true)

  useEffect(() => {
    mountedRef.current = true
    return () => {
      mountedRef.current = false
    }
  }, [])

  const fetchPage = useCallback(async (reset: boolean) => {
    if (inFlightRef.current) {
      return
    }
    inFlightRef.current = true
    setIsLoading(true)
    try {
      const offset = reset ? 0 : offsetRef.current
      const page = await getSessions(offset, PAGE_SIZE)
      if (!mountedRef.current) {
        return
      }
      setLoadError(false)
      setHasMore(page.length === PAGE_SIZE)
      offsetRef.current = offset + page.length
      setSessions((prev) => {
        if (reset) {
          return page
        }
        const seen = new Set(prev.map((s) => s.id))
        return [...prev, ...page.filter((s) => !seen.has(s.id))]
      })
    } catch (error) {
      console.error("Failed to fetch sessions for sidebar:", error)
      if (mountedRef.current) {
        setLoadError(true)
      }
    } finally {
      inFlightRef.current = false
      if (mountedRef.current) {
        setIsLoading(false)
      }
    }
  }, [])

  const refresh = useCallback(() => {
    void fetchPage(true)
  }, [fetchPage])

  const loadMore = useCallback(() => {
    void fetchPage(false)
  }, [fetchPage])

  // Initial + refresh-on-open load.
  useEffect(() => {
    if (!enabled) {
      return
    }
    void fetchPage(true)
  }, [enabled, fetchPage])

  // Refresh when the active session changes so the highlight and the freshly
  // created/updated session show up without a manual reload.
  const firstActiveRef = useRef(true)
  useEffect(() => {
    if (!enabled) {
      return
    }
    if (firstActiveRef.current) {
      firstActiveRef.current = false
      return
    }
    void fetchPage(true)
  }, [activeSessionId, enabled, fetchPage])

  const remove = useCallback(
    async (id: string) => {
      try {
        await deleteSession(id)
        setSessions((prev) => prev.filter((s) => s.id !== id))
        offsetRef.current = Math.max(offsetRef.current - 1, 0)
        if (id === activeSessionId) {
          onDeletedActiveSession()
        }
      } catch (error) {
        console.error("Failed to delete session:", error)
      }
    },
    [activeSessionId, onDeletedActiveSession],
  )

  const group = sessions.length === 0 ? EMPTY_GROUP : partition(sessions)

  return {
    group,
    count: sessions.length,
    isLoading,
    loadError,
    hasMore,
    refresh,
    loadMore,
    remove,
  }
}
