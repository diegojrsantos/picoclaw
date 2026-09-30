import { atom, getDefaultStore } from "jotai"
import { atomWithStorage } from "jotai/utils"

import {
  ASSISTANT_DETAIL_VISIBILITY_STORAGE_KEY,
  type AssistantDetailVisibility,
  DEFAULT_ASSISTANT_DETAIL_VISIBILITY,
  assistantDetailVisibilityStorage,
  shouldShowAssistantMessage,
} from "@/features/chat/detail-visibility"
import {
  getInitialActiveSessionId,
  writeStoredSessionId,
} from "@/features/chat/state"

export interface ChatAttachment {
  type: "image" | "audio" | "video" | "file"
  url: string
  filename?: string
  contentType?: string
}

export interface ChatToolCallFunction {
  name?: string
  arguments?: string
}

export interface ChatToolCallExtraContent {
  toolFeedbackExplanation?: string
}

export interface ChatToolCall {
  id?: string
  type?: string
  function?: ChatToolCallFunction
  extraContent?: ChatToolCallExtraContent
}

export type AssistantMessageKind = "normal" | "thought" | "tool_calls"

export interface ChatMessage {
  id: string
  role: "user" | "assistant"
  content: string
  timestamp: number | string
  kind?: AssistantMessageKind
  modelName?: string
  attachments?: ChatAttachment[]
  toolCalls?: ChatToolCall[]
}

export interface ContextUsage {
  used_tokens: number
  total_tokens: number
  history_tokens?: number
  compress_at_tokens: number
  summarize_at_tokens?: number
  used_percent: number
}

export type ConnectionState =
  | "disconnected"
  | "connecting"
  | "connected"
  | "error"

/**
 * What the current turn is actually doing, derived only from events the pico
 * WebSocket really reports (see `features/chat/turn-phase.ts`). There is no
 * synthetic progress here: if the stream goes quiet the phase simply stops
 * advancing and the UI escalates to a "still working" hint.
 */
export type TurnPhase =
  | "idle"
  | "connecting"
  | "thinking"
  | "reasoning"
  | "tool"
  | "writing"

export interface ChatStoreState {
  messages: ChatMessage[]
  connectionState: ConnectionState
  isTyping: boolean
  activeSessionId: string
  hasHydratedActiveSession: boolean
  contextUsage?: ContextUsage
  /** Current turn phase; `idle` when no turn is running. */
  turnPhase: TurnPhase
  /** Extra detail for the phase, e.g. the name of the tool being run. */
  turnPhaseDetail?: string
  /** Epoch ms when the running turn started; undefined when idle. */
  turnStartedAt?: number
  /** Epoch ms of the last stream event seen for the running turn. */
  turnActivityAt?: number
}

type ChatStorePatch = Partial<ChatStoreState>

const DEFAULT_CHAT_STATE: ChatStoreState = {
  messages: [],
  connectionState: "disconnected",
  isTyping: false,
  activeSessionId: getInitialActiveSessionId(),
  hasHydratedActiveSession: false,
  turnPhase: "idle",
}

export const chatAtom = atom<ChatStoreState>(DEFAULT_CHAT_STATE)
export const assistantDetailVisibilityAtom =
  atomWithStorage<AssistantDetailVisibility>(
    ASSISTANT_DETAIL_VISIBILITY_STORAGE_KEY,
    DEFAULT_ASSISTANT_DETAIL_VISIBILITY,
    assistantDetailVisibilityStorage,
    { getOnInit: true },
  )
export const showAssistantDetailsAtom = atom(
  (get) => get(assistantDetailVisibilityAtom) !== "none",
)

const store = getDefaultStore()

export function getChatState() {
  return store.get(chatAtom)
}

export function updateChatStore(
  patch:
    | ChatStorePatch
    | ((prev: ChatStoreState) => ChatStorePatch | ChatStoreState),
) {
  store.set(chatAtom, (prev) => {
    const nextPatch = typeof patch === "function" ? patch(prev) : patch
    const next = { ...prev, ...nextPatch }

    if (next.activeSessionId !== prev.activeSessionId) {
      writeStoredSessionId(next.activeSessionId)
    }

    // Keep the turn phase honest even for call sites that only flip `isTyping`
    // (send / switch session / new chat / connection errors). When a patch does
    // not set the phase explicitly, derive it from `isTyping` so the indicator
    // can never get stuck on a stale phase.
    if (!("turnPhase" in nextPatch)) {
      if (next.isTyping === false) {
        if (next.turnPhase !== "idle") {
          next.turnPhase = "idle"
          next.turnPhaseDetail = undefined
          next.turnStartedAt = undefined
          next.turnActivityAt = undefined
        }
      } else if (next.turnPhase === "idle") {
        const now = Date.now()
        next.turnPhase = "connecting"
        next.turnStartedAt = now
        next.turnActivityAt = now
      }
    }

    return next
  })
}

export { shouldShowAssistantMessage, DEFAULT_ASSISTANT_DETAIL_VISIBILITY }
export type { AssistantDetailVisibility }
