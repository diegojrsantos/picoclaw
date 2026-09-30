import { useAtomValue } from "jotai"
import { useEffect, useState } from "react"
import { useTranslation } from "react-i18next"

import { chatAtom } from "@/store/chat"
import type { TurnPhase } from "@/store/chat"

/**
 * After this many milliseconds without any stream event, the indicator stops
 * pretending everything is normal and escalates to a clearly different
 * "still working" state. This is driven only by real stream activity
 * (`turnActivityAt` is stamped on every pico event) — never by fake progress.
 */
const STALLED_AFTER_MS = 20_000

const PHASE_KEYS: Record<TurnPhase, string> = {
  idle: "chat.working.thinking",
  connecting: "chat.working.connecting",
  thinking: "chat.working.thinking",
  reasoning: "chat.working.reasoning",
  tool: "chat.working.tool",
  writing: "chat.working.writing",
}

function formatElapsed(ms: number): string {
  const totalSeconds = Math.max(0, Math.floor(ms / 1000))
  const minutes = Math.floor(totalSeconds / 60)
  const seconds = totalSeconds % 60
  if (minutes > 0) {
    return `${minutes}:${seconds.toString().padStart(2, "0")}`
  }
  return `${seconds}s`
}

export function TypingIndicator() {
  const { t } = useTranslation()
  const { turnPhase, turnPhaseDetail, turnStartedAt, turnActivityAt } =
    useAtomValue(chatAtom)

  const [now, setNow] = useState(() => Date.now())

  // Tick once per second while a turn is running so the elapsed timer and the
  // stalled escalation stay live. No timer at all when idle.
  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000)
    return () => clearInterval(interval)
  }, [])

  const phase: TurnPhase = turnPhase === "idle" ? "connecting" : turnPhase
  const elapsed = turnStartedAt ? now - turnStartedAt : 0
  const sinceActivity = turnActivityAt ? now - turnActivityAt : elapsed
  const stalled = sinceActivity >= STALLED_AFTER_MS

  const label =
    phase === "tool"
      ? turnPhaseDetail
        ? t("chat.working.toolNamed", { tool: turnPhaseDetail })
        : t("chat.working.tool")
      : t(PHASE_KEYS[phase])

  return (
    <div className="flex w-full flex-col gap-1.5">
      <div className="bg-card border-border/50 inline-flex w-fit max-w-xs flex-col gap-3 rounded-xl border px-5 py-4">
        <div className="flex items-center gap-1.5">
          <span
            className={`size-2 rounded-full bg-violet-400/70 [animation-delay:-0.3s] ${
              stalled ? "animate-pulse" : "animate-bounce"
            }`}
          />
          <span
            className={`size-2 rounded-full bg-violet-400/70 [animation-delay:-0.15s] ${
              stalled ? "animate-pulse" : "animate-bounce"
            }`}
          />
          <span
            className={`size-2 rounded-full bg-violet-400/70 ${
              stalled ? "animate-pulse" : "animate-bounce"
            }`}
          />
          {turnStartedAt && (
            <span className="text-muted-foreground/70 ml-1 text-[11px] tabular-nums">
              {formatElapsed(elapsed)}
            </span>
          )}
        </div>

        <div className="bg-muted relative h-1 w-36 overflow-hidden rounded-full">
          <div className="absolute inset-0 animate-[shimmer_2s_infinite] rounded-full bg-gradient-to-r from-violet-500/60 via-violet-400/80 to-violet-500/60 bg-[length:200%_100%]" />
        </div>

        <p
          key={`${phase}-${turnPhaseDetail ?? ""}-${stalled}`}
          className="text-muted-foreground animate-[fadeSlideIn_0.4s_ease-out] text-xs"
        >
          {label}
        </p>

        {stalled && (
          <p className="text-muted-foreground/80 animate-[fadeSlideIn_0.4s_ease-out] text-[11px] leading-snug">
            {t("chat.working.stalledHint")}
          </p>
        )}
      </div>
    </div>
  )
}
