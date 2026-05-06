# Requirements: HA-001, HA-003
FROM ghcr.io/home-assistant/base:latest

ARG BUILD_ARCH
ARG BUILD_VERSION

LABEL \
  io.hass.name="Smart EV Charging Optimizer" \
  io.hass.description="Plans EV charging with demo mode and planning-only safety." \
  io.hass.version="${BUILD_VERSION}" \
  io.hass.type="app" \
  io.hass.arch="${BUILD_ARCH}"

RUN apk add --no-cache nodejs npm

WORKDIR /app

COPY package.json package-lock.json tsconfig.json vitest.config.ts eslint.config.js ./
COPY src ./src
COPY public ./public
COPY run.sh /run.sh

RUN npm ci && npm run build && chmod a+x /run.sh

CMD ["/run.sh"]
