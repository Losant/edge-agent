// C0 control chars + DEL, plus a few unicode separators (NEL U+0085,
// LINE SEPARATOR U+2028, PARAGRAPH SEPARATOR U+2029) that have no legitimate
// place in a printable string field. Used to validate user-supplied
// identifiers, names, paths, and certificate subject fields.
// eslint-disable-next-line no-control-regex
const NON_PRINTABLE_REGEX = /[\x00-\x1F\x7F\u0085\u2028\u2029]/;
const NON_PRINTABLE_REGEX_GLOBAL = new RegExp(NON_PRINTABLE_REGEX, 'g');

export const hasNonPrintableChars = (str) => NON_PRINTABLE_REGEX.test(str);

export const singleLinePrintable = (str) => str.replaceAll(NON_PRINTABLE_REGEX_GLOBAL, ' ');
