FROM node:26.13.0-trixie

ENV CI="true" \
  PNPM_HOME="/pnpm"

ENV PATH="$PNPM_HOME/bin:$PATH"
ENV PNPM_VERSION=12.16.1

RUN npx get-pnpm

RUN mkdir /root/.config \
  && apt-get update \
  && apt-get install -y --no-install-recommends curl tini git openssh-client make gcc g++ bash \
    python3 python3-setuptools build-essential libssl-dev libxml2-utils socat \
  && rm -rf /var/lib/apt/lists/*

