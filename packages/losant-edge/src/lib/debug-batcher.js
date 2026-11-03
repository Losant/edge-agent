import { unnest, compose, invoker } from 'omnibelt';

const MAX_QUEUED_PER_FLOW = 5;
const BATCH_TIME = 1000;

const flatMapValues = compose(unnest, Array.from, invoker(0, 'values'));

// :: ([Payload] -> *) -> Payload -> Nil
export default (dataCallback) => {
  let lastDispatch = 0;
  let timeoutId = null;
  let queueByFlow = new Map();

  const batchFunc = () => {
    timeoutId = null;
    lastDispatch = Date.now();
    const queueToSend = queueByFlow;
    queueByFlow = new Map();
    dataCallback(flatMapValues(queueToSend));
  };

  return (msg) => {
    const now = Date.now();
    if (!timeoutId && now - lastDispatch < BATCH_TIME) {
      timeoutId = setTimeout(batchFunc, BATCH_TIME);
    }

    if (timeoutId) {
      const flowId = msg.flowId;
      if (!queueByFlow.has(flowId)) { queueByFlow.set(flowId, []); }
      const flowQueue = queueByFlow.get(flowId);
      if (flowQueue.length < MAX_QUEUED_PER_FLOW) { flowQueue.push(msg); }
    } else {
      lastDispatch = now;
      dataCallback([msg]);
    }
  };
};
