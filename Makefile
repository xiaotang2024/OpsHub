.PHONY: all build-all build-frontend build-backend test clean

all: build-all

build-frontend:
	npm run build --prefix web

build-backend:
	CGO_ENABLED=0 go build -ldflags="-s -w" -o bin/opshub ./cmd/opshub

build-all: build-frontend build-backend

test: build-frontend
	go test ./...
	npm test --prefix web

clean:
	rm -rf bin/ web/dist/
