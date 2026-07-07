package main

import (
	"errors"
	"log"
	"time"

	"github.com/nats-io/nats.go"
)

const (
	jetStreamStream   = "analytics-events"
	jetStreamSubject  = "analytics.events"
	jetStreamConsumer = "analytics-workers"
	jetStreamDLQ      = "analytics.dlq"
)

func setupJetStream(nc *nats.Conn) (nats.JetStreamContext, error) {
	js, err := nc.JetStream()
	if err != nil {
		return nil, err
	}

	_, err = js.AddStream(&nats.StreamConfig{
		Name:      jetStreamStream,
		Subjects:  []string{jetStreamSubject},
		Storage:   nats.FileStorage,
		Retention: nats.LimitsPolicy,
		Replicas:  1,
		MaxAge:    7 * 24 * time.Hour,
	})
	if err != nil && !errors.Is(err, nats.ErrStreamNameAlreadyInUse) {
		return nil, err
	}

	_, err = js.AddConsumer(jetStreamStream, &nats.ConsumerConfig{
		Durable:       jetStreamConsumer,
		AckPolicy:     nats.AckExplicitPolicy,
		MaxAckPending: 100_000,
		DeliverPolicy: nats.DeliverAllPolicy,
		AckWait:       30 * time.Second,
		MaxDeliver:    10,
		BackOff:       []time.Duration{time.Second, 2 * time.Second, 4 * time.Second, 8 * time.Second, 16 * time.Second, 32 * time.Second, 64 * time.Second, 128 * time.Second, 256 * time.Second, 512 * time.Second},
	})
	if err != nil && !errors.Is(err, nats.ErrConsumerNameAlreadyInUse) {
		return nil, err
	}

	log.Printf("[nats] jetstream ready stream=%s consumer=%s", jetStreamStream, jetStreamConsumer)
	return js, nil
}

func publishToJetStream(js nats.JetStreamContext) eventPublisher {
	return func(ev AnalyticsEvent) bool {
		data := ev.MarshalBinary()
		_, err := js.PublishAsync(jetStreamSubject, data)
		return err == nil
	}
}
