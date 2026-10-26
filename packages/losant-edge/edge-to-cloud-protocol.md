# Losant Edge <-> Cloud Protocol

This document describes the communication protocol between the Losant Gateway Edge Agent and
the Losant Platform.

## Message Types

Messages are JSON encoded payloads that may or may not be compressed using gzip.

### Hello Message

* Topic: `losant/<deviceId>/fromAgent/hello`
* Publish: only the device `<deviceId>` (must be type `edgeCompute`)
* Subscribe: only the Losant Cloud

This message is sent when the edge agent connects to Losant.

Payload Format:

```json
{
  "service": "edgeWorkflowAgent",
  "version": "<edgeAgentVersion>"
}
```

The message will always contain both of these keys.

### Workflow Information Bundle

* Topic: `losant/<deviceId>/toAgent/flows`
* Publish: only the Losant Cloud
* Subscribe: only the device `<deviceId>` (must be type `edgeCompute`)

This message is sent in the following cases:

* In response to a `Hello` message (i.e., on device connect).
* When the workflows associated with a device are created/modified/removed.
* When information about the device itself changes.

There are two modes to this message - `partial` and `complete`. When an edge agent receives a `partial` message, the new workflow information is merged with the current information the agent knows about. When an edge agent receives a `complete` message, the workflow information on the agent is replaced.

Payload Format:

```json
{
  "time": <millisecond timestamp>,
  "mode": <"complete" or "partial">,
  "application": <Application Info Object>
  "device": <Device Info Object>
  "flows": {
    "<workflowId_1>": <null or Flow Info Object>,
    "<workflowId_2>": <null or Flow Info Object>,
    ...,
    "<workflowId_N>": <null or Flow Info Object>
  }
}
```

The message will always contain the `mode`, `time` and `flow` keys.  
When mode is `complete`, the message *will* contain the `application` and `device` keys.  
When mode is `partial`, the message *may* contain the `application` and `device` keys.  
When the `application` key is present, it will always contain a *complete* Application Info Object.  
When the `device` key is present, it will always contain a *complete* Device Info Object.

When mode is `complete`, the content of the `flows` key is always the exact set of workflows for the edge device. There will never be any `null` entries when mode is `complete` - the absence of a workflow ID from the object means that workflow should not be on the device. When mode is `partial`, the absence of a workflow ID has no bearing on if that workflow should be on the device or not. Instead, a `null` entry for a workflow ID will signify that the workflow should be removed.

If the given workflow is a version of an edge custom node, the key within the `flows` object will be structured as `${customNodeId}-${versionName}`. This does not apply if the deployment is for the `develop` version of an edge custom node for testing purposes (i.e. it will contain the custom node ID only).

If the given workflow is a version of an instance edge custom node, the key within the `flows` object will be structured as `instance-${customNodeId}`.

### Peripheral Information Bundle

* Topic: `losant/<deviceId>/toAgent/peripherals`
* Publish: only the Losant Cloud
* Subscribe: only the device `<deviceId>` (must be type `edgeCompute`)
* Added in version 1.16.0

This message is sent in the following cases:

* In response to a `Hello` message (i.e., on device connect).
* When peripherals associated with a device are created/modified/removed.

There are two modes to this message - `partial` and `complete`. When an edge agent receives a `partial` message, the new peripheral information is merged with the current information the agent knows about. When an edge agent receives a `complete` message, the peripheral information on the agent is replaced.

Payload Format:

```json
{
  "time": <millisecond timestamp>,
  "mode": <"complete" or "partial">,
  "peripherals": {
    "<peripheralId_1>": <null or Peripheral Info Object>,
    "<peripheralId_2>": <null or Peripheral Info Object>,
    ...,
    "<peripheralId_N>": <null or Peripheral Info Object>
  }
}
```

The message will always contain the `mode`, `time` and `peripherals` keys.

When mode is `complete`, the content of the `peripherals` key is always the exact set of peripherals for the edge device. There will never be any `null` entries when mode is `complete` - the absence of a peripheral ID from the object means that peripheral should not be on the device. When mode is `partial`, the absence of a peripheral ID has no bearing on if that peripheral should be on the device or not. Instead, a `null` entry for a peripheral ID will signify that the peripheral should be removed.

