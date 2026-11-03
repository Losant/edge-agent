import util from 'util';
import zlib from 'zlib';
import { ObjectId } from './bson.js';
import LJSONLite from './ljson-lite.js';

// NOTE the entire point of the split between this file and ljson-lite
// is so ljson-lite does not need to import bson (and therefore mongo)

const gunzip = util.promisify(zlib.gunzip);
const gzip = util.promisify(zlib.gzip);

const extraTypesConverter = (value) => {
  if (value.$oid) {
    return new ObjectId(value.$oid);
  }
  if (value.$regex) {
    return new RegExp(value.$regex, value.$options);
  }
  return value;
};

const parse = (value, opts = {}) => {
  return LJSONLite.parse(value, { extraTypesConverter: opts.extraTypes && extraTypesConverter });
};

const safeParse = (value, opts = {}) => {
  try { value = parse(String(value || ''), opts); } catch { }
  return value;
};

const deflate = async (value, opts = {}) => {
  return gzip(LJSONLite.stringify(value, opts));
};

const inflate = async (value, opts = {}) => {
  try { value = await gunzip(value); } catch { }
  return opts.safe ? safeParse(value, opts) : parse(value, opts);
};

export default {
  dateReviver: LJSONLite.dateReviver,
  stringify: LJSONLite.stringify,
  parse,
  safeParse,
  deflate,
  inflate
};
