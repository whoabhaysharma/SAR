FROM golang:1.22-alpine AS build
WORKDIR /app
COPY go.mod ./
RUN go mod download 2>/dev/null || true
COPY . .
RUN CGO_ENABLED=0 GOOS=linux go build -ldflags="-s -w" -o /analytics-server .

FROM alpine:3.19
RUN apk --no-cache add ca-certificates
WORKDIR /app
COPY --from=build /analytics-server .
COPY public/ ./public/
EXPOSE 8080
CMD ["./analytics-server"]
