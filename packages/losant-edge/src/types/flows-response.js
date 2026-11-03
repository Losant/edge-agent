import t from 'tcomb';
import { ObjectIdStr } from './lib/refinements.js';

const FlowsResponse = t.dict(
  ObjectIdStr,
  // using interface instead of struct doesn't force the maybes to be set as undefined
  t.interface({
    previousVersion: t.maybe(t.String),
    newVersion: t.maybe(t.String),
    previousEtag: t.maybe(t.String),
    newEtag: t.maybe(t.String),
    fileName: t.maybe(t.String),
    attemptedVersion: t.maybe(t.String),
    attemptedEtag: t.maybe(t.String),
    error: t.maybe(t.String)
  }, {
    name: 'FlowResponse',
    strict: true
  })
);

export default FlowsResponse;
