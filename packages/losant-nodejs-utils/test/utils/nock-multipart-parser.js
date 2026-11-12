import { defer } from 'omnibelt';
import Subtext from '@hapi/subtext';
import Wreck from '@hapi/wreck';

export default () => {
  const deferred = defer();
  const onReplied = async (req) => {
    const body = await req.text();
    const readable = Wreck.toReadableStream(body);
    readable.headers = Object.fromEntries(req.headers.entries());
    const parsed = await Subtext.parse(readable, null, {
      output: 'data',
      parse: true,
      multipart: { output: 'annotated' }
    });
    deferred.resolve(parsed.payload);
  };

  return { bodyPromise: deferred.promise, onReplied };
};
