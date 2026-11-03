import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import { VALID_RECORD_DELIMITERS } from './lib/constants.js';
import { csvParseP } from 'losant-nodejs-utils/src/csv.js';

class CSVDecodeNode {

  /* Example Config:
  {
    source: <String - Required: payload path of the string to decode>,
    destination: <String - Required: payload path for the decoded array of row objects, keyed by the header row, or { error: { message, type? } } on a parse failure>,
    delimiterTemplate: <String - Optional: single character that separates fields. Default is the parser default, a comma>,
    recordDelimiterTemplate: <String - Optional: record delimiter, one of \n, \r, or \r\n. Default is auto-detected>,
    quoteCharTemplate: <String - Optional: single character to use in place of double quotes>,
    escapeCharTemplate: <String - Optional: single character used to escape the quote character>,
    stripBom: <Boolean - Optional: whether to strip a leading byte order mark from the input. Default false>
  }
  Notes:
    The first row of the input is always treated as the header row. Empty lines are skipped, values are trimmed, and rows with a differing column count are accepted.
    An invalid delimiter, quote, escape, or record delimiter value throws.
    A source that is not a string, or any parse error, does not throw. The error is written to destination as { error: { message } }, plus error.type when the error has one.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.source = config.source;
    this.destination = config.destination;
    this.delimiterTemplate = config.delimiterTemplate;
    this.quoteCharTemplate = config.quoteCharTemplate;
    this.escapeCharTemplate = config.escapeCharTemplate;
    this.recordDelimiterTemplate = config.recordDelimiterTemplate;
    this.stripBom = !!config.stripBom;
  }

  async run(context, payload) {
    const CSVOpts = {
      columns: true,
      skip_empty_lines: true,
      trim: true,
      relax_column_count: true,
      bom: this.stripBom
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
      CSVOpts.quote = quoteCharTemp;
    }
    const escapeCharTemp = payloadHelper.renderToString(this.escapeCharTemplate, payload);
    if (escapeCharTemp.length !== 1) {
      if (escapeCharTemp) {
        throw errors.Validation({ message: 'Expected single character for escape character' });
      }
    } else {
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

    let result = {};
    try {
      const data = payloadHelper.lookup(this.source, payload);
      if (typeof data !== 'string') {
        throw errors.InvalidType({
          title: 'input',
          expectedType: 'String',
          value: data
        });
      }
      result = await csvParseP(data, CSVOpts);
    } catch (e) {
      result = { error: { message: e.message } };
      if (e.type) { result.error.type = e.type; }
    }
    payload = payloadHelper.set(this.destination, result, payload);
    return [this.outputIds, payload];
  }
}

export default CSVDecodeNode;
