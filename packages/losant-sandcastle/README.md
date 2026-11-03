# losant-sandcastle

A Node.js library for executing untrusted JavaScript code in isolated sandboxes with configurable security and resource management.

## Features

- **Pluggable sandbox implementations** - Implement a custom sandbox or use the default unsafe-sandbox which uses node:vm.
- **Resource pooling** - Manage multiple sandbox instances with intelligent queuing
- **Timeout management** - Configurable execution timeouts with automatic cleanup
- **Multi-tenancy support** - Per-owner resource limiting to prevent resource monopolization
- **Automatic retry** - Handles transient failures with configurable retry logic
- **Console logging** - Optional console output capture from sandboxed code

## Installation

```bash
npm install losant-sandcastle
```

## Basic Usage

### Single Sandbox (SandCastle)

```javascript
import { SandCastle } from 'losant-sandcastle';

const sandcastle = new SandCastle({
  timeout: 5000,           // 5 second timeout
  memoryLimitMB: 100       // 100MB memory limit
});

const script = sandcastle.createScript('return 1 + 1;');

script.on('exit', (err, output) => {
  if (err) {
    console.error('Script error:', err);
  } else {
    console.log('Result:', output); // 2
  }
});

script.run({});
```

### Pool Management

For applications that need to execute many scripts concurrently, use `Pool` to manage multiple sandbox instances:

```javascript
import { Pool } from 'losant-sandcastle';

const pool = new Pool(
  {
    numberOfInstances: 5,  // Create 5 sandbox workers
  },
  {
    timeout: 5000,
    memoryLimitMB: 100
  }
);

await pool.waitForPoolReady();

const script = pool.createScript('return payload.value * 2;', 'owner-id');

script.on('exit', (err, output) => {
  console.log('Result:', output); // { value: 20 }
});

script.run({ value: 10 });

// Cleanup
pool.shutdown();
```

## Pluggable Sandbox Architecture

losant-sandcastle supports custom sandbox implementations, allowing you to choose the right isolation mechanism for your use case.

### Using a Custom Sandbox

```javascript
import { Pool } from 'losant-sandcastle';
import path from 'node:path';

const pool = new Pool(
  {
    numberOfInstances: 2,
  },
  {
    sandboxModulePath: path.resolve('./my-custom-sandbox.js'),
    timeout: 5000,
    memoryLimitMB: 100
  }
);
```

### Creating a Custom Sandbox

Extend `BaseSandbox` to create your own sandbox implementation:

```javascript
import { BaseSandbox } from 'losant-sandcastle';
import vm from 'node:vm';

class MyCustomSandbox extends BaseSandbox {
  // Override to specify if async/await is supported
  shouldUseAsync() {
    return true; // This sandbox supports async/await
  }

  // Implement the core execution logic
  async runWrappedSource(wrappedSource, execData, onConsole) {
    const sandbox = {
      onConsole,
      __globalPayload__: execData.context,
      // Add your custom globals here
    };

    let result, error;
    try {
      const vmScript = new vm.Script(wrappedSource, { 
        filename: 'CustomScript' 
      });
      result = await vmScript.runInContext(
        vm.createContext(sandbox),
        { displayErrors: false, microtaskMode: 'afterEvaluate' }
      );
    } catch (e) {
      error = e;
    }

    return { result, error };
  }
}

export default MyCustomSandbox;
```

### Built-in Sandbox Implementations

**unsafe-sandbox.js** (default)
- Uses Node.js built-in `vm` module
- Runs in the same process/event loop
- Suitable for trusted, single-tenant environments
- Supports async/await
- Lower isolation but better performance

**Note:** For multi-tenant scenarios requiring stronger isolation, implement a custom sandbox using `isolated-vm` or similar.

## Advanced Pool Configuration

### Multi-tenancy Resource Limits

Prevent a single owner from monopolizing sandbox resources:

```javascript
const runCountByOwner = new Map();

const pool = new Pool({
  numberOfInstances: 3,
  
  // Only allow 1 concurrent script per owner
  canRunCheck: ({ ownerId }) => {
    return (runCountByOwner.get(ownerId) || 0) < 1;
  },
  
  // Track running scripts
  preScriptRunCallback: ({ ownerId }) => {
    const count = runCountByOwner.get(ownerId) || 0;
    runCountByOwner.set(ownerId, count + 1);
  },
  
  // Release on completion
  postScriptRunCallback: ({ ownerId }) => {
    const count = runCountByOwner.get(ownerId) || 0;
    if (count <= 1) {
      runCountByOwner.delete(ownerId);
    } else {
      runCountByOwner.set(ownerId, count - 1);
    }
  }
});
```

### Console Output Capture

```javascript
const script = pool.createScript(
  'console.log("Hello"); return 42;',
  'owner-id',
  { consoleLog: true }
);

script.on('console', (output) => {
  console.log('Console:', output.lvl, output.msg);
});

script.on('exit', (err, result) => {
  console.log('Result:', result);
});

script.run({});
```

