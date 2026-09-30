import { IconChevronRight, IconPlug, IconTrash } from "@tabler/icons-react"
import dayjs from "dayjs"
import { useAtomValue } from "jotai"
import * as React from "react"
import { useTranslation } from "react-i18next"

import type { SessionSummary } from "@/api/sessions"
import { CHANNEL_ICON_MAP } from "@/components/channels/channel-icon"
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible"
import {
  SidebarGroup,
  SidebarGroupContent,
  SidebarGroupLabel,
  SidebarMenu,
  SidebarMenuButton,
  SidebarMenuItem,
} from "@/components/ui/sidebar"
import {
  newChatSession,
  openReadOnlySession,
  switchChatSession,
} from "@/features/chat/controller"
import { useSidebarSessions } from "@/hooks/use-sidebar-sessions"
import { cn } from "@/lib/utils"
import { chatAtom } from "@/store/chat"

/** A session row plus its resolved channel icon (data, not a component call). */
interface SessionRowData extends SessionSummary {
  icon: React.ComponentType<{ className?: string }>
}

interface SessionRowProps {
  session: SessionRowData
  isActive: boolean
  readOnly: boolean
  onSelect: (session: SessionSummary) => void
  onDelete: (id: string) => void
}

function SessionRow({
  session,
  isActive,
  readOnly,
  onSelect,
  onDelete,
}: SessionRowProps) {
  const { t } = useTranslation()

  return (
    <SidebarMenuItem className="group/session">
      <SidebarMenuButton
        isActive={isActive}
        onClick={() => onSelect(session)}
        title={session.title}
        className={cn(
          "h-auto min-h-9 px-3 py-1.5",
          isActive
            ? "bg-accent/80 text-foreground font-medium"
            : "text-muted-foreground hover:bg-muted/60",
        )}
      >
        <session.icon
          className={cn(
            "size-4 shrink-0",
            isActive ? "opacity-100" : "opacity-60",
          )}
        />
        <span className="flex min-w-0 flex-1 flex-col items-start gap-0.5 overflow-hidden">
          <span
            className={cn(
              "line-clamp-1 w-full text-left text-xs",
              isActive ? "opacity-100" : "opacity-90",
            )}
          >
            {session.title}
          </span>
          <span className="text-muted-foreground/80 line-clamp-1 w-full text-left text-[10px]">
            {t("chat.messagesCount", { count: session.message_count })} ·{" "}
            {dayjs(session.updated).fromNow()}
            {readOnly ? ` · ${t("chat.sessions.readOnlyBadge")}` : ""}
          </span>
        </span>
      </SidebarMenuButton>
      <button
        type="button"
        aria-label={t("chat.deleteSession")}
        title={t("chat.deleteSession")}
        onClick={(event) => {
          event.preventDefault()
          event.stopPropagation()
          onDelete(session.id)
        }}
        className="text-muted-foreground hover:bg-destructive/10 hover:text-destructive absolute top-1/2 right-2 inline-flex h-6 w-6 -translate-y-1/2 items-center justify-center rounded-md opacity-0 transition-opacity group-hover/session:opacity-100"
      >
        <IconTrash className="h-3.5 w-3.5" />
      </button>
    </SidebarMenuItem>
  )
}

/**
 * The "Sessions" group of the global sidebar (SDD #3406 Part 2-A §4.4).
 *
 * Lists every discovered session, grouped client-side into *Chats* (writable
 * Web UI chats) and *Channels* (sessions owned by another channel or by pico
 * automation — read-only). Selecting a chat switches the pico WebSocket to it;
 * selecting a channel session opens it read-only (composer disabled).
 */
export function SidebarSessions() {
  const { t } = useTranslation()
  const [open, setOpen] = React.useState(true)
  const { activeSessionId } = useAtomValue(chatAtom)

  const { group, isLoading, loadError, hasMore, loadMore, remove } =
    useSidebarSessions({
      enabled: open,
      activeSessionId,
      onDeletedActiveSession: () => void newChatSession(),
    })

  const handleSelect = React.useCallback((session: SessionSummary) => {
    if (session.source === undefined || session.source === "manual") {
      void switchChatSession(session.id)
      return
    }
    void openReadOnlySession(session.id)
  }, [])

  // Resolve the channel icon as data (a member expression on the map), never as
  // a component created during render, to satisfy react-hooks/static-components.
  const withIcon = React.useCallback(
    (session: SessionSummary): SessionRowData => ({
      ...session,
      icon: (session.channel && CHANNEL_ICON_MAP[session.channel]) || IconPlug,
    }),
    [],
  )

  const chatRows = React.useMemo(
    () => group.chats.map(withIcon),
    [group.chats, withIcon],
  )
  const channelRows = React.useMemo(
    () => group.channels.map(withIcon),
    [group.channels, withIcon],
  )

  const isEmpty = chatRows.length === 0 && channelRows.length === 0

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="group/collapsible mb-1"
    >
      <SidebarGroup className="px-2 py-0">
        <SidebarGroupLabel asChild>
          <CollapsibleTrigger className="hover:bg-muted/60 flex w-full cursor-pointer items-center justify-between rounded-md px-2 py-1.5 transition-colors">
            <span>{t("chat.sessions.title")}</span>
            <IconChevronRight className="size-3.5 opacity-50 transition-transform duration-200 group-data-[state=open]/collapsible:rotate-90" />
          </CollapsibleTrigger>
        </SidebarGroupLabel>
        <CollapsibleContent>
          <SidebarGroupContent className="pt-1">
            {loadError && (
              <p className="text-destructive px-3 py-1 text-[11px]">
                {t("chat.historyLoadFailed")}
              </p>
            )}
            {!loadError && isEmpty && !isLoading && (
              <p className="text-muted-foreground px-3 py-1 text-[11px]">
                {t("chat.noHistory")}
              </p>
            )}

            {chatRows.length > 0 && (
              <>
                <p className="text-muted-foreground/70 px-3 pt-1 pb-0.5 text-[10px] font-medium tracking-wide uppercase">
                  {t("chat.sessions.groupChats")}
                </p>
                <SidebarMenu>
                  {chatRows.map((session) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      isActive={session.id === activeSessionId}
                      readOnly={false}
                      onSelect={handleSelect}
                      onDelete={(id) => void remove(id)}
                    />
                  ))}
                </SidebarMenu>
              </>
            )}

            {channelRows.length > 0 && (
              <>
                <p className="text-muted-foreground/70 px-3 pt-2 pb-0.5 text-[10px] font-medium tracking-wide uppercase">
                  {t("chat.sessions.groupChannels")}
                </p>
                <SidebarMenu>
                  {channelRows.map((session) => (
                    <SessionRow
                      key={session.id}
                      session={session}
                      isActive={session.id === activeSessionId}
                      readOnly
                      onSelect={handleSelect}
                      onDelete={(id) => void remove(id)}
                    />
                  ))}
                </SidebarMenu>
              </>
            )}

            {hasMore && (
              <SidebarMenu>
                <SidebarMenuItem>
                  <SidebarMenuButton
                    onClick={loadMore}
                    disabled={isLoading}
                    className="text-muted-foreground hover:bg-muted/60 h-8 px-3 text-xs"
                  >
                    <span className="opacity-80">
                      {isLoading
                        ? t("chat.loadingMore")
                        : t("chat.sessions.loadMore")}
                    </span>
                  </SidebarMenuButton>
                </SidebarMenuItem>
              </SidebarMenu>
            )}
          </SidebarGroupContent>
        </CollapsibleContent>
      </SidebarGroup>
    </Collapsible>
  )
}
