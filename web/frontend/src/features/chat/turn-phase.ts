import type { ChatToolCall, TurnPhase } from "@/store/chat"

/**
 * A single stream event that can move the turn phase forward.
 *
 * Every value here maps 1:1 to something the pico WebSocket actually reports
 * (see `features/chat/protocol.ts`). We never invent progress: if no event
 * arrives, the phase simply stops advancing and the UI escalates to a
 * "still working" hint based on elapsed time.
 */
export type TurnPhaseEvent =
  /** `typing.start` — a turn began, waiting on the model. */
  | { kind: "start" }
  /** `typing.stop`, an error, or the final assistant message — turn ended. */
  | { kind: "stop" }
  /** `message.create` with `placeholder: true` — the model is generating. */
  | { kind: "generating" }
  /** An assistant message with `kind === "thought"` — reasoning in progress. */
  | { kind: "reasoning" }
  /** An assistant message with `kind === "tool_calls"` — a tool is running. */
  | { kind: "tool"; toolName?: string }
  /** A normal assistant message create/update — the reply is being written. */
  | { kind: "writing" }

/** The slice of chat-store state that tracks the running turn. */
export interface TurnPhaseState {
  turnPhase: TurnPhase
  turnPhaseDetail?: string
  turnStartedAt?: number
  turnActivityAt?: number
}

/** Phases ordered from "least progress" to "most progress". */
const PHASE_RANK: Record<TurnPhase, number> = {
  idle: 0,
  connecting: 1,
  thinking: 2,
  reasoning: 3,
  tool: 4,
  writing: 5,
}

/**
 * Pick a human-readable name for the tool currently in flight, if any.
 */
export function firstToolCallName(
  toolCalls: ChatToolCall[] | undefined,
): string | undefined {
  if (!toolCalls || toolCalls.length === 0) {
    return undefined
  }
  for (const call of toolCalls) {
    const name = call.function?.name?.trim()
    if (name) {
      return name
    }
  }
  return undefined
}

/**
 * Fold a stream event into the current turn-phase state.
 *
 * `now` is injected so the reducer stays pure and testable.
 */
export function applyTurnPhaseEvent(
  prev: TurnPhaseState,
  event: TurnPhaseEvent,
  now: number,
): TurnPhaseState {
  switch (event.kind) {
    case "stop":
      return {
        turnPhase: "idle",
        turnPhaseDetail: undefined,
        turnStartedAt: undefined,
        turnActivityAt: undefined,
      }

    case "start":
      return {
        turnPhase: "connecting",
        turnPhaseDetail: undefined,
        turnStartedAt: now,
        turnActivityAt: now,
      }

    case "generating":
      return {
        turnPhase: "thinking",
        turnPhaseDetail: undefined,
        turnStartedAt: prev.turnStartedAt ?? now,
        turnActivityAt: now,
      }

    case "reasoning":
      return {
        turnPhase: "reasoning",
        turnPhaseDetail: undefined,
        turnStartedAt: prev.turnStartedAt ?? now,
        turnActivityAt: now,
      }

    case "tool":
      return {
        turnPhase: "tool",
        turnPhaseDetail: event.toolName,
        turnStartedAt: prev.turnStartedAt ?? now,
        turnActivityAt: now,
      }

    case "writing":
      return {
        turnPhase: "writing",
        turnPhaseDetail: undefined,
        turnStartedAt: prev.turnStartedAt ?? now,
        turnActivityAt: now,
      }
  }
}

/**
 * True when the phase has moved past the initial "connecting" wait, i.e. the
 * stream has reported at least one concrete piece of progress.
 */
export function hasProgressed(phase: TurnPhase): boolean {
  return PHASE_RANK[phase] > PHASE_RANK.connecting
}