## API Reference

### SandCastle

**Constructor Options:**
- `timeout` (number) - Script execution timeout in milliseconds (default: 5000)
- `startupTimeout` (number) - Sandbox startup timeout in milliseconds (default: 5000)
- `socket` (string) - Unix socket path for IPC (default: '/tmp/sandcastle.sock')
- `memoryLimitMB` (number) - Memory limit in MB (default: 0 = no limit)
- `cwd` (string) - Working directory for sandbox process (default: process.cwd())
- `sandboxModulePath` (string) - Path to custom sandbox module
- `sandboxScriptFileName` (string) - The filename to use in the error stack trace
- `sandboxScriptDefaultErrorMessage` (string) - The default error message to use when getting a parse error.
- `spawnEnv` (object) - The environment object to use when executing the sandbox. (default: undefined)

**Methods:**
- `createScript(source, opts)` - Create a new script instance
- `shutdown()` - Clean shutdown of the sandbox
- `onSandboxReady(callback)` - Register callback for sandbox initialization

### Pool

**Constructor:**
```javascript
new Pool(poolOptions, sandcastleOptions)
```

**Pool Options:**
- `numberOfInstances` (number) - Number of sandbox workers (default: 1)
- `canRunCheck` (function) - A function to call before this script is selected to run, if it returns false will be skipped and left on the queue. (default: ({ script, context, ownerId, queuedAt }) => true)
- `preScriptRunCallback` (function) - Called before script execution (default: ({ script, context, ownerId }) => {})
- `postScriptRunCallback` (function) - Called after script completion (default: ({ script, context, ownerId }) => {})

**Sandcastle Options:** Same as SandCastle constructor options

**Methods:**
- `createScript(source, ownerId, opts)` - Create a new pooled script
- `waitForPoolReady()` - Returns promise that resolves when all instances are ready
- `shutdown()` - Shutdown all sandcastles and clear queue

### Script

**Events:**
- `exit` - Emitted on successful completion: `(error, output)`
- `timeout` - Emitted when execution exceeds timeout
- `error` - Emitted on fatal errors: `(error)`
- `console` - Emitted on console output (if `consoleLog: true`): `(output)`

**Methods:**
- `run(context)` - Execute the script with given context (available as `payload`)
- `reset()` - Cancel execution and cleanup

### BaseSandbox

**Methods to Override:**
- `shouldUseAsync()` - Return true if sandbox supports async/await (default: false)
- `runWrappedSource(wrappedSource, execData, onConsole, encodeStream)` - Execute wrapped source code

**Provided Methods:**
- `start()` - Start the sandbox server (called automatically)
- `executeScript(encodeStream, data)` - Process script execution request

## Payload Handling

Scripts receive their context as a variable named `payload`. The script's return value becomes the new payload:

```javascript
const script = pool.createScript(`
  payload.count = (payload.count || 0) + 1;
  return payload;
`, 'owner-id');

script.on('exit', (err, output) => {
  console.log(output); // { count: 1 }
});

script.run({ count: 0 });
```

If a script doesn't return a value, the original payload is returned unchanged.

## Security Considerations

1. **Choose appropriate isolation** - The default `vm`-based sandbox provides basic isolation but shares the same event loop. For untrusted multi-tenant code, consider `isolated-vm` or similar.

2. **Memory limits** - Set `memoryLimitMB` to prevent memory exhaustion attacks

3. **Timeouts** - Always configure reasonable timeouts to prevent infinite loops

4. **Input validation** - Validate and sanitize all input before passing to scripts

5. **Globals** - Carefully control what globals are available in the sandbox context

6. **Resource limits** - Use `canRunCheck` to prevent resource monopolization

## Architecture

losant-sandcastle uses a multi-process architecture:

```
Parent Process (Your Application)
├─ Pool / SandCastle (Manager)
│  ├─ Script (Queue & IPC)
│  └─ Child Process (Sandbox)
│     └─ BaseSandbox Implementation
│        └─ vm.Script / isolated-vm / Custom
```

- **Parent Process**: Manages script queue, timeouts, and retries
- **Child Process**: Runs the actual sandboxed code in isolation
- **IPC**: Unix domain sockets with length-prefixed streams
- **Heartbeat**: Automatic health checking and restart on failure

## Error Handling

Scripts can fail in several ways:

- **Timeout**: Script exceeds execution time limit
- **Error**: Script throws an exception
- **Connection failure**: Communication with sandbox fails (triggers retry)
- **Unserializable payload**: Input/output cannot be serialized

Always handle both `error` and `timeout` events:

```javascript
script.on('exit', (err, output) => {
  if (err) {
    console.error('Script error:', err.message);
  } else {
    console.log('Success:', output);
  }
});

script.on('timeout', () => {
  console.error('Script timed out');
});

script.on('error', (err) => {
  console.error('Fatal error:', err);
});
```

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
