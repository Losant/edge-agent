export LOGGER_LEVEL_DEFAULT='error'
export MAX_FLOW_RUN_TIME=1000
export RAW_FUNCTION_DEFAULT_TIMEOUT=10000
export MAX_SERIAL_READY_TIME=1000
export SERIAL_START_WRITE_WAIT=10
export SERIAL_BYTE_WRITE_WAIT=1
export ROLLBAR_KEY=''
export MAX_EXTERNAL_CALL_TIME=10000
export WORKFLOW_DIRECTORY_DEFAULT=$PWD'/packages/losant-edge/test/__fixtures__/workflows'
export LOGGER_OUT_DEFAULT=$PWD'/packages/losant-edge/test/testing-workspace/logger/logger-spec-temp.log'
export NODE_ENV='test'
# this was changed for opcua
export DEBUG="${DEBUG:-''}"
# set at the minimum we allow
export MQTT_RECONNECT_INTERVAL=5000
export MQTT_RECONNECT_VARIABILITY=5000
export MQTT_CONNECT_TIMEOUT=5000
export TZ=UTC
export NODEOPCUA_LOG_LEVEL=0
export MOSQUITTO_HOST="${MOSQUITTO_HOST:-localhost}"
# snowflake-sdk >= 2.4.1 probes cloud metadata endpoints (169.254.169.254, metadata.google.internal)
# as a side effect of being imported. On a host where those answer (e.g. GCP CI), the aborted probe
# sockets crash node with a libuv assertion (uv__stream_destroy) before any test runs.
export SNOWFLAKE_DISABLE_PLATFORM_DETECTION=true

rm -rf packages/losant-edge/test/testing-workspace
mkdir packages/losant-edge/test/testing-workspace

pnpm mocha --require packages/losant-edge/test/common.js --timeout 15000 packages/losant-edge/test "$@"