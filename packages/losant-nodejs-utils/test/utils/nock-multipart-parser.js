import { defer } from 'omnibelt';
import Subtext from '@hapi/subtext';
import Wreck from '@hapi/wreck';

export default () => {
  const deferred = defer();
  const nockFunc = function(body) {
    deferred.resolve([body, this.headers]);
    return true;
  };

  const chain = deferred.promise.then(async ([body, headers]) => {
    const readable = Wreck.toReadableStream(body);
    readable.headers = headers;
    const parsed = await Subtext.parse(readable, null, {
      output: 'data',
      parse: true,
      multipart: { output: 'annotated' }
    });
    return parsed.payload;
  });

  return { bodyPromise: chain, nockFunc };
};
