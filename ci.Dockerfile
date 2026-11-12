FROM node:26.13.0-alpine3.24

ENV CI="true" \
  PNPM_HOME="/pnpm"

ENV PATH="$PNPM_HOME/bin:$PATH"
ENV PNPM_VERSION=12.16.1

RUN npx get-pnpm

RUN mkdir /root/.config \
  && apk upgrade -U \
  && apk add --no-cache curl tini git openssh make gcc g++ bash python3 py3-setuptools \
    linux-headers openssl libxml2-utils build-base musl-dev openssl-dev socat
