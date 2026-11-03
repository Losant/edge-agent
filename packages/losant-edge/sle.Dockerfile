FROM registry.suse.com/bci/bci-base:16.0 AS builder
ENV PNPM_HOME="/pnpm"
ENV PATH="$PNPM_HOME:$PATH"
ENV npm_config_python=python3
ENV CC=gcc
ENV CXX=g++

RUN zypper refresh && zypper up -y --no-recommends \
  && zypper install -y --no-recommends \
  gcc \
  gcc-c++ \
  make \
  python3 \
  xz \
  libxml2-tools

RUN mkdir -p /var/build && mkdir -p /var/output
WORKDIR /var/build

COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .pnpmfile.cjs ./
COPY ./patches ./patches
COPY ./packages/losant-nodejs-utils ./packages/losant-nodejs-utils
COPY ./packages/losant-handlebars ./packages/losant-handlebars
COPY ./packages/losant-nodes ./packages/losant-nodes
COPY ./packages/losant-sandcastle ./packages/losant-sandcastle
COPY ./packages/losant-edge ./packages/losant-edge
COPY LICENSE ./packages/losant-edge
ARG TARGETARCH
COPY ./scripts ./scripts

RUN NODE_VERSION=$(python3 -c "import json; print(json.load(open('./package.json'))['engines']['node'])") && \
    ARCH=$(uname -m | sed 's/x86_64/x64/;s/aarch64/arm64/') && \
    curl -fsSL https://nodejs.org/dist/v${NODE_VERSION}/node-v${NODE_VERSION}-linux-${ARCH}.tar.xz \
    | tar -xJ -C /usr/local --strip-components=1

RUN corepack install && corepack enable
ENV PNPM_CONFIG_PYTHON_EXECUTABLE=/usr/bin/python3
RUN pnpm deploy \
  --filter-prod='./packages/losant-edge' \
  --os=linux \
  --cpu=$([ "$TARGETARCH" = "arm64" ] && echo arm64 || echo x64) \
  --libc=glibc \
  --prod --frozen-lockfile /deploy

# install modules needed for post-build scripts and run them
WORKDIR /var/build/scripts
RUN pnpm install --prod --frozen-lockfile
RUN node third-party-licenses.js /deploy

WORKDIR /deploy
RUN pnpm rebuild classic-level
RUN rm -rf pnpm-lock.yaml pnpm-workspace.yaml scripts

# ok, now that things are built and installed, lets make the actual docker image
FROM registry.suse.com/bci/bci-base:16.0
ARG ROLLBAR_KEY
VOLUME /data
EXPOSE $WEBSERVER_PORT_DEFAULT
ENTRYPOINT ["/tini", "-g", "--"]
CMD ["/opt/losant/losant-edge-agent"]

HEALTHCHECK CMD curl --no-progress-meter --fail-with-body http://127.0.0.1:$HEALTH_CHECK_PORT_DEFAULT/ || exit 1

ENV CONF_PATH_DEFAULT="/etc/losant/losant-edge-agent-config.toml" \
  STORE_PATH_DEFAULT="/data/losant-edge-agent-store.db" \
  WORKFLOW_DIRECTORY_DEFAULT="/data/workflows" \
  WEBSERVER_PORT_DEFAULT="8080" \
  HEALTH_CHECK_PORT_DEFAULT="8010" \
  NODE_NO_WARNINGS="1" \
  NODE_OPTIONS="--no-network-family-autoselection --openssl-legacy-provider --dns-result-order=ipv4first" \
  NODE_EXTRA_CA_CERTS="/etc/ssl/certs/ca-certificates.crt" \
  NODEOPCUA_LOG_LEVEL="0" \
  SNOWFLAKE_DISABLE_PLATFORM_DETECTION="true" \
  PATH="/home/losant/.config/npm/bin:${PATH}" \
  NODE_PATH="/home/losant/.config/yarn/global/node_modules:/home/losant/.config/npm/lib/node_modules:${NODE_PATH}" \
  ROLLBAR_KEY="${ROLLBAR_KEY}"

# http://label-schema.org/rc1/
LABEL maintainer="support@losant.com" \
  org.label-schema.schema-version="2.7.0" \
  org.label-schema.name="Losant Gateway Edge Agent" \
  org.label-schema.url="https://www.losant.com" \
  org.label-schema.vendor="Losant IoT Inc." \
  org.label-schema.description="The Losant Gateway Edge Agent is a service that’s installed on every Losant Edge Compute device to manage the deployment and execution of edge workflows."

RUN zypper refresh
RUN zypper up -y --no-recommends
ENV TINI_VERSION=v0.19.0
ADD https://github.com/krallin/tini/releases/download/${TINI_VERSION}/tini-static /tini
RUN chmod +x /tini
RUN groupadd -r losant
RUN useradd -u 999 -r -m -g losant losant
RUN update-ca-certificates
RUN mkdir -p /etc/losant
RUN mkdir -p /data
RUN chown -R losant:losant /data

COPY --from=builder /usr/local /usr/local
COPY --from=builder --chown=losant:losant /deploy /opt/losant

RUN mv /opt/losant/losant-edge-agent-config.example.toml $CONF_PATH_DEFAULT \
  && sed -i 's@./losant-edge-agent-store.db@'$STORE_PATH_DEFAULT'@' $CONF_PATH_DEFAULT

USER losant
RUN npm config set prefix /home/losant/.config/npm
