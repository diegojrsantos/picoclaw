package pico

import (
	"context"
	"sync"
	"testing"
	"time"

	"github.com/sipeed/picoclaw/pkg/channels"
	runtimeevents "github.com/sipeed/picoclaw/pkg/events"
)

// frameCapture collects frames broadcast through a test broadcastFn.
type frameCapture struct {
	mu     sync.Mutex
	frames []PicoMessage
}

func (f *frameCapture) capture(chatID string, msg PicoMessage) error {
	f.mu.Lock()
	defer f.mu.Unlock()
	f.frames = append(f.frames, msg)
	return nil
}

func (f *frameCapture) count() int {
	f.mu.Lock()
	defer f.mu.Unlock()
	return len(f.frames)
}

func (f *frameCapture) wait(t *testing.T, timeout time.Duration) PicoMessage {
	t.Helper()
	deadline := time.Now().Add(timeout)
	for {
		f.mu.Lock()
		if len(f.frames) > 0 {
			msg := f.frames[0]
			f.mu.Unlock()
			return msg
		}
		f.mu.Unlock()
		if time.Now().After(deadline) {
			t.Fatal("timed out waiting for captured frame")
		}
		time.Sleep(5 * time.Millisecond)
	}
}

func newRuntimeEventTestChannel(t *testing.T) (*PicoChannel, *frameCapture, runtimeevents.Bus) {
	t.Helper()

	ch := newTestPicoChannel(t)
	capture := &frameCapture{}
	ch.broadcastFn = capture.capture

	bus := runtimeevents.NewBus()
	ch.SetRuntimeEvents(bus)
	if err := ch.Start(context.Background()); err != nil {
		t.Fatalf("Start() error = %v", err)
	}
	t.Cleanup(func() { _ = ch.Stop(context.Background()) })

	return ch, capture, bus
}

func TestRuntimeEvent_QueuedBroadcastsMessageQueued(t *testing.T) {
	_, capture, bus := newRuntimeEventTestChannel(t)

	bus.PublishNonBlocking(runtimeevents.Event{
		Kind:   runtimeevents.KindAgentInterruptReceived,
		Source: runtimeevents.Source{Component: "agent"},
		Attrs: map[string]any{
			channels.AttrKeySteeringResult: channels.SteeringResultQueued,
			channels.AttrKeyMessageID:      "client-1",
			channels.AttrKeyChannel:        "pico",
			channels.AttrKeyChatID:         "pico:sess-1",
			channels.AttrKeyQueueDepth:     3,
		},
	})

	frame := capture.wait(t, 2*time.Second)
	if frame.Type != TypeMessageQueued {
		t.Fatalf("frame type = %q, want %q", frame.Type, TypeMessageQueued)
	}
	if got, _ := frame.Payload[PayloadKeyRequestID].(string); got != "client-1" {
		t.Fatalf("request_id = %q, want client-1", got)
	}
	if got, _ := frame.Payload[PayloadKeyQueueDepth].(int); got != 3 {
		t.Fatalf("queue_depth = %v, want 3", got)
	}
	if frame.ID == "" {
		t.Fatal("frame ID is empty")
	}
	if frame.SessionID != "sess-1" {
		t.Fatalf("session_id = %q, want sess-1", frame.SessionID)
	}
}

func TestRuntimeEvent_DroppedBroadcastsError(t *testing.T) {
	_, capture, bus := newRuntimeEventTestChannel(t)

	bus.PublishNonBlocking(runtimeevents.Event{
		Kind:   runtimeevents.KindAgentInterruptReceived,
		Source: runtimeevents.Source{Component: "agent"},
		Attrs: map[string]any{
			channels.AttrKeySteeringResult: channels.SteeringResultDropped,
			channels.AttrKeyMessageID:      "client-1",
			channels.AttrKeyChannel:        "pico",
			channels.AttrKeyChatID:         "pico:sess-1",
		},
	})

	frame := capture.wait(t, 2*time.Second)
	if frame.Type != TypeError {
		t.Fatalf("frame type = %q, want %q", frame.Type, TypeError)
	}
	if got, _ := frame.Payload["code"].(string); got != ErrorCodeSteeringQueueFull {
		t.Fatalf("code = %q, want %q", got, ErrorCodeSteeringQueueFull)
	}
	if got, _ := frame.Payload[PayloadKeyRequestID].(string); got != "client-1" {
		t.Fatalf("request_id = %q, want client-1", got)
	}
}

func TestRuntimeEvent_IgnoresNonPicoAndNonSteering(t *testing.T) {
	_, capture, bus := newRuntimeEventTestChannel(t)

	// Non-pico channel must be ignored.
	bus.PublishNonBlocking(runtimeevents.Event{
		Kind:   runtimeevents.KindAgentInterruptReceived,
		Source: runtimeevents.Source{Component: "agent"},
		Attrs: map[string]any{
			channels.AttrKeySteeringResult: channels.SteeringResultQueued,
			channels.AttrKeyMessageID:      "client-1",
			channels.AttrKeyChannel:        "telegram",
			channels.AttrKeyChatID:         "pico:sess-1",
		},
	})

	// Non-steering kind must be ignored.
	bus.PublishNonBlocking(runtimeevents.Event{
		Kind:   runtimeevents.KindAgentTurnStart,
		Source: runtimeevents.Source{Component: "agent"},
		Attrs: map[string]any{
			channels.AttrKeySteeringResult: channels.SteeringResultQueued,
			channels.AttrKeyMessageID:      "client-1",
			channels.AttrKeyChannel:        "pico",
			channels.AttrKeyChatID:         "pico:sess-1",
		},
	})

	time.Sleep(200 * time.Millisecond)
	if got := capture.count(); got != 0 {
		t.Fatalf("expected no frames, got %d", got)
	}
}
