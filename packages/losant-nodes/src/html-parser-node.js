import * as payloadHelper from 'losant-handlebars';
import { parseDocument } from 'htmlparser2';
import { load as cheerioLoad } from 'cheerio';
import xmlJs from 'xml-js';

const XML_JS_OPTIONS = {
  compact: false,
  alwaysChildren: true,
  elementsKey: 'children',
  textKey: 'value',
  cdataKey: 'value',
  commentKey: 'value'
};

class HtmlParserNode {

  /* Example Config:
  {
    documentPath: <String - Required: Payload path to the source HTML/XML string to parse>,
    selectorTemplate: <String - Optional: Template for a selector to execute against the HTML/XML. If omitted, the whole document is selected>,
    resultFormatTemplate: <String - Optional: Template for the format of each result item. One of text, xml, html, or json. Default text>,
    resultPath: <String - Required: Payload path where the result is written>
  }
  Notes:
    Result: The result is always an array with one item per element matched by the selector. Items are strings for
      the text, xml and html formats (html is produced the same way as xml), and objects for the json format.
      An empty array is written if the document is missing or empty, or if the selector is invalid or matches nothing.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.documentPath = config.documentPath;
    this.selectorTemplate = config.selectorTemplate;
    this.resultFormatTemplate = config.resultFormatTemplate;
    this.resultPath = config.resultPath;
  }

  run(context, payload) {
    let document = payloadHelper.lookup(this.documentPath, payload);
    if (!document) {
      if (this.resultPath) { payload = payloadHelper.set(this.resultPath, [], payload); }
      return [this.outputIds, payload];
    }

    let selector;
    if (this.selectorTemplate) {
      selector = payloadHelper.renderToString(this.selectorTemplate, payload).trim();
    }

    let format;
    if (this.resultFormatTemplate) {
      format = payloadHelper.renderToString(this.resultFormatTemplate, payload)
        .trim().toLowerCase();
    }
    // only decode entities in the text case
    // It is technically incorrect to decode in the xml/html case
    // and in the JSON case xmlJs decodes them
    const opts =  { xmlMode: true, decodeEntities: format === 'text' };
    const dom = parseDocument(String(document), opts);
    document = cheerioLoad(dom, opts);

    let selection;
    try {
      selection = selector ? document(selector) : document.root();
      selection = selection.toArray();
    } catch {
      selection = [];
    }

    let result;
    if (format === 'json') {
      result = selection.map((element) => {
        try {
          return xmlJs.xml2js(document.xml(element), XML_JS_OPTIONS);
        } catch {
          return {};
        }
      });
    } else if (format === 'xml' || format === 'html') {
      result = selection.map((element) => {
        return document.xml(element);
      });
    } else {
      result = selection.map((element) => {
        return document.text([element]);
      });
    }

    if (this.resultPath) { payload = payloadHelper.set(this.resultPath, result, payload); }
    return [this.outputIds, payload];
  }

}

export default HtmlParserNode;