Peripherals that are not tied to a single device (i.e., floating peripherals) are included in the `complete` mode of the Peripheral Information Bundle, but are never included in the `partial` mode. Floating peripheral partial updates are instead done through the Floating Peripheral Update message (see lower in this document).

### Workflow Information Response

* Topic: `losant/<deviceId>/fromAgent/flows`
* Publish: only the device `<deviceId>` (must be type `edgeCompute`)
* Subscribe: only the Losant Cloud

This message is sent by the edge agent after receiving and processing a Workflow Information Bundle message.

Payload Format:

```json
{
  "<workflowId_1>": {
    "previousVersion": null,
    "newVersion": "<new version name>",
    "newEtag": "<new etag>"
  },
  "<workflowId_2>": {
    "previousVersion": "<old version name>",
    "newVersion": null,
    "previousEtag": "<previous etag>",
  },
  "<workflowId_3>": {
    "previousVersion": "<old version name>",
    "newVersion": "<new version name>",
    "previousEtag": "<previous etag>",
    "newEtag": "<new etag>"
  },
  "<workflowId_4>": {
    "previousVersion": "develop",
    "newVersion": "develop",
    "previousEtag": "<previous etag>",
    "newEtag": "<new etag>"
  },
  "<workflowId_5>": {
    "previousVersion": null,
    "newVersion": "develop",
    "newEtag": "<new etag>"
  },
    "<workflowId_6>": {
    "previousVersion": "develop",
    "newVersion": null,
    "previousEtag": "<previous etag>",
  },
  ...
  "<workflowId_N>": {
    "previousVersion": "<old version name>",
    "newVersion": "<old version name>",
    "attemptedVersion": "<attempted version name>",
    "attemptedEtag": "<attempted etag>",
    "error": "<an error message>"
  }
}
```

* `previousVersion`: Required field. Represents the version of the workflow that was on the device before processing the Workflow Information Bundle. `null` means that the workflow was not on the device.
* `newVersion`: Required field. Represents the version of the workflow that is now on the device after processing the Workflow Information Bundle. `null` means that the workflow is now not on the device.
* `previousEtag`: Optional field. Only applicable if agent version is >= 1.39.0. Represents the etag of the develop flow or flow version that was deployed to the device previously.
* `newEtag`: Optional field. Only applicable if agent version is >= 1.39.0. Represents the etag of the develop flow or flow version that has been deployed to the device.
* `attemptedVersion`: Optional field, will not be present if there was no issue with changing the version of this workflow. If the requested new version was unacceptable for some reason, this field has the version name of the requested version. `null` would mean that the workflow removal failed.
* `attemptedEtag`: Optional field. Only applicable if agent version is >= 1.39.0. Will only be present if there was an issue with changing the version of this workflow.
* `error`: Only present if `attemptedVersion` is present. If the requested new version was unacceptable for some reason, this field has an error message explaining why.

`previousVersion` and `newVersion` can be the same value; this means the version of the workflow on the device did not change. They *must* be the same value if `attemptedVersion` is present. `previousVersion` and `newVersion` can both be `null` - this means the workflow was not on the device previously, and is still not on the device.

A Workflow Information Response is always a complete response listing *all* information about workflows on the device - even if it is responding to a `partial` Workflow Information Bundle. Edge custom node versions deployed alongside workflows are not included for the purposes of this message.

### Debug Status Change

* Topic: `losant/<deviceId>/toAgent/debug`
* Publish: only the Losant Cloud
* Subscribe: only the device `<deviceId>` (must be type `edgeCompute`)

This message is sent by the cloud to turn on or off debugging for particular workflow(s).

Payload Format:

```json
{
  "<workflowId_1>": < true | false >
  "workflowId_1-cn>": <true | false>,
  ...
  "<workflowId_N>": < true | false >
}
```

* `true` - the agent should start reporting debug messages for the particular workflow.
* `false` - the agent should stop reporting debug messages for the particular workflow.

When `-cn` is appended to the workflow ID in the object key, it indicates whether or not custom node debug messages should be sent for the given workflow.

The debugging state of a workflow not included in this message should not be changed.

### Debug Result

* Topic: `losant/<deviceId>/fromAgent/debug`
* Publish: only the device `<deviceId>` (must be type `edgeCompute`)
* Subscribe: only the Losant Cloud

This message is sent by the edge agent to report any workflow debug messages for workflows that have debugging enabled.

**NOTE**: "etag" property is only sent for agent versions >= 1.39.0

