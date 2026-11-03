<!-- markdownlint-disable MD002 -->

## Losant Gateway Edge Agent

The Losant Gateway Edge Agent is a service that’s installed on every Losant Edge Compute device to manage the deployment and execution of edge workflows.

### Supported Tags

- `2.7.0`, `2.7`, `2`, `latest`
- `2.7.0-amd64`, `2.7-amd64`, `2-amd64`, `latest-amd64`
- `2.7.0-arm64`, `2.7-arm64`, `2-arm64`, `latest-arm64`

- `2.7.0-alpine`, `2.7-alpine`, `2-alpine`, `latest-alpine`
- `2.7.0-alpine-amd64`, `2.7-alpine-amd64`, `2-alpine-amd64`, `latest-alpine-amd64`
- `2.7.0-alpine-arm64`, `2.7-alpine-arm64`, `2-alpine-arm64`, `latest-alpine-arm64`

### Quick reference

- **Where to get help:**  
  [Losant Gateway Edge Agent Installation Tutorial](https://docs.losant.com/edge-compute/gateway-edge-agent/installation/)  
  [Losant Gateway Edge Agent Usage Tutorial](https://docs.losant.com/edge-compute/gateway-edge-agent/usage/)  
  [Losant Documentation](https://docs.losant.com/)  
  [Losant Forums](https://forums.losant.com/)

- **Maintained by:**  
  [Losant](https://www.losant.com)

- **Supported architectures:**  
  `amd64`, `arm64`

### How to use this image

For help installing Docker and pulling this image, check out the [installation instructions](https://docs.losant.com/edge-compute/gateway-edge-agent/installation/). You can also find a quick run down on using [Docker commands](https://docs.losant.com/edge-compute/gateway-edge-agent/usage/#managing-the-gateway-edge-agent) to [manage the Agent](https://docs.losant.com/edge-compute/gateway-edge-agent/usage/#agent-management-example).

#### Start a Losant Gateway Edge Agent instance ([docs](https://docs.losant.com/edge-compute/gateway-edge-agent/usage/#running-with-environment-config))

```console
docker run -d --name myAgent \
  -e 'DEVICE_ID=<your-device-id>' \
  -e 'ACCESS_KEY=<your-access-key>' \
  -e 'ACCESS_SECRET=<your-access-secret>' \
  losant/edge-agent
```

&nbsp;

#### Start and mount in persistent storage ([docs](https://docs.losant.com/edge-compute/gateway-edge-agent/usage/#running-with-environment-config))

```console
docker run -d --name myAgent \
  -e 'DEVICE_ID=<your-device-id>' \
  -e 'ACCESS_KEY=<your-access-key>' \
  -e 'ACCESS_SECRET=<your-access-secret>' \
  -v /docker/host/dir:/data \
  losant/edge-agent
```

&nbsp;
By default, persistent data is stored in the `VOLUME /data`, which can be used with `--volumes-from some-volume-container` or `-v /docker/host/dir:/data` (see [docs.docker volumes](https://docs.docker.com/storage/volumes/)).
&nbsp;

#### Start and expose HTTP endpoint for triggering ([docs](https://docs.losant.com/edge-compute/gateway-edge-agent/usage/#web-server-http-request-trigger--http-response-node))

```console
docker run -d --name myAgent \
  -e 'DEVICE_ID=<your-device-id>' \
  -e 'ACCESS_KEY=<your-access-key>' \
  -e 'ACCESS_SECRET=<your-access-secret>' \
  -p <host port>:8080 \
  losant/edge-agent
```

&nbsp;
By default, the Losant Agent exposes HTTP endpoint at port 8080, which can be exposed to a local host port using `-p` (see [exposing ports](https://docs.docker.com/engine/reference/commandline/run/#publish-or-expose-port--p-expose)).
&nbsp;

#### If you want to use your own agent config file ([docs](https://docs.losant.com/edge-compute/gateway-edge-agent/usage/#running-with-a-configuration-file))

You can mount in your own config file like the following:

```console
docker run -d --name myAgent \
  -v /host/dir/custom-config.toml:/etc/losant/losant-edge-agent-config.toml \
  losant/edge-agent
```

&nbsp;
The file at `/etc/losant/losant-edge-agent-config.toml` is an example agent config file; it is a great starting place for creating your own agent config file.
&nbsp;

### All Available Options

Most options can be set through environment variables (most common for Docker), the configuration file, or command line flags. You can see the details for each option below this table. If an option is set multiple ways, the command line flag is used first, followed by the environment variable, and then finally falling back to the configuration file.

| Environment Variable               | Configuration File Option              | Command Line Flag                                |
| ---------------------------------- | -------------------------------------- | ------------------------------------------------ |
| `CONF_PATH`                        | N/A                                    | `-f <path>` or `--conf-path <path>`              |
| `DEVICE_ID`                        | `gateway.id`                           | `--device-id <your-device-id>`                   |
| `ACCESS_KEY`                       | `gateway.key`                          | `--access-key <your-access-key>`                 |
| `ACCESS_SECRET`                    | `gateway.secret`                       | `--access-secret <your-access-secret>`           |
| `LOGGER_OUT`                       | `logger.out`                           | `--logger-out <destination>`                     |
| `LOGGER_LEVEL`                     | `logger.level`                         | `--logger-level <level>`                         |
| `STORE_PATH`                       | `store.path`                           | `--store-path <path>`                            |
| `BROKER_HOST`                      | `gateway.host`                         | N/A                                              |
| `BROKER_PROTOCOL`                  | `gateway.protocol`                     | N/A                                              |
| `BROKER_CLIENT_SSL_KEY_PATH`       | `gateway.clientSsl.keyPath`            | N/A                                              |
| `BROKER_CLIENT_SSL_KEY`            | N/A                                    | N/A                                              |
| `BROKER_CLIENT_SSL_CERT_PATH`      | `gateway.clientSsl.certificatePath`    | N/A                                              |
| `BROKER_CLIENT_SSL_CERT`           | N/A                                    | N/A                                              |
| `WORKFLOW_DIRECTORY`               | `workflow.directory`                   | `--workflow-directory <path>`                    |
| `UDP_ADDRESS`                      | `udp.address`                          | `--udp-address <ip-address>`                     |
| `QUEUE_OFFLINE_MESSAGES`           | `gateway.queueOfflineMessages`         | `--queue-offline-messages <true,false>`          |
| `OFFLINE_MESSAGE_REPLAY_ORDER`     | `gateway.offlineMessageReplayOrder`    | `--offline-message-replay-order <oldestFirst,newestFirst>` |
| `SUBSCRIBE_TO_PERIPHERAL_UPDATES`  | `gateway.subscribeToPeripheralUpdates` | `--subscribe-to-peripheral-updates <true,false,floating,peripheral>` |
| `WEBSERVER_ENABLED`                | `webserver.enabled`                    | `--webserver-enabled <true,false>`               |
| `WEBSERVER_PORT`                   | `webserver.port`                       | `--webserver-port <port>`                        |
| `WEBSERVER_ADDRESS`                | `webserver.address`                    | `--webserver-address <ip-address>`               |
| `WEBSERVER_USERNAME`               | `webserver.username`                   | `--webserver-username <username>`                |
| `WEBSERVER_PASSWORD`               | `webserver.password`                   | `--webserver-password <password>`                |
| `WEBSERVER_SSL_KEY_PATH`           | `webserver.ssl.keyPath`                | `--webserver-ssl-key-path <path>`                |
| `WEBSERVER_SSL_KEY`                | N/A                                    | N/A                                              |
| `WEBSERVER_SSL_CERT_PATH`          | `webserver.ssl.certificatePath`        | `--webserver-ssl-cert-path <path>`               |
| `WEBSERVER_SSL_CERT`               | N/A                                    | N/A                                              |
| `WEBSERVER_SSL_BUNDLE_PATH`        | `webserver.ssl.bundlePath`             | `--webserver-ssl-bundle-path <path>`             |
| `WEBSERVER_SSL_BUNDLE`             | N/A                                    | N/A                                              |
| `LOCAL_BROKER_ENABLED`             | `localBroker.enabled`                  | `--local-broker-enabled <true,false>`            |
| `LOCAL_BROKER_PORT`                | `localBroker.port`                     | `--local-broker-port <port>`                     |
| `LOCAL_BROKER_ADDRESS`             | `localBroker.address`                  | `--local-broker-address <address>`               |
| `LOCAL_BROKER_USERNAME`            | `localBroker.username`                 | `--local-broker-username <username>`             |
| `LOCAL_BROKER_PASSWORD`            | `localBroker.password`                 | `--local-broker-password <password>`             |
| `LOCAL_BROKER_SSL_KEY_PATH`        | `localBroker.ssl.keyPath`              | `--local-broker-key-path <path>`                 |
| `LOCAL_BROKER_SSL_KEY`             | N/A                                    | N/A                                              |
| `LOCAL_BROKER_SSL_CERT_PATH`       | `localBroker.ssl.certificatePath`      | `--local-broker-ssl-key-path <path>`             |
| `LOCAL_BROKER_SSL_CERT`            | N/A                                    | N/A                                              |
| `LOCAL_BROKER_SSL_BUNDLE_PATH`     | `localBroker.ssl.bundlePath`           | `--local-broker-ssl-cert-path <path>`            |
| `LOCAL_BROKER_SSL_BUNDLE`          | N/A                                    | `--local-broker-ssl-bundle-path <path>`          |
| `HEALTH_CHECK_ENABLED`             | `healthCheck.enabled`                  | N/A                                              |
| `HEALTH_CHECK_PORT`                | `healthCheck.port`                     | N/A                                              |
| `HEALTH_CHECK_ADDRESS`             | `healthCheck.address`                  | N/A                                              |
| `HEALTH_CHECK_OFFLINE_IS_UNHEALTHY`| `healthCheck.offlineIsUnhealthy`       | N/A                                              |
| `OTLP_COLLECTOR_URL`               | `otlpCollector.url`                    | N/A                                              |
| `OTLP_COLLECTOR_AUTH_TYPE`         | `otlpCollector.authType`               | N/A                                              |
| `OTLP_COLLECTOR_USERNAME`          | `otlpCollector.username`               | N/A                                              |
| `OTLP_COLLECTOR_PASSWORD`          | `otlpCollector.password`               | N/A                                              |
| `OTLP_COLLECTOR_BEARER_TOKEN`      | `otlpCollector.bearerToken`            | N/A                                              |
| `OTLP_COLLECTOR_CLIENT_CERT_PATH`  | `otlpCollector.clientCertPath`         | N/A                                              |
| `OTLP_COLLECTOR_CLIENT_KEY_PATH`   | `otlpCollector.clientKeyPath`          | N/A                                              |
| `OTLP_COLLECTOR_CA_CERT_PATH`      | `otlpCollector.caCertPath`             | N/A                                              |
| `OTLP_COLLECTOR_DISABLE_SSL_VERIFICATION` | `otlpCollector.disableSSLVerification` | N/A                                       |
| `OTLP_COLLECTOR_RESOURCE_ATTRIBUTES` | `otlpCollector.resourceAttributes`   | N/A                                              |
| `OTEL_REPORTING_ENABLED`           | `otelReporting.enabled`                | `--otel-reporting-enabled <true,false>`          |
| `OTEL_REPORTING_INTERVAL_SECONDS`  | `otelReporting.intervalSeconds`        | N/A                                              |
| N/A                                | N/A                                    | `-V` or `--version`                              |
| N/A                                | N/A                                    | `-h`                                             |

#### Option Details

- `CONF_PATH`:  
  Set the path to the agent configuration file. Defaults to the file `/etc/losant/losant-edge-agent-config.toml`, which is also the example configuration file.
- `DEVICE_ID`: **REQUIRED**  
  Losant Device ID of the agent. This should correspond to the ID of an [Edge Compute Device](https://docs.losant.com/devices/overview/) in your Losant account.
- `ACCESS_KEY`: **REQUIRED**  
  Losant Access Key to use for the agent. This should be the key part of a [Device Access Key](https://docs.losant.com/devices/access-keys/) that can be used for the given Device ID.
- `ACCESS_SECRET`: **REQUIRED**
  Losant Access Secret to use for the agent. This should be the secret part of a [Device Access Key](https://docs.losant.com/devices/access-keys/) that can be used for the given Device ID.
- `LOGGER_OUT`:  
  Desired destination for logging. Either `console` or a file path. Defaults to `console`.
- `LOGGER_LEVEL`:  
  Desired logging level. One of `error`, `warn`, `info`, or `verbose`. Defaults to  `info`.
- `STORE_PATH`:  
  Path to the persistent store directory for the agent. Defaults to `/data/losant-edge-agent-store.db`.
- `BROKER_HOST`:  
  Hostname of the broker for the agent to connect to. Defaults to `broker.losant.com`.
- `BROKER_PROTOCOL`:  
  Protocol to use when connecting to the broker. Defaults to `mqtts`.
- `BROKER_SSL_KEY_PATH`:  
  Path to the SSL key to use for client certificate authentication with the broker. Default is no path. If an SSL key is provided, an SSL certificate must be provided as well.
- `BROKER_SSL_KEY`:  
  The SSL key to use for client certificate authentication with the broker. You can use this to set the contents of the key directly, instead of reading it from a file. Default is no value. If an SSL key is provided, an SSL certificate must be provided as well. If this environment variable is set, it will be used instead of `BROKER_SSL_KEY_PATH`.
- `BROKER_SSL_CERT_PATH`:  
  Path to the SSL certificate to use for client certificate authentication with the broker. Default is no path. If an SSL certificate is provided, an SSL key must be provided as well.
- `BROKER_SSL_CERT`:  
  The SSL certificate to use for client certificate authentication with the broker. You can use this to set the contents of the certificate directly, instead of reading it from a file. Default is no value. If an SSL key is provided, an SSL certificate must be provided as well. If this environment variable is set, it will be used instead of `BROKER_SSL_CERT_PATH`.
- `WORKFLOW_DIRECTORY`:  
  Path to the directory containing any on disk workflows to load and run. Defaults to `/data/workflows`.
- `UDP_ADDRESS`:  
  Address that the agent should bind to for any open UDP Trigger ports. Defaults to `0.0.0.0`, which means to bind to all interfaces on the machine.
- `QUEUE_OFFLINE_MESSAGES`:  
  If the agent should queue messages while offline to send later. Defaults to true.
- `SUBSCRIBE_TO_PERIPHERAL_UPDATES`:  
  If the agent should subscribe to peripheral update topics. One of `true` (subscribe to all updates), `false` (subscribe to no updates), `floating` (subscribe to only floating peripheral updates), or `peripheral` (subscribe to only peripheral updates that have this device as their gateway). Defaults to `true`.
- `WEBSERVER_ENABLED`:  
  Whether the agent web server should be enabled. Default is enabled (`true`).
- `WEBSERVER_PORT`:  
  Port the agent should run its web server on. Defaults to `8080`.
- `WEBSERVER_ADDRESS`:  
  Address that the agent's web server should bind to. Defaults to `0.0.0.0`, which means to bind to all interfaces on the machine.
- `WEBSERVER_USERNAME`:  
  Username to use to authenticate requests to the agent's web server (using basic auth). Default is no username. If neither a username or a password is configured, no authentication is needed for requests against the agent's web server.
- `WEBSERVER_PASSWORD`:  
  Password to use to authenticate requests to the agent's web server (using basic auth). Default is no password. If neither a username or a password is configured, no authentication is needed for requests against the agent's web server.
- `WEBSERVER_SSL_KEY_PATH`:  
  Path to the SSL key to use for the agent's web server. Default is no path. If an SSL key is provided, an SSL certificate must be provided as well.
- `WEBSERVER_SSL_KEY`:  
  The SSL key to use for the agent's web server. You can use this to set the contents of the key directly, instead of reading it from a file. Default is no value. If an SSL key is provided, an SSL certificate must be provided as well. If this environment variable is set, it will be used instead of `WEBSERVER_SSL_KEY_PATH`.
- `WEBSERVER_SSL_CERT_PATH`:  
  Path to the SSL certificate to use for the agent's web server. Default is no path. If an SSL certificate is provided, an SSL key must be provided as well.
- `WEBSERVER_SSL_CERT`:  
  The SSL certificate to use for the agent's web server. You can use this to set the contents of the certificate directly, instead of reading it from a file. Default is no value. If an SSL key is provided, an SSL certificate must be provided as well. If this environment variable is set, it will be used instead of `WEBSERVER_SSL_CERT_PATH`.
- `WEBSERVER_SSL_BUNDLE_PATH`:  
  Path to the SSL certificate bundle to use for the agent's web server. Default is no path, and it is not required for SSL. If no SSL certificate or key is provided, this option is ignored.
- `WEBSERVER_SSL_BUNDLE`:  
  The SSL bundle to use for the agent's web server. You can use this to set the contents of the bundle directly, instead of reading it from a file. Default is no value.  If no SSL certificate or key is provided, this option is ignored. If this environment variable is set, it will be used instead of `WEBSERVER_SSL_BUNDLE_PATH`.
- `LOCAL_BROKER_ENABLED`:  
  Whether the agent local broker should be enabled. Default is disabled (`false`).
- `LOCAL_BROKER_PORT`:  
  Port the agent should run its local broker on. Defaults to `1883`.
- `LOCAL_BROKER_ADDRESS`:  
  Address that the agent's local broker should bind to. Defaults to `0.0.0.0`, which means to bind to all interfaces on the machine.
- `LOCAL_BROKER_USERNAME`:  
  Username to use to authenticate client connections to the agent's local broker. Default is no username. If neither a username or a password is configured, no authentication is needed for connections to the agent's local broker.
- `LOCAL_BROKER_PASSWORD`:  
  Password to use to authenticate client connections to the agent's local broker. Default is no password. If neither a username or a password is configured, no authentication is needed for connections to the agent's local broker.
- `LOCAL_BROKER_SSL_KEY_PATH`:  
  Path to the SSL key to use for the agent's local broker. Default is no path. If an SSL key is provided, an SSL certificate must be provided as well.
- `LOCAL_BROKER_SSL_KEY`:  
  The SSL key to use for the agent's local broker. You can use this to set the contents of the key directly, instead of reading it from a file. Default is no value. If an SSL key is provided, an SSL certificate must be provided as well. If this environment variable is set, it will be used instead of `LOCAL_BROKER_SSL_KEY_PATH`.
- `LOCAL_BROKER_SSL_CERT_PATH`:  
  Path to the SSL certificate to use for the agent's local broker. Default is no path. If an SSL certificate is provided, an SSL key must be provided as well.
- `LOCAL_BROKER_SSL_CERT`:  
  The SSL certificate to use for the agent's local broker. You can use this to set the contents of the certificate directly, instead of reading it from a file. Default is no value. If an SSL key is provided, an SSL certificate must be provided as well. If this environment variable is set, it will be used instead of `LOCAL_BROKER_SSL_CERT_PATH`.
- `LOCAL_BROKER_SSL_BUNDLE_PATH`:  
  Path to the SSL certificate bundle to use for the agent's local broker. Default is no path, and it is not required for SSL. If no SSL certificate or key is provided, this option is ignored.
- `LOCAL_BROKER_SSL_BUNDLE`:  
  The SSL bundle to use for the agent's local broker. You can use this to set the contents of the bundle directly, instead of reading it from a file. Default is no value.  If no SSL certificate or key is provided, this option is ignored. If this environment variable is set, it will be used instead of `LOCAL_BROKER_SSL_BUNDLE_PATH`.
- `HEALTH_CHECK_ENABLED`:  
  Whether the agent health check endpoint should be enabled. Default is enabled (`true`).
- `HEALTH_CHECK_PORT`:  
  Port the agent should make the health check endpoint available on. Defaults to `8010`.
- `HEALTH_CHECK_ADDRESS`:  
  Address that the agent's health check endpoint should bind to. Defaults to `127.0.0.1`. Set to `0.0.0.0` to bind to all interfaces, which is required when the endpoint must be reachable from outside the container (for example, Kubernetes liveness/readiness probes).
- `HEALTH_CHECK_OFFLINE_IS_UNHEALTHY`:  
  If the agent should consider itself unhealthy when it is not online and connected to Losant. Default is `false`.
- `OTLP_COLLECTOR_URL`:  
  Base URL of the OpenTelemetry collector to export data to (for example `http://localhost:4318`). Default is not configured, which disables OpenTelemetry entirely.
- `OTLP_COLLECTOR_AUTH_TYPE`:  
  Authentication type to use for the OpenTelemetry collector. One of `none`, `basic`, `bearer`, or `clientCert`. Defaults to `none`.
- `OTLP_COLLECTOR_USERNAME`:  
  Username to use when `otlpCollector.authType` is `basic`.
- `OTLP_COLLECTOR_PASSWORD`:  
  Password to use when `otlpCollector.authType` is `basic`.
- `OTLP_COLLECTOR_BEARER_TOKEN`:  
  Bearer token to use when `otlpCollector.authType` is `bearer`.
- `OTLP_COLLECTOR_CLIENT_CERT_PATH`:  
  Path to the client SSL certificate to use when `otlpCollector.authType` is `clientCert`.
- `OTLP_COLLECTOR_CLIENT_KEY_PATH`:  
  Path to the client SSL key to use when `otlpCollector.authType` is `clientCert`.
- `OTLP_COLLECTOR_CA_CERT_PATH`:  
  Path to an optional custom CA certificate to trust when connecting to the collector.
- `OTLP_COLLECTOR_DISABLE_SSL_VERIFICATION`:  
  If SSL certificate verification should be skipped when connecting to the collector. Default is `false`.
- `OTLP_COLLECTOR_RESOURCE_ATTRIBUTES`:  
  A JSON object string of resource attributes to attach to all data exported to the collector (for example `{"service.name":"gea","fleet.id":42}`). Values must be strings, numbers, or booleans. Default is none. Can also be set as a table in the configuration file, `[otlpCollector.resourceAttributes]`.
- `OTEL_REPORTING_ENABLED`:  
  If the agent should automatically report container metrics (CPU, memory, uptime) to the configured OpenTelemetry collector. Requires `otlpCollector` to be configured. Default is `false`.
- `OTEL_REPORTING_INTERVAL_SECONDS`:  
  Interval, in seconds, at which to automatically report container metrics. Defaults to `30`.
- `-V, --version`:  
  Outputs the version of the Losant Gateway Edge Agent.
- `-h`:  
  Outputs help on the available CLI options.

*****

Copyright (c) 2026 SUSE

<https://www.losant.com>
