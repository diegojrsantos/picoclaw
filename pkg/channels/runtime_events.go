package channels

import runtimeevents "github.com/sipeed/picoclaw/pkg/events"

// RuntimeEventAware is implemented by channels that consume runtime events.
type RuntimeEventAware interface {
	SetRuntimeEvents(bus runtimeevents.Bus)
}

// Attrs contract emitted by the agent loop for steering-queue feedback.
// Kept in pkg/channels so both pkg/agent and pkg/channels/pico can share it
// without an import cycle.
const (
	AttrKeySteeringResult = "steering_result"
	AttrKeyMessageID      = "message_id"
	AttrKeyQueueDepth     = "queue_depth"
	AttrKeyChannel        = "channel"
	AttrKeyChatID         = "chat_id"

	SteeringResultQueued  = "queued"
	SteeringResultDropped = "dropped"
)
