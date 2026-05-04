# Requirements: HA-001, HA-003
FROM ghcr.io/home-assistant/base:latest

ARG BUILD_ARCH
ARG BUILD_VERSION

LABEL \
  io.hass.name="Smart EV Charging Optimizer" \
  io.hass.description="Plans EV charging from Tibber electricity prices." \
  io.hass.version="${BUILD_VERSION}" \
  io.hass.type="app" \
  io.hass.arch="${BUILD_ARCH}"

RUN apk add --no-cache nodejs npm

WORKDIR /app

COPY package.json tsconfig.json vitest.config.ts ./
COPY src ./src
COPY run.sh /run.sh

RUN npm install && npm run build && chmod a+x /run.sh

CMD ["/run.sh"]
