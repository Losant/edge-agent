FROM node:24.22.1-trixie

ENV CI="true" \
  PNPM_HOME="/pnpm"

ENV PATH="$PNPM_HOME:$PATH"

RUN mkdir /root/.config \
  && apt-get update \
  && apt-get install -y --no-install-recommends curl tini git openssh-client make gcc g++ bash \
    python3 python3-setuptools build-essential libssl-dev libxml2-utils socat \
  && rm -rf /var/lib/apt/lists/*

# Installs the pnpm version pinned by packageManager in the root package.json.
# Running pnpm once fetches its binary now, so test runs don't download it.
COPY package.json /tmp/pnpm-version/package.json
RUN cd /tmp/pnpm-version && corepack install && corepack enable && pnpm --version && rm -rf /tmp/pnpm-version
