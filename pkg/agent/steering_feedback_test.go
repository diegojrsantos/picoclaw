package agent

import (
	"testing"
	"time"

	"github.com/sipeed/picoclaw/pkg/channels"
	runtimeevents "github.com/sipeed/picoclaw/pkg/events"
	"github.com/sipeed/picoclaw/pkg/providers"
)

func TestEnqueueSteeringMessage_EmitsQueuedFeedback(t *testing.T) {
	al, _, _, _, cleanup := newTestAgentLoop(t)
	defer cleanup()

	ch, closeSub := subscribeRuntimeEventsForTest(t, al, 32, runtimeevents.KindAgentInterruptReceived)
	defer closeSub()

	err := al.enqueueSteeringMessage(
		"session-1",
		"agent-id",
		providers.Message{Role: "user", Content: "hi"},
		steeringOrigin{MessageID: "client-1", Channel: "pico", ChatID: "pico:sess-1"},
	)
	if err != nil {
		t.Fatalf("enqueueSteeringMessage() error = %v", err)
	}

	evt := waitForRuntimeEvent(t, ch, 2*time.Second, func(e runtimeevents.Event) bool {
		result, _ := e.Attrs[channels.AttrKeySteeringResult].(string)
		return result == channels.SteeringResultQueued
	})

	if got, _ := evt.Attrs[channels.AttrKeyMessageID].(string); got != "client-1" {
		t.Fatalf("message_id = %q, want client-1", got)
	}
	if got, _ := evt.Attrs[channels.AttrKeyChannel].(string); got != "pico" {
		t.Fatalf("channel = %q, want pico", got)
	}
	if got, _ := evt.Attrs[channels.AttrKeyChatID].(string); got != "pico:sess-1" {
		t.Fatalf("chat_id = %q, want pico:sess-1", got)
	}
	if got, _ := evt.Attrs[channels.AttrKeyQueueDepth].(int); got != 1 {
		t.Fatalf("queue_depth = %v, want 1", got)
	}
}

func TestEnqueueSteeringMessage_QueueFullEmitsDropFeedback(t *testing.T) {
	al, _, _, _, cleanup := newTestAgentLoop(t)
	defer cleanup()

	ch, closeSub := subscribeRuntimeEventsForTest(t, al, 32, runtimeevents.KindAgentInterruptReceived)
	defer closeSub()

	for i := 0; i < MaxQueueSize; i++ {
		if err := al.steering.pushScope("session-1", providers.Message{Role: "user", Content: "fill"}); err != nil {
			t.Fatalf("pushScope fill: %v", err)
		}
	}

	err := al.enqueueSteeringMessage(
		"session-1",
		"agent-id",
		providers.Message{Role: "user", Content: "overflow"},
		steeringOrigin{MessageID: "client-1", Channel: "pico", ChatID: "pico:sess-1"},
	)
	if err == nil {
		t.Fatal("expected queue-full error, got nil")
	}

	evt := waitForRuntimeEvent(t, ch, 2*time.Second, func(e runtimeevents.Event) bool {
		result, _ := e.Attrs[channels.AttrKeySteeringResult].(string)
		return result == channels.SteeringResultDropped
	})

	if got, _ := evt.Attrs[channels.AttrKeyMessageID].(string); got != "client-1" {
		t.Fatalf("message_id = %q, want client-1", got)
	}
}
