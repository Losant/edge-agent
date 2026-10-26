import './common.js';
import CSVDecodeNode from '../src/csv-decode-node.js';
import { csvStringifyP } from 'losant-nodejs-utils/src/csv.js';

describe('CSVDecodeNode', () => {
  it('should correctly with quotes and spaces between items', async () => {
    const node = new CSVDecodeNode('id', [[4]], {
      source: 'data.in',
      destination: 'data.out'
    });

    const csv = '"Month" , "1958" , "1959" , "1960" \n\n\n\n\n "JAN",  340,  360,  417\n"FEB",  318,  342,  391\n"MAR",  362,  406,  419\n"APR",  348,  396,  461\n"MAY",  363,  420,  472\n"JUN",  435,  472,  535\n"JUL",  491,  548,  622\n"AUG",  505,  559,  606\n"SEP",  404,  463,  508\n"OCT",  359,  407,  461\n"NOV",  310,  362,  390\n"DEC",  337,  405,  432\n\n';
    const results = await node.run({}, { data: { in: csv } });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      data: {
        in: csv,
        out: [
          { 1958: '340', 1959: '360', 1960: '417', Month: 'JAN' },
          { 1958: '318', 1959: '342', 1960: '391', Month: 'FEB' },
          { 1958: '362', 1959: '406', 1960: '419', Month: 'MAR' },
          { 1958: '348', 1959: '396', 1960: '461', Month: 'APR' },
          { 1958: '363', 1959: '420', 1960: '472', Month: 'MAY' },
          { 1958: '435', 1959: '472', 1960: '535', Month: 'JUN' },
          { 1958: '491', 1959: '548', 1960: '622', Month: 'JUL' },
          { 1958: '505', 1959: '559', 1960: '606', Month: 'AUG' },
          { 1958: '404', 1959: '463', 1960: '508', Month: 'SEP' },
          { 1958: '359', 1959: '407', 1960: '461', Month: 'OCT' },
          { 1958: '310', 1959: '362', 1960: '390', Month: 'NOV' },
          { 1958: '337', 1959: '405', 1960: '432', Month: 'DEC' }
        ]
      }
    });
  });

  it('should correctly decode with default options', async () => {
    const node = new CSVDecodeNode('id', [[4]], {
      source: 'data.in',
      destination: 'data.out'
    });
    const csv = 'fieldOne,fieldTwo\nme,you';
    const obj = {
      fieldOne: 'me',
      fieldTwo: 'you'
    };

    const results = await node.run({}, { data: { in: csv } });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({ data: { in: csv, out: [obj] } });
  });

  it('should correctly decode with custom options', async () => {
    const node = new CSVDecodeNode('id', [[4]], {
      source: 'data.in',
      destination: 'data.out',
      delimiterTemplate: ':',
      recordDelimiterTemplate: '\n',
      quoteCharTemplate: '^',
      escapeCharTemplate: '*'
    });
    const csv = 'fieldOne:fieldTwo\n^me^:^*^you*^^\n';
    const obj = {
      fieldOne: 'me',
      fieldTwo: '^you^'
    };
    const results = await node.run({}, { data: { in: csv } });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({ data: { in: csv, out: [obj] } });
  });

  it('should correctly decode cvs-stringify output', async () => {
    const node = new CSVDecodeNode('id', [[4]], {
      source: 'data.in',
      destination: 'data.out'
    });

    const obj = {
      fieldOne: 'me',
      fieldTwo: 'you'
    };

    const csv = await csvStringifyP([obj], { header: true });
    const results = await node.run({}, { data: { in: csv } });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({ data: { in: csv, out: [obj] } });
  });

  it('should strip the BOM when asked', async () => {
    const csv = '\ufeffa,b\n1,2';

    let node = new CSVDecodeNode('id', [[4]], {
      source: 'data.in',
      destination: 'data.out'
    });
    let results = await node.run({}, { data: { in: csv } });
    results[1].should.deepEqual({ data: { in: csv, out: [{ '\ufeffa': '1', 'b': '2' }] } });

    node = new CSVDecodeNode('id', [[4]], {
      source: 'data.in',
      destination: 'data.out',
      stripBom: true
    });
    results = await node.run({}, { data: { in: csv } });
    results[1].should.deepEqual({ data: { in: csv, out: [{ a: '1', b: '2' }] } });
  });

  it('should place decoding errors on the payload', async () => {
    const node = new CSVDecodeNode('id', [[4]], {
      source: 'in',
      destination: 'out'
    });
    const csv = 'fieldOne,fieldTwo""""me,you';

    const results = await node.run({}, { in: csv });
    results[1].out.should.deepEqual({ error: { message: 'Invalid Opening Quote: a quote is found on field 1 at line 1, value is "fieldTwo"' } });
  });

  it('should correctly error on invalid input', async () => {
    const node = new CSVDecodeNode('id', [[4]], {
      source: 'data.in',
      destination: 'data.out'
    });

    const result = await node.run({}, { data: { in: 66 } });
    result[1].data.out.should.deepEqual( { error: { type: 'InvalidType', message: 'Type of input is invalid (expected String but got Number)' } });
  });
});

