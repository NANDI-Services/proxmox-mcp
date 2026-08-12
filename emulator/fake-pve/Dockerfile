FROM node:20-alpine

# openssl generates the throwaway TLS cert at container start; nothing is baked
# into the image and no key is ever committed.
RUN apk add --no-cache openssl curl

WORKDIR /app
COPY . /app/fake-pve/

ENV PVE_FAKE_CERT_DIR=/tmp/pve-emulator-certs \
    PVE_FAKE_PORT=8006 \
    PVE_FAKE_CONTROL_PORT=8765 \
    PVE_FAKE_HOST=0.0.0.0

EXPOSE 8006 8765

HEALTHCHECK --interval=2s --timeout=3s --retries=15 --start-period=2s \
  CMD curl -fsS http://127.0.0.1:8765/_control/health || exit 1

CMD ["node", "/app/fake-pve/main.mjs"]
