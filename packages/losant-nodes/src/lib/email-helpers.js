import addressparser from 'addressparser';
import { uniqBy, prop, toString, flatten, includes, forEachSerialP } from 'omnibelt';
import * as payloadHelper from 'losant-handlebars';
import { contentTypeFromFilename, MAX_RESPONSE_SIZE, MAX_RESPONSE_SIZE_DISPLAY_MB } from 'losant-nodejs-utils/src/utils/storage-helpers.js';
import isBase64 from 'is-base64';
import axios from 'losant-nodejs-utils/src/axios.js';
import path from 'node:path';
import cleanError from 'losant-nodejs-utils/src/utils/clean-error.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import { isTimeoutError } from './common.js';

const MAX_ATTACHMENTS = 10;

export const renderAddresses = (addressAry, payload) => {
  if (!Array.isArray(addressAry)) { addressAry = [addressAry]; }
  const addressValues = [];

  addressAry = addressAry.map((addrTemplate) => {
    return payloadHelper.render(addrTemplate, payload);
  });

  const captureAddresses = (parsedAddr) => {
    if (parsedAddr.group) {
      parsedAddr.group.forEach(captureAddresses);
    } else if (parsedAddr.address) {
      const addr = { email: parsedAddr.address };
      if (parsedAddr.name) { addr.name = parsedAddr.name; }
      addressValues.push(addr);
    }
  };

  flatten(addressAry).forEach((addressValue) => {
    addressValue = toString(addressValue);
    if (!addressValue) { return; }
    addressparser(addressValue).forEach(captureAddresses);
  });

  return uniqBy(prop('email'), addressValues);
};

export const resolveAttachments = async (node, context, payload, nodeTitle) => {
  if (!Array.isArray(node.attachments) || !node.attachments.length) {
    return { attachments: [], timeLeft: context.externalTimeout };
  }

  if (node.attachments.length > MAX_ATTACHMENTS) {
    throw errors.Validation({
      message: `Maximum number of attachments is ${MAX_ATTACHMENTS}.`
    });
  }

  let sizeLeft = MAX_RESPONSE_SIZE;
  let timeLeft = context.externalTimeout;
  const now = Date.now();
  let nameIndex = 0;
  const resolvedAttachments = [];
  await forEachSerialP(async (attachment) => {
    let filename = payloadHelper.renderToString(attachment.filenameTemplate, payload);
    let content;
    let contentType;

    if (attachment.contentTemplate) {
      content = payloadHelper.renderToString(attachment.contentTemplate, payload);
      if (!content) { return; }
      if (!isBase64(content)) {
        content = Buffer.from(content, 'binary').toString('base64');
      }
    } else if (attachment.urlTemplate) {
      const url = payloadHelper.renderToString(attachment.urlTemplate, payload);
      if (!url) { return; }

      try {
        const response = await axios({
          responseEncoding: 'base64',
          url,
          method: 'GET',
          timeout: timeLeft,
          maxContentLength: sizeLeft
        });
        content = response.data;
        contentType = response.headers['content-type'];
      } catch (err) {
        if (isTimeoutError(err)) {
          throw errors.NodeTimeout({ title: nodeTitle });
        } else if (includes('maxContentLength', err.message)) {
          throw errors.TooLarge({
            maximum: MAX_RESPONSE_SIZE_DISPLAY_MB,
            size: MAX_RESPONSE_SIZE_DISPLAY_MB,
            title: 'Attachments'
          });
        } else {
          if (err.name !== 'ValidationError') {
            err.name = `${nodeTitle}${err.name}`;
          }
          throw cleanError(err);
        }
      }

      if (!filename) {
        filename = path.basename((new URL(url)).pathname);
      }
    } else {
      return;
    }

    sizeLeft -= content.length;
    if (sizeLeft < 0) {
      throw errors.TooLarge({
        maximum: MAX_RESPONSE_SIZE_DISPLAY_MB,
        size: MAX_RESPONSE_SIZE_DISPLAY_MB,
        title: 'Attachments'
      });
    }

    timeLeft = context.externalTimeout - (Date.now() - now);
    if (timeLeft < 0) {
      throw errors.NodeTimeout({ title: nodeTitle });
    }

    if (!filename) { filename = `attachment-${nameIndex++}.bin`; }

    resolvedAttachments.push({
      content,
      filename,
      type: contentType || contentTypeFromFilename(filename)
    });
  }, node.attachments);

  return { attachments: resolvedAttachments, timeLeft };
};