Payload Format:

```json
[
  {
    "time": "<datetime>",
    "runStart": "<datetime>",
    "flowId": "<workflowId>",
    "triggerUiIds": ["<id>", "<id>", ...],
    "runId": "<uuid>",
    "flowVersionId": "<workflowVersionId>",
    "flowVersion": "<workflow version name>",
    "etag": "<workflow etag>",
    "message": "<a message>",
    "sourceNode": "<nodeId>",
    "prevNodes": ["<nodeId>", "<nodeId>", ...],
    "prevNodeDurations": [<duration>, <duration>, ...],
    "payload": <current workflow payload object>,
    "payloadPath": "<payload path>",
    "error": <error object>,
    "customNode": <object containing custom node run info, if message is coming from a custom node>,
    "level": <"error" | "warn" | "info" | "verbose">
  },
  ...,
  <possibly more debug messages>
]
```

Debug messages are leading throttle time batched. If a workflow is attempting to send many debug messages, they will be batched into these Debug Result arrays - the edge agent will send at max one Debug Result message per second to the Losant Cloud. The edge agent should never send an empty array as a Debug Result message.

* `triggerUiIds` - Array should always include at least one entry.
* `flowVersionId` - If develop is deployed will be "develop", otherwise will be the object ID of the flow version.
* `sourceNode` - May be null if the message is not directly related to a node.
* `prevNodes` - May be an empty array, but may not be null.
* `error` - Will only be present if there was an error.
* `payloadPath` - If the payload property is a specific sub-field of the workflow payload, this is present and shows the path of the sub field.

**NOTE**: if at any point the Losant Cloud receives a debug message for a workflow that should not be sending debug messages currently, the cloud will send a Debug Status Change to the agent requesting with that workflow ID set to `false`. If the Losant Cloud receives a debug message for a custom node within a workflow but no one is listening for debug messages, it will send a Debug Status Change indicating that custom node debug messages for that flow should not be sent.

### Virtual Button Press

* Topic: `losant/<deviceId>/toAgent/virtualButton`
* Publish: only the Losant Cloud
* Subscribe: only the device `<deviceId>` (must be type `edgeCompute`)
* Added in version 1.5.0

This message is sent by the cloud when a virtual button is pressed for a specific device and workflow
version (and that workflow version is deployed to that device).

Payload Format:

```json
{
  "flowVersion": "<workflow version name>",
  "triggerId": "<virtual button trigger id>",
  "data": <User defined Virtual Button payload data object>,
  "meta": <Optional user defined Virtual Button meta data object>
}
```

The `triggerId` is guaranteed unique across all workflows. If there is no trigger with that id for the
given flow version, the message should be ignored by the edge agent (i.e., it will fire no workflows).

### Workflow Stats

* Topic: `losant/<deviceId>/fromAgent/flowStats`
* Publish: only the device `<deviceId>` (must be type `edgeCompute`)
* Subscribe: only the Losant Cloud

This message is sent by the edge agent on a periodic basis (by default 30 minutes) to report statistics on workflow runs.

Payload Format:

```json
[
  {
    "flowId": "<workflowId>",
    "flowVersionId": "<workflowVersionId>",
    "stats": {
      "time": "<datetime>",
      "runCount": <number>,
      "wallTime": <number>,
      "pathsCompleted": <number>,
      "pathsFailed": <number>,
      "errors": [
        {
          "error": <Error Object>,
          "nodeId": "<nodeId>"
        },
        ...,
        <possibly more error objects>
      ]
    }
  },
  ...
  <possibly more stat objects>
]
```

The statistics are from workflow runs since either the previous Workflow Stats message was sent OR since agent startup (if no previous message has been sent). The agent should make a best attempt to send a Workflow Stats message on agent shutdown.

* `flowVersionId` - If develop is deployed will be "develop", otherwise will be the object ID of the flow version.
* `time` - The last time that workflow version started running.
* `runCount` - Total runs of this version (includes runs with errors).
* `wallTime` - Total time in milliseconds of all runs of this version.
* `pathsCompleted` - Total number of workflow paths completed with no errors.
* `pathsFailed` - Total number workflow paths that had errors.
* `errors` - This array has a maximum length of 5 entries. Entries should be unique.

### Application Update

