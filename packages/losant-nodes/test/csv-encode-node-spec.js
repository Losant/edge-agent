import './common.js';
import CSVEncodeNode from '../src/csv-encode-node.js';
import { csvParseP } from 'losant-nodejs-utils/src/csv.js';

describe('CSVEncodeNode', () => {
  it('should correctly use default options', async () => {
    const node = new CSVEncodeNode('id', [[4]], {
      source: 'data.in',
      destination: 'data.out'
    });

    const csv = 'fieldOne,fieldTwo\n1,2\n';
    const obj = {
      fieldOne: 1,
      fieldTwo: 2
    };
    const results = await node.run({}, { data: { in: [obj] } });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({ data: { in: [obj], out: csv } });
  });

  it('should correctly drop falsy rows', async () => {
    const node = new CSVEncodeNode('id', [[4]], {
      source: 'data.in',
      destination: 'data.out'
    });

    const csv = 'fieldOne,fieldTwo\n1,2\n1,2\n';
    const obj = {
      fieldOne: 1,
      fieldTwo: 2
    };
    const results = await node.run({}, { data: { in: [obj, null, false, '', undefined, obj] } });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({ data: { in: [obj, null, false, '', undefined, obj], out: csv } });
  });

  it('should correctly encode a mix of arrays and objects', async () => {
    const node = new CSVEncodeNode('id', [[4]], {
      source: 'data.in',
      destination: 'data.out',
      headerTemplateType: 'stringTemplates',
      headerTemplate: ['fieldOne', 'fieldTwo']
    });

    const csv = 'fieldOne,fieldTwo\n1,2\n4,5\n7,8\n10,11\n';
    const inRows = [
      { fieldOne: 1, fieldTwo: 2, other: 3 },
      [4, 5, 6],
      { fieldOne: '7', fieldTwo: '8', other: '9' },
      ['10', '11', '12']
    ];
    const results = await node.run({}, { data: { in: inRows } });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({ data: { in: inRows, out: csv } });
  });

  it('should correctly encode using custom options', async () => {
    const node = new CSVEncodeNode('id', [[4]], {
      source: 'data.in',
      destination: 'data.out',
      recordDelimiterTemplate: '\n',
      delimiterTemplate: ':',
      quoteCharTemplate: '%',
      escapeCharTemplate: '!'
    });

    const csv = 'fieldOne:fieldTwo\n1:%!%2!%%\n';
    const obj = {
      fieldOne: '1',
      fieldTwo: '%2%'
    };

    const results = await node.run({}, { data: { in: [obj] } });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({ data: { in: [obj], out: csv } });

  });
  it('should correctly encode using custom options from string templates', async () => {
    const node = new CSVEncodeNode('id', [[4]], {
      source: 'data.in',
      destination: 'data.out',
      recordDelimiterTemplate: '{{data.rDelim}}',
      delimiterTemplate: '{{data.delim}}',
      quoteCharTemplate: '{{data.quote}}',
      escapeCharTemplate: '{{data.esc}}'
    });

    const csv = 'fieldOne:fieldTwo\n1:%!%2!%%\n';
    const obj = {
      fieldOne: '1',
      fieldTwo: '%2%'
    };

    const results = await node.run({}, { data: { in: [obj], delim: ':', rDelim: '\n', quote: '%', esc: '!' } });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      data: {
        in: [obj], delim: ':', rDelim: '\n', quote: '%', esc: '!', out: csv
      }
    });
  });
  it('should correctly use default options when string template paths are empty', async () => {
    const node = new CSVEncodeNode('id', [[4]], {
      source: 'data.in',
      destination: 'data.out',
      recordDelimiterTemplate: '{{data.rDelim}}',
      delimiterTemplate: '{{data.delim}}',
      quoteCharTemplate: '{{data.quote}}',
      escapeCharTemplate: '{{data.esc}}'
    });

    const csv = 'fieldOne,fieldTwo\n1,^2^\n';
    const obj = {
      fieldOne: '1',
      fieldTwo: '^2^'
    };

    const results = await node.run({}, { data: { in: [obj], delim: '', rDelim: '', quote: '', esc: '' } });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      data: {
        in: [obj], delim: '', rDelim: '', quote: '', esc: '', out: csv
      }
    });
  });
  it('should correctly encode csv-parse output', async () => {
    const node = new CSVEncodeNode('id', [[4]], {
      source: 'data.in',
      destination: 'data.out'
    });

    const csv = 'fieldOne,fieldTwo\n1,2\n';
    const obj = await csvParseP(csv, { columns: true });

    const results = await node.run({}, { data: { in: obj } });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({ data: { in: obj, out: csv } });

  });
  it('should correctly use headers from string templates', async () => {
    const node = new CSVEncodeNode('id', [[4]], {
      source: 'data.in',
      destination: 'data.out',
      headerTemplateType: 'stringTemplates',
      headerTemplate: ['{{data.header}}', '{{data.foo}}']
    });

    const csv = 'fieldOne,fieldTwo\n1,2\n';
    const obj = {
      fieldOne: 1,
      fieldTwo: 2
    };

    const results = await node.run({}, { data: { in: [obj], header: ['fieldOne'], foo: ['fieldTwo'] } });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({ data: { in: [obj], header: ['fieldOne'], foo: ['fieldTwo'], out: csv } });
  });
  it('should correctly use headers from payload path', async () => {
    const node = new CSVEncodeNode('id', [[4]], {
      source: 'data.in',
      destination: 'data.out',
      headerTemplateType: 'payloadPath',
      headerTemplate: 'data.header'
    });

    const csv = 'fieldOne\n1\n';
    const obj = {
      fieldOne: 1,
      fieldTwo: 2
    };

    const results = await node.run({}, { data: { in: [obj], header: ['fieldOne'] } });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({ data: { in: [obj], header: ['fieldOne'], out: csv } });

  });
  it('should correctly convert non-string headers', async () => {
    const node = new CSVEncodeNode('id', [[4]], {
      source: 'data.in',
      destination: 'data.out',
      headerTemplateType: 'payloadPath',
      headerTemplate: 'data.head'
    });

    const csv = '1,2,three\n1,2,3\n';
    const obj = {
      1: 1,
      2: 2,
      three: 3,
      4: 4
    };

    let results = await node.run({}, { data: { in: [obj], head: [1, 2, 'three'] } });
    results[1].should.deepEqual({ data: { in: [obj], head: [1, 2, 'three'], out: csv } });

    node.headerTemplateType = 'stringTemplates';
    node.headerTemplate = ['{{data.head}}', '{{data.head2}}', '{{data.head3}}'];
    results = await node.run({}, { data: { in: [obj], head: 1, head2: 2, head3: 'three' } });
    results[1].should.deepEqual( { data: { in: [obj], head: 1, head2: 2, head3: 'three', out: csv } });

  });
  describe('errors', () => {
    it('should throw an error if headerTemplate is invalid (payloadPath)', async () => {
      const node = new CSVEncodeNode('id', [[4]], {
        source: 'data.in',
        destination: 'data.out',
        headerTemplateType: 'payloadPath',
        headerTemplate: 'data.head'
      });
      const obj = {
        fieldOne: 1,
        fieldTwo: 2
      };
      await node.run({}, { data: { in: [obj], head: 'notanarray' } }).should.be.rejectedWith({
        type: 'InvalidType'
      });
    });

    it('should throw an error if headerTemplate is invalid (stringTemplate)', async () => {
      const node = new CSVEncodeNode('id', [[4]], {
        source: 'data.in',
        destination: 'data.out',
        headerTemplateType: 'stringTemplates',
        headerTemplate: []
      });
      const obj = {
        fieldOne: 1,
        fieldTwo: 2
      };
      await node.run({}, { data: { in: [obj], header: 'fieldOne' } }).should.be.rejectedWith({
        type: 'MissingField'
      });
    });

    it('should throw an error if headerTemplate is missing (payloadPath)', async () => {
      const node = new CSVEncodeNode('id', [[4]], {
        source: 'data.in',
        destination: 'data.out',
        headerTemplateType: 'payloadPath'
      });
      const obj = {
        fieldOne: 1,
        fieldTwo: 2
      };
      await node.run({}, { data: { in: [obj], header: ['fieldOne'] } }).should.be.rejectedWith({
        type: 'MissingField'
      });
    });

    it('should throw an error if headerTemplate is missing stringTemplate)', async () => {
      const node = new CSVEncodeNode('id', [[4]], {
        source: 'data.in',
        destination: 'data.out',
        headerTemplateType: 'stringTemplates'
      });
      const obj = {
        fieldOne: 1,
        fieldTwo: 2
      };
      await node.run({}, { data: { in: [obj], header: 'fieldOne' } }).should.be.rejectedWith({
        type: 'MissingField'
      });
    });
    it('should throw an error if quote char is a regex metacharacter', async () => {
      const node = new CSVEncodeNode('id', [[4]], {
        source: 'data.in',
        destination: 'data.out',
        recordDelimiterTemplate: '\n',
        delimiterTemplate: ':',
        quoteCharTemplate: '^',
        escapeCharTemplate: '!'
      });

      const obj = {
        fieldOne: '1',
        fieldTwo: '^2^'
      };

      await node.run({}, { data: { in: [obj] } }).should.be.rejectedWith({
        message: 'Invalid quote char: ^'
      });

    });
    it('should throw an error if escape char is a regex metacharacter', async () => {
      const node = new CSVEncodeNode('id', [[4]], {
        source: 'data.in',
        destination: 'data.out',
        recordDelimiterTemplate: '\n',
        delimiterTemplate: ':',
        quoteCharTemplate: '%',
        escapeCharTemplate: '*'
      });

      const obj = {
        fieldOne: '1',
        fieldTwo: '^2^'
      };

      await node.run({}, { data: { in: [obj] } }).should.be.rejectedWith({
        message: 'Invalid escape char: *'
      });
    });

    it('should throw an error if stringTemplates is not given an array', async () => {
      const node = new CSVEncodeNode('id', [[4]], {
        source: 'data.in',
        destination: 'data.out',
        headerTemplateType: 'stringTemplates',
        headerTemplate: '{{data.header}}'
      });

      const obj = {
        fieldOne: 1,
        fieldTwo: 2
      };

      await node.run({}, { data: { in: [obj], header: ['fieldOne'], foo: ['fieldTwo'] } }).should.be.rejectedWith({
        type: 'InvalidType'
      });
    });

    it('should correctly error on invalid input rows', async () => {
      const node = new CSVEncodeNode('id', [[4]], {
        source: 'in',
        destination: 'out'
      });

      const obj = 'notJson';
      const results = await node.run({}, { in: [obj] });
      results[1].out.should.deepEqual({ error: { type: 'InvalidType', message: 'Type of input row is invalid (expected Array or Object but got String)' } });
    });

    it('should correctly error on invalid input', async () => {
      const node = new CSVEncodeNode('id', [[4]], {
        source: 'data.in',
        destination: 'data.out'
      });

      const result = await node.run({}, { data: { in: 66 } });
      result[1].data.out.should.deepEqual( { error: { type: 'InvalidType', message: 'Type of input is invalid (expected Array but got Number)' } });
    });
  });
});
