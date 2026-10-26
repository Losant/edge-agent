import axios from 'losant-nodejs-utils/src/axios.js';
import { isNilOrEmpty } from 'omnibelt';

const HOST = 'logs-01.loggly.com';
const LOG_URL = `https://${HOST}/inputs/`;

export default async ({ token, msg = '', json, tags = [], timeout } = {}) => {
  let data = msg;

  if (!isNilOrEmpty(json)) {
    data = `${data}${JSON.stringify(json)}`;
  }

  const headers = {
    'host': HOST,
    'accept': '*/*',
    'content-type': 'text/plain'
  };

  if (tags.length) {
    headers['X-LOGGLY-TAG'] = tags.join(',');
  }

  return axios({
    method: 'POST',
    url: `${LOG_URL}${token}`,
    headers,
    data,
    timeout
  });
};