* Topic: `$SYS/applicationUpdate`
* Publish: only the Losant Cloud
* Subscribe: any device of type `edgeCompute`

This message is sent by the Losant Cloud whenever information about the application itself changes.

Payload Format:

```json
{
  "time": <millisecond timestamp>,
  "application": <Application Info Object>
}
```

### Floating Peripheral Update

* Topic: `$SYS/floatingUpdate`
* Publish: only the Losant Cloud
* Subscribe: any device of type `edgeCompute`
* Added in version 1.16.0

This message is sent by the Losant Cloud whenever information about floating peripheral devices changes. This message should be consumed in the same manner as a Peripheral Information Bundle.

Payload Format:

```json
{
  "time": <millisecond timestamp>,
  "mode": "partial",
  "peripherals": {
    "<peripheralId_1>": <null or Peripheral Info Object>,
    "<peripheralId_2>": <null or Peripheral Info Object>,
    ...,
    "<peripheralId_N>": <null or Peripheral Info Object>
  }
}
```

### Agent Logs Request

* Topic: `losant/<deviceId>/toAgent/logs`
* Publish: only the Losant Cloud
* Subscribe: only the device `<deviceId>` (must be type `edgeCompute`)

This message is sent by the cloud to request agent logs

Payload Format:

```json
{
  "logLevel": < "error" | "warn" | "info" | "verbose" >,
  "streamLogs": < true | false >,
  "sendLogBuffer": < true | false >,
  "requestId": <uniq request identifier>
}
```

## Message Inner Object Details

### Peripheral Info Object

```json
{
  "name": "<the device name>",
  "id": "<deviceId>",
  "tags": {
    "<tagKey_1>": ["<tagValue1>", ...]
    ...,
    "<tagKey_N>": ["<tagValueN>", ...]
  },
  "deviceClass": <"floating" or "peripheral">,
  "attributes": [
    {
      "dataType": "<data type>",
      "name": "<attribute name>",
      "attributeTags": {
        "<tagKey_1>": "<tagValue1>",
        ...,
        "<tagKey_N>": "<tagValueN>"
      }
    },
    ...
  ]
}
```

### Application Info Object

```json
{
  "name": "<the application name>",
  "id": "<applicationId>",
  "globals": {
    "<globalKey_1>": <globalValue_1>,
    ...
    "<globalKey_N>": <globalValue_N>
  }
}
```

### Flow Info Object

* Note: "etag" property is only sent for agent versions >= 1.39.0
* Note: "flowClass" is only set for agent versions >=1.41.0
* Note: "customNodeConfig" is only set for custom nodes and cannot exist on agent versions <1.41.0

```json
{
  "name": "<the workflow name>",
  "fileName": "<local filename for on-disk flows>",
  "globals": {
    "<globalKey_1>": <globalValue_1>,
    ...,
    "<globalKey_N>": <globalValue_N>
  },
  "triggers": [
    <trigger object>,
    ...,
    <trigger object>
  ],
  "nodes": [
    <node object>,
    ...,
    <node object>
  ],
  "version": "<the version name>",
  "versionId": "<workflowVersionId - null for develop>",
  "etag": "<workflow etag>",
  "minimumAgentVersion": "<minimum required agent version>",
  "flowClass": "<edge or customNode or instanceCustomNode>",
  "customNodeConfig": {
    "outputCount": "<integer, 1 or 2>",
    "resultMode": "<'optional' or 'required'>",
    "resultDescription": "<string>",
    "fields": [
      <field info object>,
      ...,
      <field info object>
    ]
  }
}
```

### Device Info Object

* Note: attributes, creationDate, and parentId are only sent for agent versions >= 1.33.0

```json
{
  "name": "<the device name>",
  "id": "<deviceId>",
  "tags": {
    "<tagKey_1>": ["<tagValue1>", ...]
    ...,
    "<tagKey_N>": ["<tagValueN>", ...]
  },
  "attributes": [
    {
      "dataType": "<data type>",
      "name": "<attribute name>",
      "attributeTags": {
        "<tagKey_1>": "<tagValue1>",
        ...,
        "<tagKey_N>": "<tagValueN>"
      },
      "contentType": "<content type, if set>"
    },
    ...
  ],
  "creationDate": "<the device creation date>",
  "parentId": "<device parentId, if set>"
}
```

### Error Object

```json
{
  "name": "<error name>",
  "message": "<error message>"
}
```
