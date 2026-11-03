import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import { VALID_RECORD_DELIMITERS } from './lib/constants.js';
import { csvStringifyP } from 'losant-nodejs-utils/src/csv.js';
import { mapRejectNil } from 'omnibelt';

const blacklist = new Set(['\\', '|', '[', ']', '{', '}', '(', ')', '.', '?', '+', '$', '*', '^']);

class CSVEncodeNode {

  /* Example Config:
  {
    source: <String - Required: payload path of an array of rows to encode. Each row may be an object or an array. Empty rows are dropped>,
    destination: <String - Required: payload path for the encoded CSV string, or { error: { message, type? } } on failure>,
    headerTemplateType: <String - Optional: how headerTemplate is interpreted, one of stringTemplates or payloadPath. When omitted, headerTemplate is ignored and the columns option is left undefined, so the keys of the row objects are used as headers>,
    headerTemplate: <Array|String - Required when headerTemplateType is set: for stringTemplates, an array of header templates; for payloadPath, a payload path to an array of headers>,
    delimiterTemplate: <String - Optional: single character that separates fields. Default is the encoder default, a comma>,
    recordDelimiterTemplate: <String - Optional: record delimiter, one of \n, \r, or \r\n. Default is the encoder default>,
    quoteCharTemplate: <String - Optional: single character to use in place of double quotes. Cannot be a regular expression special character>,
    escapeCharTemplate: <String - Optional: single character used to escape the quote character. Cannot be a regular expression special character>
  }
  Notes:
    A header row is always written.
    A missing or non-array headerTemplate, or an invalid delimiter, quote, escape, or record delimiter value, throws.
    A source that is not an array, a row that is not an object or array, or any encoding error does not throw. The error is written to destination as { error: { message } }, plus error.type when the error has one.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.source = config.source;
    this.destination = config.destination;
    this.headerTemplateType = config.headerTemplateType;
    this.headerTemplate = config.headerTemplate;
    this.delimiterTemplate = config.delimiterTemplate;
    this.quoteCharTemplate = config.quoteCharTemplate;
    this.escapeCharTemplate = config.escapeCharTemplate;
    this.recordDelimiterTemplate = config.recordDelimiterTemplate;
  }

  async run(context, payload) {
    let headers;
    const CSVOpts = {
      header: true
    };

    const delimiterTemp = payloadHelper.renderToString(this.delimiterTemplate, payload);
    if (delimiterTemp.length !== 1) {
      if (delimiterTemp) {
        throw errors.Validation({ message: 'Expected a single character for delimiter' });
      }
    } else {
      CSVOpts.delimiter = delimiterTemp;
    }
    const quoteCharTemp = payloadHelper.renderToString(this.quoteCharTemplate, payload);
    if (quoteCharTemp.length !== 1) {
      if (quoteCharTemp) {
        throw errors.Validation({ message: 'Expected a single character for quote character' });
      }
    } else {
      if (blacklist.has(quoteCharTemp)) {
        throw errors.Validation({ message: `Invalid quote char: ${quoteCharTemp}` } );
      }
      CSVOpts.quote = quoteCharTemp;
    }
    const escapeCharTemp = payloadHelper.renderToString(this.escapeCharTemplate, payload);
    if (escapeCharTemp.length !== 1) {
      if (escapeCharTemp) {
        throw errors.Validation({ message: 'Expected single character for escape character' });
      }
    } else {
      if (blacklist.has(escapeCharTemp)) {
        throw errors.Validation({ message: `Invalid escape char: ${escapeCharTemp}` } );
      }
      CSVOpts.escape = escapeCharTemp;
    }
    const recordDelimiterTemp  = payloadHelper.renderToString(this.recordDelimiterTemplate, payload);
    if (!(VALID_RECORD_DELIMITERS.includes(recordDelimiterTemp))) {
      if (recordDelimiterTemp) {
        throw errors.Validation({ message: 'Expected \\n, \\r, or \\r\\n for record delimiter' });
      }
    } else {
      CSVOpts.recordDelimiter = recordDelimiterTemp;
    }

    // With no headerTemplateType, the columns option stays undefined and
    // csv-stringify uses the object keys as the headers.
    if (this.headerTemplateType === 'stringTemplates') {
      if (!this.headerTemplate || !this.headerTemplate.length) {
        throw errors.MissingField( { title: 'headers' } );
      }
      if (!Array.isArray(this.headerTemplate)) {
        throw errors.InvalidType({
          title: 'headerTemplate',
          expectedType: 'Array',
          value: this.headerTemplate
        });
      }
      headers = this.headerTemplate.map((headerTemp) => { return payloadHelper.renderToString(headerTemp, payload); });
    } else if (this.headerTemplateType === 'payloadPath') {
      if (!this.headerTemplate || !this.headerTemplate.length) {
        throw errors.MissingField( { title: 'headers' } );
      }
      headers = payloadHelper.lookup(this.headerTemplate, payload);
      if (!Array.isArray(headers)) {
        throw errors.InvalidType({
          title: 'headers',
          expectedType: 'Array',
          value: headers
        });
      }
      headers = headers.map(String);
    }
    CSVOpts.columns = headers;
    let result = {};
    try {
      let data = payloadHelper.lookup(this.source, payload);
      if (!Array.isArray(data)) {
        throw errors.InvalidType({
          title: 'input',
          expectedType: 'Array',
          value: data
        });
      }

      // in certain cases csv-stringify mutates incoming
      // rows that are in array form
      data = mapRejectNil((row) => {
        if (!row) { return; } // drop empty rows
        if (typeof(row) !== 'object') {
          throw errors.InvalidType({
            title: 'input row',
            expectedType: 'Array or Object',
            value: row
          });
        }

        return Array.isArray(row) ? row.slice() : row;
      }, data);

      result = await csvStringifyP(data, CSVOpts);
    } catch (e) {
      result = { error: { message: e.message } };
      if (e.type) { result.error.type = e.type; }
    }
    payload = payloadHelper.set(this.destination, result, payload);
    return [this.outputIds, payload];
  }
}

export default CSVEncodeNode;
