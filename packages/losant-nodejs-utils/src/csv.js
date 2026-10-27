import util from 'util';
import { parse as csvParse } from 'csv-parse';
import { stringify as csvStringify } from 'csv-stringify';

const csvStringifyP = util.promisify(csvStringify);
const csvParseP = util.promisify(csvParse);

export { csvParseP, csvStringifyP };

