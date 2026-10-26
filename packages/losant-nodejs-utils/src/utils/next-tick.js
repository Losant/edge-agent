// https://snyk.io/blog/nodejs-how-even-quick-async-functions-can-block-the-event-loop-starve-io/
// https://nodejs.org/en/docs/guides/dont-block-the-event-loop/

// await Promise.resolve(), or awaiting a an async method that does not actually have any
// real "async" in it will not actually wait for an event loop cycle. This leads to code that
// "reads" like it won't be blocking, but in the end does end up blocking.

// below is the minimum needed to get node.js to actually let the event loop cycle

// implementation using raw promises
// const innerFunc = (resolve) => setImmediate(resolve);
// export default () => new Promise(innerFunc);

import util from 'util';
export default util.promisify(setImmediate);
