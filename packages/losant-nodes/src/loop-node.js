import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import u from 'updeep';
import { times } from 'omnibelt';

const MAX_LOOP_NODE_SOURCE_LENGTH = Number(process.env.MAX_LOOP_NODE_SOURCE_LENGTH) || 2**18;

const checkSourceLength = (length) => {
  if (length > MAX_LOOP_NODE_SOURCE_LENGTH) {
    throw errors.TooLarge({ maximum: MAX_LOOP_NODE_SOURCE_LENGTH, size: length, title: 'loop source' });
  }
};

class LoopNode {

  /* Example Config:
  {
    loopSourcePath: <String - Required: path to collection to loop over>,
    currentItemPath: <String - Required: path to place the loop's current item>,
    mapResultPath: <String - Optional: if set, becomes array of the iteration values at mapValuePath>,
    mapValuePath: <String - Optional: if set, source of values for map result (otherwise uses currentItemPath)>,
    parallel: <Boolean - Optional: Should loop iterate in parallel - default false>
  }

  Outputs: outputIds[0] is the path taken after the loop finishes (leave loop),
  outputIds[1] is the path run for each iteration (inside loop). If there is
  nothing inside the loop or the source yields no items, the loop is skipped
  and only outputIds[0] runs (mapResultPath, if set, receives []).

  Loop on 3: [
    { value: 0, first: true, index: 0 },
    { value: 1, index: 1 },
    { value: 2, last: true, index: 2 }
  ]
  Loop on 'Two': [
    { value: 'T', first: true, index: 0 },
    { value: 'w', index: 1 },
    { value: 'o', last: true, index: 2 }
  ]
  Loop on [1, true, '2']: [
    { value: 1, first: true, index: 0 },
    { value: true, index: 1 },
    { value: '2', last: true, index: 2 }
  ]
  Loop on { a: 'b', c: 'd', e: 'f'}: [
    { value: 'b', key: 'a', first: true, index: 0 },
    { value: 'd', key: 'c', index: 1 },
    { value: 'f', key: 'e', last: true, index: 2 }
  ]
  Loop on all others: []

  * Modifications to the loop 'source' item during iteration do not affect the loop.
  * Non-Parallel mode:
    * Each loop is executed in serial - workflow waits for all internal paths in a loop
      iteration to finish before starting next iteration.
    * A LoopCapNode can be placed at the end of an internal loop path to
      signify that that path's payload should be used as the starting payload
      for the next loop iteration.
    * First LoopCapNode hit wins, if there are multiple paths and multiple
      LoopCapNodes in an iteration.
    * LoopCapNode can also be used to trigger a loop break, preventing
      future iterations of the loop if desired.
    * Any errors in any iterations will stop the loop and error the flow.
  * Parallel mode:
    * Loop iterations are executed in parallel (max depends on max available
      concurrents for the given workflow iteration, up to the workflow's
      maximum concurrent nodes (context.maxConcurrentNodes)).
    * Loop iterations are always executed with the original payload.
    * LoopCapNodes are only relevant for use when doing a map.
    * The concept of 'break' from LoopCapNodes is ignored.
    * While the loop iterations are executed in parallel, the loop
      as a whole waits for all iterations to finish before
      continuing on with the workflow.
    * Any errors in any iterations will accumulate until all iterations
      are completed, and then error the flow.
  * Map:
    * Valid for both parallel and non-parallel modes.
    * When mapResultPath is set, the loop becomes a 'map' instead of a
      'foreach'.
    * At the end of each iteration, the workflow looks up the mapValuePath
      against the payload determined by use of LoopCapNodes. That value is
      saved as the map result for that iteration.
    * If mapValuePath is not set, currentItemPath is used.
    * If no LoopCapNodes are hit in an iteration, the resulting map value
      for the iteration is undefined.
    * At the end of the loop, the resulting array of map values is placed
      at mapResultPath.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.leaveLoopIds = outputIds[0] || [];
    this.insideLoopIds = outputIds[1] || [];
    this.loopSourcePath = config.loopSourcePath;
    this.currentItemPath = config.currentItemPath;
    this.mapResultPath = config.mapResultPath;
    this.mapValuePath = config.mapValuePath;
    this.parallel = config.parallel;
  }

  sourceToLoopItems(source) {
    const typeOfSource = typeof(source);
    let items;

    if (typeOfSource === 'number') {
      let length = Math.abs(Math.ceil(source));
      if (!isFinite(length)) { length = 0; }
      checkSourceLength(length);
      items = Array.from({ length }, (_, index) => {
        return { value: index, index };
      });
    } else if (Array.isArray(source) || typeOfSource === 'string') {
      checkSourceLength(source.length);
      items = Array.from(source, (value, index) => {
        return { value, index };
      });
    } else if (source && typeOfSource === 'object') {
      const entries = Object.entries(source);
      checkSourceLength(entries.length);
      items = entries.map(([key, value], index) => {
        return { key, value, index };
      });
    }

    items = items || [];

    if (items.length > 0) {
      items[0].first = true;
      items[items.length - 1].last = true;
    }

    return u.freeze(items);
  }

  async runLoop(outerContext, payload, loopItems) {
    let index = 0;
    let pathsCompleted = 0;
    let loopErrors = [];
    let hitTimeout = false;
    const mapResult = this.mapResultPath ? new Array(loopItems.length).fill() : null;

    const process = async () => {
      const now = Date.now();
      if (hitTimeout || (now - outerContext.runStart) > outerContext.maxFlowRunTime) {
        hitTimeout = true;
        return;
      }

      const itemIndex = index++;
      const item = loopItems[itemIndex];

      if (!item) { return; }

      const innerPayload = payloadHelper.set(this.currentItemPath, item, payload);

      const loopResult = {};
      // don't want a deep clone, things like the concurrents object should remain same ref
      const innerContext = {
        ...outerContext,
        [`loopResult-${this.id}`]: loopResult,
        scopedConcurrent: { awaiting: [], slotInUse: false },
        iterationStart: now
      };

      const result = await innerContext.runNodes(this.insideLoopIds, innerPayload, innerContext);
      pathsCompleted += result.pathsCompleted;
      if (result.errors.length > 0) {
        loopErrors = loopErrors.concat(result.errors);

        // if this is a serial loop iteration,
        // if there are errors we stop the loop
        if (!this.parallel) { return; }
      }

      if (loopResult.payload) {
        if (!this.parallel) { payload = loopResult.payload; }
        if (mapResult) {
          const loopMapVal = payloadHelper.lookup(
            loopResult.mapValuePath || this.mapValuePath || this.currentItemPath,
            loopResult.payload
          );
          mapResult[itemIndex] = loopMapVal;
        }
      }

      if (!this.parallel && loopResult.break) { return; }

      return process();
    };

    const runsInParallel = this.parallel ? outerContext.maxConcurrentNodes : 1;
    await Promise.all(times(process, runsInParallel));

    if (hitTimeout) {
      throw errors.NodeTimeout({ title: 'Loop' });
    }

    if (this.mapResultPath) { payload = payloadHelper.set(this.mapResultPath, mapResult, payload); }
    return { payload, pathsCompleted, errors: loopErrors, mapResult };
  }

  emptyLoop(payload) {
    if (this.mapResultPath) { payload = payloadHelper.set(this.mapResultPath, [], payload); }
    return [this.leaveLoopIds, payload];
  }

  async run(context, payload) {
    if (context[`loopResult-${this.id}`]) {
      // This loop node is already running in this context. Re-entering it
      // would recurse forever, so it throws InfiniteLoop.
      throw errors.InfiniteLoop({ title: 'Loop Node' });
    }

    if (this.insideLoopIds.length === 0) { return this.emptyLoop(payload); }
    const source = payloadHelper.lookup(this.loopSourcePath, payload);
    const loopItems = this.sourceToLoopItems(source);
    if (loopItems.length === 0) { return this.emptyLoop(payload); }

    const loopResult = await this.runLoop(context, payload, loopItems);
    if (loopResult.errors.length > 0) {
      return [null, null, loopResult.errors];
    } else {
      return [this.leaveLoopIds, loopResult.payload];
    }
  }

}

export default LoopNode;
