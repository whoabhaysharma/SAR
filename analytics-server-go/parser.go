package main

import (
	"encoding/binary"
	"time"
)

type AnalyticsEvent struct {
	Event      string
	Publisher  string
	Slot       string
	Ts         uint64
	Timestamp  time.Time
	Tag        string
	ErrMsg     string
	Quartile   uint8
	Duration   uint32
	MediaCount uint8
	TagUrl     string
	Progress   string
	JSON       string
}

const protoVersion byte = 1

func (ev *AnalyticsEvent) MarshalBinary() []byte {
	buf := make([]byte, 1+1+ // version + flags
		2+len(ev.Event)+
		2+len(ev.Publisher)+
		2+len(ev.Slot)+
		8+ // ts uint64
		2+len(ev.Tag)+
		2+len(ev.ErrMsg)+
		1+ // quartile
		4+ // duration
		1+ // mediaCount
		2+len(ev.TagUrl)+
		2+len(ev.Progress))

	off := 0
	buf[off] = protoVersion; off++
	buf[off] = 0; off++

	writeStr := func(s string) {
		binary.LittleEndian.PutUint16(buf[off:], uint16(len(s))); off += 2
		copy(buf[off:], s); off += len(s)
	}

	writeStr(ev.Event)
	writeStr(ev.Publisher)
	writeStr(ev.Slot)
	binary.LittleEndian.PutUint64(buf[off:], ev.Ts); off += 8
	writeStr(ev.Tag)
	writeStr(ev.ErrMsg)
	buf[off] = ev.Quartile; off++
	binary.LittleEndian.PutUint32(buf[off:], ev.Duration); off += 4
	buf[off] = ev.MediaCount; off++
	writeStr(ev.TagUrl)
	writeStr(ev.Progress)

	return buf[:off]
}

func (ev *AnalyticsEvent) UnmarshalBinary(data []byte) error {
	if len(data) < 2 || data[0] != protoVersion {
		return nil
	}
	off := 2

	readStr := func() string {
		if off+2 > len(data) {
			return ""
		}
		l := int(binary.LittleEndian.Uint16(data[off:])); off += 2
		if off+l > len(data) {
			return ""
		}
		s := string(data[off : off+l]); off += l
		return s
	}

	ev.Event = readStr()
	ev.Publisher = readStr()
	ev.Slot = readStr()
	if off+8 <= len(data) {
		ev.Ts = binary.LittleEndian.Uint64(data[off:]); off += 8
		if ev.Ts > 0 {
			ev.Timestamp = time.UnixMilli(int64(ev.Ts))
		}
	}
	ev.Tag = readStr()
	ev.ErrMsg = readStr()
	if off < len(data) {
		ev.Quartile = data[off]; off++
	}
	if off+4 <= len(data) {
		ev.Duration = binary.LittleEndian.Uint32(data[off:]); off += 4
	}
	if off < len(data) {
		ev.MediaCount = data[off]; off++
	}
	ev.TagUrl = readStr()
	ev.Progress = readStr()

	if ev.Timestamp.IsZero() {
		ev.Timestamp = time.Now()
		ev.Ts = uint64(ev.Timestamp.UnixMilli())
	}
	return nil
}

func bytesToUint64(b []byte) (uint64, bool) {
	if len(b) == 0 {
		return 0, false
	}
	var v uint64
	for i := 0; i < len(b); i++ {
		c := b[i]
		if c < '0' || c > '9' {
			return 0, false
		}
		v = v*10 + uint64(c-'0')
	}
	return v, true
}

