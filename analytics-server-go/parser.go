package main

import (
	"encoding/json"
	"strconv"
	"strings"
	"time"
)

type AnalyticsEvent struct {
	Event      string    `json:"event"`
	Publisher  string    `json:"publisher"`
	Slot       string    `json:"slot"`
	Ts         uint64    `json:"ts"`
	Timestamp  time.Time `json:"time"`
	Tag        string    `json:"tag"`
	ErrMsg     string    `json:"error"`
	Quartile   uint8     `json:"quartile"`
	Duration   uint32    `json:"duration"`
	MediaCount uint8     `json:"mediaCount"`
	TagUrl     string    `json:"tagUrl"`
	Progress   string    `json:"progress"`
	JSON       string    `json:"json"`
}

func parseQuery(q string) AnalyticsEvent {
	now := time.Now()
	ev := AnalyticsEvent{
		Event:     "unknown",
		Timestamp: now,
		Ts:        uint64(now.UnixMilli()),
	}

	var extra map[string]string
	tail := q
	for tail != "" {
		i := strings.IndexByte(tail, '&')
		var part string
		if i < 0 {
			part = tail
			tail = ""
		} else {
			part = tail[:i]
			tail = tail[i+1:]
		}
		if part == "" {
			continue
		}

		j := strings.IndexByte(part, '=')
		var key, val string
		if j < 0 {
			key = part
		} else {
			key = part[:j]
			val = part[j+1:]
		}

		switch key {
		case "event":
			ev.Event = val
		case "publisher":
			ev.Publisher = val
		case "slot":
			ev.Slot = val
		case "ts":
			if v, err := strconv.ParseUint(val, 10, 64); err == nil && v > 0 {
				ev.Ts = v
				ev.Timestamp = time.UnixMilli(int64(v))
			}
		case "tag":
			ev.Tag = val
		case "error":
			ev.ErrMsg = val
		case "quartile":
			if v, err := strconv.ParseUint(val, 10, 8); err == nil {
				ev.Quartile = uint8(v)
			}
		case "duration":
			if v, err := strconv.ParseUint(val, 10, 32); err == nil {
				ev.Duration = uint32(v)
			}
		case "mediaCount":
			if v, err := strconv.ParseUint(val, 10, 8); err == nil {
				ev.MediaCount = uint8(v)
			}
		case "tagUrl":
			ev.TagUrl = val
		case "progress":
			ev.Progress = val
		default:
			if extra == nil {
				extra = make(map[string]string, 4)
			}
			extra[key] = val
		}
	}

	if len(extra) > 0 {
		if b, err := json.Marshal(extra); err == nil {
			ev.JSON = string(b)
		}
	}
	return ev
}
