FROM node:24.22.1-alpine3.23

ENV CI="true" \
  PNPM_HOME="/pnpm"

ENV PATH="$PNPM_HOME:$PATH"

RUN mkdir /root/.config \
  && apk upgrade -U \
  && apk add --no-cache curl tini git openssh make gcc g++ bash python3 py3-setuptools \
    linux-headers openssl libxml2-utils build-base musl-dev openssl-dev socat

# Installs the pnpm version pinned by packageManager in the root package.json.
# Running pnpm once fetches its binary now, so test runs don't download it.
COPY package.json /tmp/pnpm-version/package.json
RUN cd /tmp/pnpm-version && corepack install && corepack enable && pnpm --version && rm -rf /tmp/pnpm-version
