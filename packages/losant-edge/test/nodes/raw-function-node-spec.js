import { levelManager } from '../common.js';
import measureCpu from 'losant-nodejs-utils/test/utils/measure-cpu.js';
import RawFunctionNode from '../../src/nodes/raw-function-node.js';
import { sleep, noop } from 'omnibelt';
import NodeRunner from '../../src/node-runner.js';
import abstractRawFunctionNodeTests from 'losant-nodes/test/abstract/raw-function-node-spec.js';
const prevNodeInfo = { ids: [], durations: [] };
describe('RawFunctionNode (UNSAFE) - but with require', function() {
  let publishedDebugMessages = [];
  let nodeRunner, contextify;
  before(async () => {
    nodeRunner = NodeRunner(levelManager.keyValueStore, { fireOnError: noop }, {}, {}, {
      sendMqttMessage: noop, sendDebugMessage: noop, sendStatsMessage: noop
    });
    contextify = (obj = {}) => nodeRunner.contextify({
      runStart: Date.now(),
      applicationId: '000000000000000000000002',
      flowId: '000000000000000000000001',
      flowVersion: 'develop',
      publishDebugMessage: async function(msgObj, _prevNodeInfo) {
        // NOTE 'this' is the workflow context object
        await sleep(0);
        publishedDebugMessages.push({
          applicationId: this.applicationId,
          flowId: this.flowId,
          etag: this.etag,
          prevNodeInfo: _prevNodeInfo,
          msgObj
        });
      },
      ...obj
    });
    await nodeRunner.initialize();
    RawFunctionNode.shutdown();
    RawFunctionNode.startup();
    await RawFunctionNode.pool.waitForPoolReady();
  });

  afterEach(() => {
    publishedDebugMessages = [];
  });

  after(async () => {
    RawFunctionNode.shutdown();
    await nodeRunner.shutdown();
  });

  it('large number payload test', async () => {
    const node = new RawFunctionNode('id', [[4]], {
      script: 'return payload;'
    });

    const payload = {};
    let i = 0;
    for (; i<444000; i++) {
      payload[i] = Math.floor(Math.random() * 100);
    }

    (await measureCpu(async () => {
      return node.run({ }, payload, prevNodeInfo);
    })).should.be.belowOrEqual(2530000);
  });

  it('large text payload test', async () => {
    const node = new RawFunctionNode('id', [[4]], {
      script: 'return payload;'
    });

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charsLen = chars.length;
    const payload = {};
    let i = 0, j, text;
    for (; i<20000; i++) {
      text = '';
      for (j=0; j<250; j++) {
        text += chars.charAt(Math.floor(Math.random() * charsLen));
      }
      payload[i] = text;
    }

    (await measureCpu(async () => {
      return node.run({ }, payload, prevNodeInfo);
    })).should.be.belowOrEqual(1800000);
  });

  it('should error on too large a payload', async () => {
    const node = new RawFunctionNode('id', [[4]], {
      script: 'return payload;'
    });

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charsLen = chars.length;
    const payload = {};
    let i = 0, j, text;
    for (; i<50000; i++) {
      text = '';
      for (j=0; j<100; j++) {
        text += chars.charAt(Math.floor(Math.random() * charsLen));
      }
      payload[i] = text;
    }
    let error;
    try { await node.run({ }, payload, prevNodeInfo); } catch (e) { error = e; }
    error.name.should.equal('TooLargeError');
  });

  it('should NOT error on too large a payload, when scoped', async () => {
    const node = new RawFunctionNode('id', [[4]], {
      script: 'return payload + " General Kenobi."',
      scopePath: 'scopeTime'
    });

    const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
    const charsLen = chars.length;
    const payload = {};
    let i = 0, j, text;
    for (; i<50000; i++) {
      text = '';
      for (j=0; j<100; j++) {
        text += chars.charAt(Math.floor(Math.random() * charsLen));
      }
      payload[i] = text;
      payload.scopeTime = 'Hello there.';
    }

    const [oids, p] = await node.run({ }, payload, prevNodeInfo);
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({
      ...payload,
      scopeTime: 'Hello there. General Kenobi.'
    });
  });

  it('should correctly deal with circular ref input', async () => {
    const node = new RawFunctionNode('id', [[4]], { script: 'return;' });

    const payload = { a: {} };
    payload.a.b = payload;

    let error;
    try { await node.run({ }, payload, prevNodeInfo); } catch (e) { error = e; }
    error.should.containEql({
      message: 'Unserializable payload.',
      name: 'UnserializablePayloadError'
    });
  });

  it('should correctly deal with circular ref output', async () => {
    const node = new RawFunctionNode('id', [[4]], { script: 'var a = {}; a.a = a; return a;' });

    const payload = { a: {} };

    let error;
    try { await node.run({ }, payload, prevNodeInfo); } catch (e) { error = e; }
    error.should.deepEqual({
      message: 'Unserializable function node message',
      name: 'FunctionNodeError'
    });
  });

  it('should correctly deal with circular ref log', async () => {
    const node = new RawFunctionNode('id', [[4]], { script: 'var a = {}; a.a = a; console.log(a);' });

    const payload = { a: {} };

    let error;
    try { await node.run(contextify({ }), payload, prevNodeInfo); } catch (e) { error = e; }
    error.should.deepEqual({
      message: 'Unserializable function node message',
      name: 'FunctionNodeError'
    });
  });

  it('should correctly work with blank script', async () => {
    const node = new RawFunctionNode('id', [[4]], { });

    const [oids, p] = await node.run({ }, { a: true }, prevNodeInfo);
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({ a: true });
  });

  it('should correctly work with an error prop', async () => {
    const node = new RawFunctionNode('id', [[4]], { script: 'payload.error.b = 2;' });
    const [oids, p] = await node.run({ }, { error: { a: 1 } }, prevNodeInfo);
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({ error: { a: 1, b: 2 } });
  });

  it('should correctly use Buffer', async () => {
    const node = new RawFunctionNode('id', [[4]], { script: 'payload = { q: Buffer.from(payload.b) };' });

    const [oids, p] = await node.run({ }, { b: '\u0001\u0002\u0003\u0004\u0005' }, prevNodeInfo);
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({ q: { data: [ 1, 2, 3, 4, 5 ], type: 'Buffer' } });
  });

  it('should correctly work with completely replacing payload', async () => {
    const node = new RawFunctionNode('id', [[4]], { script: 'payload = { q: "w" };' });

    const [oids, p] = await node.run({ }, { b: '5' }, prevNodeInfo);
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({ q: 'w' });
  });

  it('should correctly work with returning new value', async () => {
    const node = new RawFunctionNode('id', [[4]], { script: 'return { a: "z" };' });

    const [oids, p] = await node.run({ }, { b: '5' }, prevNodeInfo);
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({ a: 'z' });
  });

  it('should correctly work with mutating existing payload', async () => {
    const node = new RawFunctionNode('id', [[4]], { script: 'payload.b = 6' });

    const [oids, p] = await node.run({ }, { b: '5' }, prevNodeInfo);
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({ b: 6 });
  });

  it('should correctly work with eval', async () => {
    const node = new RawFunctionNode('id', [[4]], { script: 'eval("payload.b = payload.b + 2")' });

    const [oids, p] = await node.run({ }, { b: '5' }, prevNodeInfo);
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({ b: '52' });
  });

  it('should work nicely with dates', async () => {
    const node = new RawFunctionNode('id', [[4]], { script: 'payload.b = new Date(payload.b.getTime() + 56)' });

    const [oids, p] = await node.run({ }, { b: new Date(1234) }, prevNodeInfo);
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({ b: new Date(1290) });
  });

  it('should work nicely with bad dates', async () => {
    const node = new RawFunctionNode('id', [[4]], { script: 'payload.b = new Date(payload.b.getTime() + 56)' });
    const [oids, p] = await node.run({ }, { b: new Date(NaN) }, prevNodeInfo);
    oids.should.deepEqual([[4]]);
    String(p.b).should.equal('Invalid Date');
    p.should.deepEqual({ b: p.b });
  });

  it('should allow use of require', async () => {
    const node = new RawFunctionNode('id', [[4]], { script: 'var fs = require("fs"); return fs.constants.COPYFILE_EXCL;' });

    const result = await node.run({ }, { b: '5' }, prevNodeInfo);
    result.should.deepEqual([ [ [ 4 ] ], 1 ]);
  });

  it('should correctly work with syntax error', async () => {
    const node = new RawFunctionNode('id', [[4]], { script: '\n\n () => { \' }()' });

    let err;
    try { await node.run({ }, { b: '5' }, prevNodeInfo); } catch (e) { err = e; }
    err.should.deepEqual({
      name: 'FunctionNodeSyntaxError',
      message: 'Invalid or unexpected token',
      stack: [
        'RawFunctionNode:3',
        ' () => { \' }()',
        '         ^^^^^'
      ]
    });
  });

  it('should error out nicely, serious trace', async () => {
    const node = new RawFunctionNode('id', [[4]], {
      script: `var hello = 1;
var what = () => {
  var a;
  a = a.split();
};
var goodbye = () => {
  what();
}
function oneTwo(){
  goodbye();
}
var threeFour = function() {
  oneTwo();
}
return threeFour();`
    });

    let err;
    try { await node.run({ }, { b: '5' }, prevNodeInfo); } catch (e) { err = e; }
    err.should.deepEqual({
      name: 'FunctionNodeTypeError',
      message: 'Cannot read properties of undefined (reading \'split\')',
      stack: [
        'at what (RawFunctionNode:4:9)',
        'at goodbye (RawFunctionNode:7:3)',
        'at oneTwo (RawFunctionNode:10:3)',
        'at threeFour (RawFunctionNode:13:3)',
        'at RawFunctionNode:15:8'
      ]
    });
  });

  it('should error out nicely, infinite loop', async () => {
    const node = new RawFunctionNode('id', [[4]], {
      script: `var hello = 1;
var what = () => {
  threeFour();
};
var goodbye = () => {
  what();
}
function oneTwo(){
  goodbye();
}
var threeFour = function() {
  oneTwo();
}
return threeFour();`
    });
    let err;
    try { await node.run({ }, { b: '5' }, prevNodeInfo); } catch (e) { err = e; }
    // have each of the 4 possible stack traces cause it depends on many factors
    err.should.be.oneOf({
      name: 'FunctionNodeRangeError',
      message: 'Maximum call stack size exceeded',
      stack: [
        'at oneTwo (RawFunctionNode:9:3)',
        'at threeFour (RawFunctionNode:12:3)',
        'at what (RawFunctionNode:3:3)',
        'at goodbye (RawFunctionNode:6:3)',
        'at oneTwo (RawFunctionNode:9:3)',
        'at threeFour (RawFunctionNode:12:3)',
        'at what (RawFunctionNode:3:3)',
        'at goodbye (RawFunctionNode:6:3)',
        'at oneTwo (RawFunctionNode:9:3)',
        'at threeFour (RawFunctionNode:12:3)'
      ]
    },
    {
      name: 'FunctionNodeRangeError',
      message: 'Maximum call stack size exceeded',
      stack: [
        'at threeFour (RawFunctionNode:12:3)',
        'at what (RawFunctionNode:3:3)',
        'at goodbye (RawFunctionNode:6:3)',
        'at oneTwo (RawFunctionNode:9:3)',
        'at threeFour (RawFunctionNode:12:3)',
        'at what (RawFunctionNode:3:3)',
        'at goodbye (RawFunctionNode:6:3)',
        'at oneTwo (RawFunctionNode:9:3)',
        'at threeFour (RawFunctionNode:12:3)',
        'at what (RawFunctionNode:3:3)'
      ]
    }, {
      name: 'FunctionNodeRangeError',
      message: 'Maximum call stack size exceeded',
      stack: [
        'at goodbye (RawFunctionNode:6:3)',
        'at oneTwo (RawFunctionNode:9:3)',
        'at threeFour (RawFunctionNode:12:3)',
        'at what (RawFunctionNode:3:3)',
        'at goodbye (RawFunctionNode:6:3)',
        'at oneTwo (RawFunctionNode:9:3)',
        'at threeFour (RawFunctionNode:12:3)',
        'at what (RawFunctionNode:3:3)',
        'at goodbye (RawFunctionNode:6:3)',
        'at oneTwo (RawFunctionNode:9:3)'
      ]
    }, {
      name: 'FunctionNodeRangeError',
      message: 'Maximum call stack size exceeded',
      stack:  [
        'at what (RawFunctionNode:3:3)',
        'at goodbye (RawFunctionNode:6:3)',
        'at oneTwo (RawFunctionNode:9:3)',
        'at threeFour (RawFunctionNode:12:3)',
        'at what (RawFunctionNode:3:3)',
        'at goodbye (RawFunctionNode:6:3)',
        'at oneTwo (RawFunctionNode:9:3)',
        'at threeFour (RawFunctionNode:12:3)',
        'at what (RawFunctionNode:3:3)',
        'at goodbye (RawFunctionNode:6:3)'
      ]
    });
  });

  it('should correctly work console log', async () => {
    const node = new RawFunctionNode('id', [[4]], {
      script: 'payload.b = 6; console.log("what"); payload.d = 7'
    });
    const context = contextify({ applicationId: 'rfnAppId', flowId: 'aflowId', etag: 'tonka' });

    publishedDebugMessages.length.should.equal(0);
    const [oids, p] = await node.run(context, { b: '5' }, prevNodeInfo);
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({ b: 6, d: 7 });

    await sleep(0); // because log might not be ready yet
    publishedDebugMessages.length.should.equal(1);
    publishedDebugMessages[0].should.deepEqual({
      applicationId: 'rfnAppId',
      flowId: 'aflowId',
      etag: 'tonka',
      prevNodeInfo,
      msgObj: {
        level: 'info',
        message: 'LOG: what',
        payload: { b: 6 },
        sourceNode: 'id'
      }
    });
  });

  it('should correctly work with scoped console log', async () => {
    const node = new RawFunctionNode('id', [[4]], {
      script: 'payload.b = 6; console.log("what"); payload.d = 7',
      scopePath: 'inScope'
    });
    const context = contextify({ applicationId: 'rfnAppId', flowId: 'aflowId', etag: 'kronk' });

    publishedDebugMessages.length.should.equal(0);
    const [oids, p] = await node.run(context, { outside: 'nope', inScope: { b: '5' } }, prevNodeInfo);
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({ outside: 'nope', inScope: { b: 6, d: 7 } });

    await sleep(0); // because log might not be ready yet
    publishedDebugMessages.length.should.equal(1);
    publishedDebugMessages[0].should.deepEqual({
      applicationId: 'rfnAppId',
      flowId: 'aflowId',
      etag: 'kronk',
      prevNodeInfo,
      msgObj: {
        level: 'info',
        message: 'LOG: what',
        payload: { b: 6 },
        payloadPath: 'inScope',
        sourceNode: 'id'
      }
    });
  });

  it('should correctly work console error', async () => {
    const node = new RawFunctionNode('id', [[4]], {
      script: 'payload.q = 6; console.error({ wootwoot: true }); payload.d = 7'
    });
    const context = contextify({ applicationId: 'rfnAppId1', flowId: 'aflowId1', etag: 'zonk' });

    publishedDebugMessages.length.should.equal(0);
    const [oids, p] = await node.run(context, { b: '5' }, prevNodeInfo);
    oids.should.deepEqual([[4]]);
    p.should.deepEqual({ b: '5', q: 6, d: 7 });

    await sleep(0); // because log might not be ready yet
    publishedDebugMessages.length.should.equal(1);
    publishedDebugMessages[0].should.deepEqual({
      applicationId: 'rfnAppId1',
      flowId: 'aflowId1',
      etag: 'zonk',
      prevNodeInfo,
      msgObj: {
        level: 'error',
        message: 'ERROR: {"wootwoot":true}',
        payload: { b: '5', q: 6 },
        sourceNode: 'id'
      }
    });
  });

  it('should correctly error on gc, after a console log', async () => {
    const node = new RawFunctionNode('id', [[4]], {
      script: 'payload.q = 6; console.log({ blah: true }); gc();  payload.d = 7'
    });
    const context = contextify({ applicationId: 'rfnAppId2', flowId: 'aflowId2', etag: 'bonk' });

    publishedDebugMessages.length.should.equal(0);
    let err;
    try { await node.run(context, { b: '5' }, prevNodeInfo); } catch (e) { err = e; }
    err.should.deepEqual({
      name: 'FunctionNodeTypeError',
      message: 'gc is not a function',
      stack: [
        'at RawFunctionNode:1:45'
      ]
    });

    await sleep(0); // because log might not be ready yet
    publishedDebugMessages.length.should.equal(1);
    publishedDebugMessages[0].should.deepEqual({
      applicationId: 'rfnAppId2',
      flowId: 'aflowId2',
      etag: 'bonk',
      prevNodeInfo,
      msgObj: {
        level: 'info',
        message: 'LOG: {"blah":true}',
        payload: { b: '5', q: 6 },
        sourceNode: 'id'
      }
    });
  });

  abstractRawFunctionNodeTests(() => {
    return {
      RawFunctionNode,
      contextify,
      prevNodeInfo,
      getPublishedDebugMessages: () => publishedDebugMessages
    };
  });

  it('should allow async await and wait for promises', async () => {
    const node = new RawFunctionNode('id', [[4]], {
      script: `
      const fs = require('fs');
      const results = await new Promise((resolve, reject) => {
        fs.readFile('./packages/losant-nodes/test/__fixtures__/simple-text-file.txt', (err, result) => {
          if(err){ return reject(err); }
          resolve(result);
        });
      });
      return String(results);
      `
    });
    const context = contextify({ applicationId: 'rfnAppId2', flowId: 'aflowId2' });

    await node.run(context,
      {},
      prevNodeInfo
    ).should.be.resolvedWith([ [ [ 4 ] ], 'this is just a simple text file we can read' ]);
  });

  it('should do a good job binary parsing', async () => {
    const input = {
      working: {},
      data: {
        body: {
          station: '387A',
          rssi: '-51.00',
          location: '39.0,-85.0',
          seqNumber: '1381',
          data: '896b152c',
          time: '1551888088',
          device: '20FC48'
        }
      }
    };

    const output = {
      working: {
        humidity: 44,
        fahrenheit: 73.4,
        celsius: 23,
        battery: 3.25,
        mode: 1
      },
      data: input.data
    };

    const node = new RawFunctionNode('id', [[4]], {
      script: `
        var buf = Buffer.from(payload.data.body.data, 'hex');

        // e.g. 11101001 - mode is 001 (temperature)
        // Shifting 29 bits left pushes all other data out.
        // Shifting 29 bits back right replaces with zeros.
        // What's left is the raw mode number (0-5).
        var currentMode = buf[0] << 29 >>> 29;
        payload.working.mode = currentMode;

        buf = Buffer.from(payload.data.body.data, 'hex');

        // Battery voltage is the last 4 bits of byte 2.
        var battery = buf[1] << 28 >>> 28;

        // Voltage equation from Sigfox docs.
        var voltage = (battery * 0.05) + 2.7;

        payload.working.battery = voltage;

        buf = Buffer.from(payload.data.body.data, 'hex');

        // Temperature is the first 4 bits of byte 2.
        var temperature = buf[1] >>> 4 << 6;

        // Temperature equation from Sigfox docs.
        var celsius = (temperature - 200) / 8;

        payload.working.celsius = celsius;
        payload.working.fahrenheit = celsius * (9/5) + 32;

        buf = Buffer.from(payload.data.body.data, 'hex');

        // Humidity is byte 4.
        var humidity = buf[3];

        payload.working.humidity = humidity;
      `
    });

    const context = contextify({ applicationId: 'rfnAppId2', flowId: 'aflowId2' });
    const result = await node.run(context, input, prevNodeInfo);
    result[1].should.deepEqual(output);
  });

  it('should deal with various sandbox globals correctly', async () => {
    // note this is extremely inconsistent behavior with the "safe" raw function node
    // is a lot of this desired behavior? doubtful. But putting this test here so
    // that we can remain consistent

    const script = `
    payload = {
      'AggregateError': AggregateError,
      'Array': Array,
      'ArrayBuffer': ArrayBuffer,
      'Atomics': Atomics,
      'BigInt': BigInt,
      'BigIntInstance': 1n,
      'BigInt64Array': BigInt64Array,
      'BigInt64ArrayInstance': new BigInt64Array(),
      'BigUint64Array': BigUint64Array,
      'BigUint64ArrayInstance': new BigUint64Array(),
      'Boolean': Boolean,
      'Buffer': Buffer,
      'DataView': DataView,
      'Date': Date,
      'Error': Error,
      'EvalError': EvalError,
      'FinalizationRegistry': FinalizationRegistry,
      'Float32Array': Float32Array,
      'Float64Array': Float64Array,
      'Function': Function,
      'Infinity': Infinity,
      'Int16Array': Int16Array,
      'Int32Array': Int32Array,
      'Int8Array': Int8Array,
      'Intl': Intl,
      'JSON': JSON,
      'Map': Map,
      'MapInstance': new Map([[1,2],[3,4]]),
      'Math': Math,
      'NaN': NaN,
      'Number': Number,
      'Object': Object,
      'Promise': Promise,
      'PromiseInstance': new Promise(() => {}),
      'Proxy': Proxy,
      'ProxyInstance': new Proxy({}, {}),
      'RangeError': RangeError,
      'ReferenceError': ReferenceError,
      'Reflect': Reflect,
      'RegExp': RegExp,
      'RegExpInstance': /a/,
      'Set': Set,
      'SetInstance': new Set([1,2,3]),
      'SharedArrayBuffer': SharedArrayBuffer,
      'String': String,
      'Symbol': Symbol,
      'SymbolInstance': Symbol('testSymbol'),
      'SyntaxError': SyntaxError,
      'TypeError': TypeError,
      'URIError': URIError,
      'Uint16Array': Uint16Array,
      'Uint16ArrayInstance': new Uint16Array([1, 2]),
      'Uint32Array': Uint32Array,
      'Uint8Array': Uint8Array,
      'Uint8ArrayInstance': new Uint8Array([1, 2]),
      'Uint8ClampedArray': Uint8ClampedArray,
      'WeakMap': WeakMap,
      'WeakMapInstance': new WeakMap([[{}, 1], [{}, 2]]), // this currently errors
      'WeakRef': WeakRef,
      'WeakRefInstance': new WeakRef({}),
      'WeakSet': WeakSet,
      'WeakSetInstance': new WeakSet([{}]), // this currently errors
      'WebAssembly': WebAssembly,
      'console': console,
      'decodeURI': decodeURI,
      'decodeURIComponent': decodeURIComponent,
      'encodeURI': encodeURI,
      'encodeURIComponent': encodeURIComponent,
      'escape': escape,
      'eval': eval,
      'globalThis': globalThis,
      'isFinite': isFinite,
      'isNaN': isNaN,
      'parseFloat': parseFloat,
      'parseInt': parseInt,
      'require': require,
      'this': this,
      'unescape': unescape,
      '__proto__': __proto__,
      'hasOwnProperty': hasOwnProperty,
      'isPrototypeOf': isPrototypeOf,
      'propertyIsEnumerable': propertyIsEnumerable,
      'toLocaleString': toLocaleString,
      'toString': toString,
      'valueOf': valueOf,
      'constructor': constructor
    };`;

    const context = contextify({ applicationId: 'rfnAppId1', flowId: 'aflowId1', etag: 'zonk' });

    const node = new RawFunctionNode('id', [[4]], { script });
    (await node.run(context, { }, prevNodeInfo))[1].should.deepEqual({
      Atomics: {},
      BigIntInstance: null,
      BigInt64ArrayInstance: null,
      BigUint64ArrayInstance: null,
      Uint8ArrayInstance: { data: [1, 2], type: 'Buffer' },
      Uint16ArrayInstance: { data: [1, 2], type: 'Buffer' },
      Infinity: Infinity,
      Intl: {},
      JSON: {},
      MapInstance: { 1: 2, 3: 4 },
      Math: {},
      NaN: NaN,
      PromiseInstance: {},
      ProxyInstance: {},
      Reflect: {},
      RegExpInstance: {},
      SetInstance: [1, 2, 3],
      WeakMapInstance: {},
      WeakRefInstance: {},
      WeakSetInstance: {},
      WebAssembly: {},
      console: {},
      globalThis: {},
      this: {}
    });
  });

});
