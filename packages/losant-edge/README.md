# Losant Gateway Edge Agent

The Losant Gateway Edge Agent is a service that’s installed on every Losant Edge Compute device to manage the deployment and execution of edge workflows.

## Quick reference

- **Where to get help:** [Losant Documentation](https://docs.losant.com/) | [Losant Forums](https://forums.losant.com/)
- **Maintained by:** [Losant](https://www.losant.com)

## Building the Docker Image

`ROLLBAR_KEY` is an optional build arg (`ARG ROLLBAR_KEY` in each Dockerfile), passed with `docker build --build-arg ROLLBAR_KEY=<key> ...`. Losant's own published images set it so the agent can report errors to Rollbar. If you build the image yourself without supplying one, the agent just runs with Rollbar reporting disabled — no key required, nothing to configure.

## Sample Usage

### Minimum Required Options

The only three configuration values needed to start the edge agent are Losant Device ID and an Access Key/Secret pair to authenticate with Losant.

```console
./losant-edge-agent \
  --device-id <your-device-id> \
  --access-key <your-access-key> \
  --access-secret <your-access-secret>
```

### With Custom Configuration File

The above configuration options (and many others) can also be set using a [toml](https://github.com/toml-lang/toml) configuration file. See `losant-edge-agent-config.example.toml` for an example configuration file. By default, the edge agent will look for a configuration file named `losant-edge-agent-config.toml` in the same directory as the edge agent, but you can also tell the agent to look elsewhere:

```console
./losant-edge-agent \
  --conf-path /my/custom/edge-configuration.toml
```

### With Custom Storage Path

The edge agent uses local persistent storage to remember the workflows it should run, any custom storage values for a workflow, and any MQTT messages that it has not been able to send (for example, due to lost internet connectivity). By default that persistent storage will be located at `losant-edge-agent-store.db` in the same directory as the edge agent, but you can also tell the agent to use a different path:

```console
./losant-edge-agent \
  --device-id <your-device-id> \
  --access-key <your-access-key> \
  --access-secret <your-access-secret> \
  --store-path /my/custom/agent-storage-directory
```

### With Custom Web Server Options

By default, the edge agent runs a web server to listen for HTTP requests, which can trigger for edge workflows. It runs on port 8080 by default. You can configure the port, the bind address, basic auth, and SSL for the web server:

```console
./losant-edge-agent \
  --device-id <your-device-id> \
  --access-key <your-access-key> \
  --access-secret <your-access-secret> \
  --webserver-address 127.0.0.1 \
  --webserver-port 443 \
  --webserver-username myCustomUsername \
  --webserver-password myCustomPassword \
  --webserver-ssl-key-path /my/custom/agent-ssl.key \
  --webserver-ssl-cert-path /my/custom/agent-ssl.crt
```

## All Available Options

Most options can be set through command line flags, the configuration file, or environment variables. You can see the details for each option below this table. If an option is set multiple ways, the command line flag is used first, followed by the environment variable, and then finally falling back to the configuration file.

You can also see these options by executing the edge agent with the -h flag.

```console
./losant-edge-agent -h
```
  
| Command Line Flag                                                                        | Environment Variable             | Configuration File Option              |
| ---------------------------------------------------------------------------------------- | -------------------------------- | -------------------------------------- |
| [`-f <path>`](#cli-conf-path) or [`--conf-path <path>`](#cli-conf-path)                  | `CONF_PATH`                      | N/A                                    |
| [`--device-id <your-device-id>`](#cli-device-id)                                         | `DEVICE_ID`                      | `gateway.id`                           |
| [`--access-key <your-access-key>`](#cli-access-key)                                      | `ACCESS_KEY`                     | `gateway.key`                          |
| [`--access-secret <your-access-secret>`](#cli-access-secret)                             | `ACCESS_SECRET`                  | `gateway.secret`                       |
| [`--logger-out <destination>`](#cli-logger-out)                                          | `LOGGER_OUT`                     | `logger.out`                           |
| [`--logger-level <level>`](#cli-logger-level)                                            | `LOGGER_LEVEL`                   | `logger.level`                         |
| [`--store-path <path>`](#cli-store-path)                                                 | `STORE_PATH`                     | `store.path`                           |
| [`--workflow-directory <path>`](#cli-workflow-directory)                                 | `WORKFLOW_DIRECTORY`             | `workflow.directory`                   |
| [`--udp-address <ip-address>`](#cli-udp-address)                                         | `UDP_ADDRESS`                    | `udp.address`                          |
| [`--queue-offline-messages <true,false>`](#cli-queue-offline-messages)                   | `QUEUE_OFFLINE_MESSAGES`         | `gateway.queueOfflineMessages`         |
| [`--subscribe-to-peripheral-updates <true,false,floating,peripheral>`](#cli-subscribe-to-peripheral-updates) | `SUBSCRIBE_TO_PERIPHERAL_UPDATES`| `gateway.subscribeToPeripheralUpdates` |
| [`--webserver-enabled <true,false>`](#cli-webserver-enabled)                             | `WEBSERVER_ENABLED`              | `webserver.enabled`                    |
| [`--webserver-port <port>`](#cli-webserver-port)                                         | `WEBSERVER_PORT`                 | `webserver.port`                       |
| [`--webserver-address <ip-address>`](#cli-webserver-address)                             | `WEBSERVER_ADDRESS`              | `webserver.address`                    |
| [`--webserver-username <username>`](#cli-webserver-username)                             | `WEBSERVER_USERNAME`             | `webserver.username`                   |
| [`--webserver-password <password>`](#cli-webserver-password)                             | `WEBSERVER_PASSWORD`             | `webserver.password`                   |
| [`--webserver-ssl-key-path <path>`](#cli-webserver-ssl-key-path)                         | `WEBSERVER_SSL_KEY_PATH`         | `webserver.ssl.keyPath`                |
| [`--webserver-ssl-cert-path <path>`](#cli-webserver-ssl-cert-path)                       | `WEBSERVER_SSL_CERT_PATH`        | `webserver.ssl.certificatePath`        |
| [`--webserver-ssl-bundle-path <path>`](#cli-webserver-ssl-bundle-path)                   | `WEBSERVER_SSL_BUNDLE_PATH`      | `webserver.ssl.bundlePath`             |
| [`--local-broker-enabled <true,false>`](#cli-local-broker-enabled)                       | `LOCAL_BROKER_ENABLED`           | `localBroker.enabled`                  |
| [`--local-broker-port <port>`](#cli-local-broker-port)                                   | `LOCAL_BROKER_PORT`              | `localBroker.port`                     |
| [`--local-broker-address <ip-address>`](#cli-local-broker-address)                       | `LOCAL_BROKER_ADDRESS`           | `localBroker.address`                  |
| [`--local-broker-username <username>`](#cli-local-broker-username)                       | `LOCAL_BROKER_USERNAME`          | `localBroker.username`                 |
| [`--local-broker-password <password>`](#cli-local-broker-password)                       | `LOCAL_BROKER_PASSWORD`          | `localBroker.password`                 |
| [`--local-broker-ssl-key-path <path>`](#cli-local-broker-ssl-key-path)                   | `LOCAL_BROKER_SSL_KEY_PATH`      | `localBroker.ssl.keyPath`              |
| [`--local-broker-ssl-cert-path <path>`](#cli-local-broker-ssl-cert-path)                 | `LOCAL_BROKER_SSL_CERT_PATH`     | `localBroker.ssl.certificatePath`      |
| [`--local-broker-ssl-bundle-path <path>`](#cli-local-broker-ssl-bundle-path)             | `LOCAL_BROKER_SSL_BUNDLE_PATH`   | `localBroker.ssl.bundlePath`           |
| [`--otel-reporting-enabled <true,false>`](#cli-otel-reporting-enabled)                   | `OTEL_REPORTING_ENABLED`         | `otelReporting.enabled`                |
| [`-V`](#cli-version) or [`--version`](#cli-version)                                      | N/A                              | N/A                                    |
| [`-h`](#cli-h)                                                                           | N/A                              | N/A                                    |

### Option Details

- <a name="cli-conf-path"></a>`-f <path>` or `--conf-path <path>`:  
  Set the path to the agent configuration file. Defaults to the file `losant-edge-agent-config.toml` in the same directory as the executable. See the file `losant-edge-agent-config.example.toml` for an example configuration file.
- <a name="cli-device-id"></a>`--device-id <your-device-id>`: **REQUIRED**  
  Losant Device ID of the agent. This should correspond to the ID of an [Edge Compute Device](https://docs.losant.com/devices/overview/) in your Losant account.
- <a name="cli-access-key"></a>`--access-key <your-access-key>`: **REQUIRED**  
  Losant Access Key to use for the agent. This should be the key part of a [Device Access Key](https://docs.losant.com/devices/access-keys/) that can be used for the given Device ID.
- <a name="cli-access-secret"></a>`--access-secret <your-access-secret>`: **REQUIRED**
  Losant Access Secret to use for the agent. This should be the secret part of a [Device Access Key](https://docs.losant.com/devices/access-keys/) that can be used for the given Device ID.
- <a name="cli-logger-out"></a>`--logger-out <destination>`:  
  Desired destination for logging. Either `console` or a file path. Defaults to `console`.
- <a name="cli-logger-level"></a>`--logger-level <level>`:  
  Desired logging level. One of `error`, `warn`, `info`, or `verbose`. Defaults to  `info`.
- <a name="cli-store-path"></a>`--store-path <path>`:  
  Path to the persistent store directory for the agent. Defaults to `losant-edge-agent-store.db` in the same directory as the executable.
- <a name="cli-workflow-directory"></a>`--workflow-directory <path>`:  
  Path to the directory containing any on disk workflows to load and run. Defaults to `workflows` in the same directory as the executable.
- <a name="cli-udp-address"></a>`--udp-address <ip-address>`:  
  Address that the agent should bind to for any open UDP Trigger ports. Defaults to `0.0.0.0`, which means to bind to all interfaces on the machine.
- <a name="cli-queue-offline-messages"></a>`--queue-offline-messages <true,false>`:  
  If the agent should queue messages while offline to send later. Defaults to true.
- <a name="cli-offline-message-replay-order"></a>`--offline-message-replay-order <oldestFirst,newestFirst>`:  
  In what order the agent should send any offline queued messages when it reconnects. Defaults to oldestFirst.
- <a name="cli-subscribe-to-peripheral-updates"></a>`--subscribe-to-peripheral-updates <true,false,floating,peripheral>`:  
  If the agent should subscribe to peripheral update topics. One of `true` (subscribe to all updates), `false` (subscribe to no updates), `floating` (subscribe to only floating peripheral updates), or `peripheral` (subscribe to only peripheral updates that have this device as their gateway). Defaults to `true`.
- <a name="cli-webserver-enabled"></a>`--webserver-enabled <true,false>`:  
  Whether the agent web server should be enabled. Default is enabled (`true`).
- <a name="cli-webserver-port"></a>`--webserver-port <port>`:  
  Port the agent should run its web server on. Defaults to `8080`.
- <a name="cli-webserver-address"></a>`--webserver-address <ip-address>`:  
  Address that the agent's web server should bind to. Defaults to `0.0.0.0`, which means to bind to all interfaces on the machine.
- <a name="cli-webserver-username"></a>`--webserver-username <username>`:  
  Username to use to authenticate requests to the agent's web server (using basic auth). Default is no username. If neither a username or a password is configured, no authentication is needed for requests against the agent's web server.
- <a name="cli-webserver-password"></a>`--webserver-password <password>`:  
  Password to use to authenticate requests to the agent's web server (using basic auth). Default is no password. If neither a username or a password is configured, no authentication is needed for requests against the agent's web server.
- <a name="cli-webserver-ssl-key-path"></a>`--webserver-ssl-key-path <path>`:  
  Path to the SSL key to use for the agent's web server. Default is no path (and so no SSL for the web server). If an SSL key is provided, an SSL certificate must be provided as well. The environment variable `WEBSERVER_SSL_KEY` can also be used to set the contents of the key directly (instead of reading from a file).
- <a name="cli-webserver-ssl-cert-path"></a>`--webserver-ssl-cert-path <path>`:  
  Path to the SSL certificate to use for the agent's web server. Default is no path (and so no SSL for the web server). If an SSL certificate is provided, an SSL key must be provided as well. The environment variable `WEBSERVER_SSL_CERT` can also be used to set the contents of the certificate directly (instead of reading from a file).
- <a name="cli-webserver-ssl-bundle-path"></a>`--webserver-ssl-bundle-path <path>`:  
  Path to the SSL certificate bundle to use for the agent's web server. Default is no path, and it is not required for SSL. If no SSL certificate or key is provided, this option is ignored. The environment variable `WEBSERVER_SSL_BUNDLE` can also be used to set the contents of the bundle directly (instead of reading from a file).
- <a name="cli-local-broker-enabled"></a>`--local-broker-enabled <true,false>`:  
  Whether the agent local broker should be enabled. Default is enabled (`true`).
- <a name="cli-local-broker-port"></a>`--local-broker-port <port>`:  
  Port the agent should run its local broker on. Defaults to `1883`.
- <a name="cli-local-broker-address"></a>`--local-broker-address <ip-address>`:  
  Address that the agent's local broker should bind to. Defaults to `0.0.0.0`, which means to bind to all interfaces on the machine.
- <a name="cli-local-broker-username"></a>`--local-broker-username <username>`:  
  Username to use to authenticate requests to the agent's local broker (using basic auth). Default is no username. If neither a username or a password is configured, no authentication is needed for requests against the agent's local broker.
- <a name="cli-local-broker-password"></a>`--local-broker-password <password>`:  
  Password to use to authenticate requests to the agent's local broker (using basic auth). Default is no password. If neither a username or a password is configured, no authentication is needed for requests against the agent's local broker.
- <a name="cli-local-broker-ssl-key-path"></a>`--local-broker-ssl-key-path <path>`:  
  Path to the SSL key to use for the agent's local broker. Default is no path (and so no SSL for the local broker). If an SSL key is provided, an SSL certificate must be provided as well. The environment variable `LOCAL_BROKER_SSL_KEY` can also be used to set the contents of the key directly (instead of reading from a file).
- <a name="cli-local-broker-ssl-cert-path"></a>`--local-broker-ssl-cert-path <path>`:  
  Path to the SSL certificate to use for the agent's local broker. Default is no path (and so no SSL for the local broker). If an SSL certificate is provided, an SSL key must be provided as well. The environment variable `LOCAL_BROKER_SSL_CERT` can also be used to set the contents of the certificate directly (instead of reading from a file).
- <a name="cli-local-broker-ssl-bundle-path"></a>`--local-broker-ssl-bundle-path <path>`:  
  Path to the SSL certificate bundle to use for the agent's local broker. Default is no path, and it is not required for SSL. If no SSL certificate or key is provided, this option is ignored. The environment variable `LOCAL_BROKER_SSL_BUNDLE` can also be used to set the contents of the bundle directly (instead of reading from a file).
- <a name="cli-otel-reporting-enabled"></a>`--otel-reporting-enabled <true,false>`:  
  If the agent should automatically report container metrics (CPU, memory, uptime) to the configured OpenTelemetry collector. Requires `otlpCollector` to be configured. Default is `false`.
- <a name="cli-version"></a>`-V, --version`:  
  Outputs the version of the Losant Gateway Edge Agent.
- <a name="cli-h"></a>`-h`:  
  Outputs help on the available CLI options.

<br/>

*****

## License

Copyright (c) 2026 SUSE

Licensed under the Apache License, Version 2.0 (the "License");
you may not use this file except in compliance with the License.
You may obtain a copy of the License at

[http://www.apache.org/licenses/LICENSE-2.0](http://www.apache.org/licenses/LICENSE-2.0)

Unless required by applicable law or agreed to in writing, software
distributed under the License is distributed on an "AS IS" BASIS,
WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
See the License for the specific language governing permissions and
limitations under the License.

<https://www.losant.com>