func parseQueryBytes(q []byte) AnalyticsEvent {
	var ev AnalyticsEvent
	ev.Event = "unknown"

	var hasTs bool
	tail := q
	for len(tail) > 0 {
		eq := -1
		end := len(tail)
		for i := 0; i < len(tail); i++ {
			if eq < 0 && tail[i] == '=' {
				eq = i
			}
			if tail[i] == '&' {
				end = i
				break
			}
		}

		keyEnd := end
		if eq >= 0 {
			keyEnd = eq
		}
		if keyEnd == 0 {
			if end < len(tail) {
				tail = tail[end+1:]
			} else {
				tail = nil
			}
			continue
		}

		switch tail[0] {
		case 'e':
			if keyEnd == 5 && tail[1] == 'v' && tail[2] == 'e' && tail[3] == 'n' && tail[4] == 't' {
				if eq >= 0 {
					ev.Event = string(tail[eq+1 : end])
				}
			} else if keyEnd == 5 && tail[1] == 'r' && tail[2] == 'r' && tail[3] == 'o' && tail[4] == 'r' {
				if eq >= 0 {
					ev.ErrMsg = string(tail[eq+1 : end])
				}
			}
		case 'p':
			if keyEnd == 9 && tail[1] == 'u' && tail[2] == 'b' && tail[3] == 'l' && tail[4] == 'i' && tail[5] == 's' && tail[6] == 'h' && tail[7] == 'e' && tail[8] == 'r' {
				if eq >= 0 {
					ev.Publisher = string(tail[eq+1 : end])
				}
			} else if keyEnd == 8 && tail[1] == 'r' && tail[2] == 'o' && tail[3] == 'g' && tail[4] == 'r' && tail[5] == 'e' && tail[6] == 's' && tail[7] == 's' {
				if eq >= 0 {
					ev.Progress = string(tail[eq+1 : end])
				}
			}
		case 's':
			if keyEnd == 4 && tail[1] == 'l' && tail[2] == 'o' && tail[3] == 't' {
				if eq >= 0 {
					ev.Slot = string(tail[eq+1 : end])
				}
			}
		case 't':
			if keyEnd == 2 && tail[1] == 's' {
				if eq >= 0 && end > eq+1 {
					if v, ok := bytesToUint64(tail[eq+1 : end]); ok && v > 0 {
						ev.Ts = v
						ev.Timestamp = time.UnixMilli(int64(v))
						hasTs = true
					}
				}
			} else if keyEnd == 3 && tail[1] == 'a' && tail[2] == 'g' {
				if eq >= 0 {
					ev.Tag = string(tail[eq+1 : end])
				}
			} else if keyEnd == 6 && tail[1] == 'a' && tail[2] == 'g' && tail[3] == 'U' && tail[4] == 'r' && tail[5] == 'l' {
				if eq >= 0 {
					ev.TagUrl = string(tail[eq+1 : end])
				}
			}
		case 'q':
			if keyEnd == 8 && tail[1] == 'u' && tail[2] == 'a' && tail[3] == 'r' && tail[4] == 't' && tail[5] == 'i' && tail[6] == 'l' && tail[7] == 'e' {
				if eq >= 0 && end > eq+1 {
					if v, ok := bytesToUint64(tail[eq+1 : end]); ok {
						ev.Quartile = uint8(v)
					}
				}
			}
		case 'd':
			if keyEnd == 8 && tail[1] == 'u' && tail[2] == 'r' && tail[3] == 'a' && tail[4] == 't' && tail[5] == 'i' && tail[6] == 'o' && tail[7] == 'n' {
				if eq >= 0 && end > eq+1 {
					if v, ok := bytesToUint64(tail[eq+1 : end]); ok {
						ev.Duration = uint32(v)
					}
				}
			}
		case 'm':
			if keyEnd == 10 && tail[1] == 'e' && tail[2] == 'd' && tail[3] == 'i' && tail[4] == 'a' && tail[5] == 'C' && tail[6] == 'o' && tail[7] == 'u' && tail[8] == 'n' && tail[9] == 't' {
				if eq >= 0 && end > eq+1 {
					if v, ok := bytesToUint64(tail[eq+1 : end]); ok {
						ev.MediaCount = uint8(v)
					}
				}
			}
		}

		if end < len(tail) {
			tail = tail[end+1:]
		} else {
			tail = nil
		}
	}

	if !hasTs {
		now := time.Now()
		ev.Timestamp = now
		ev.Ts = uint64(now.UnixMilli())
	}
	return ev
}

func parseQuery(q string) AnalyticsEvent { return parseQueryBytes([]byte(q)) }
