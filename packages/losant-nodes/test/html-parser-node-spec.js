const sampleXml = `<?xml type="text/xsl" href="xml2json.xslt"?>
<reports ns="http://www.w3.org/2005/Atom" xmlns:georss="http://www.georss.org/georss">
    <entry>
        <id>tag:open311.sfgov.org,2010-04-15:/dev/V1/reports/637619.xml</id>
        <title>A large tree branch is blocking the road</title>
        <updated>2010-04-13T18:30:02-05:00</updated>
        <link rel="self" href="http://open311.sfgov.org/dev/V1/reports/637619.xml"/>
        <author>
            <name>John Doe</name>
        </author>
        <georss:point>40.7111 -73.9565</georss:point>
        <category label="Damaged tree" term="tree-damage" scheme="https://open311.sfgov.org/dev/V1/categories/006.xml">006</category>
        <content type="xml" ns="http://open311.org/spec/georeport-v1">
            <report_id>637619</report_id>
            <address>1600 Market St, San Francisco, CA 94103</address>
            <description>A large
                <bold>tree</bold> branch is
                <bold>blocking</bold> the road
            </description>
            <status>created</status>
            <status_notes/>
            <policy>The City will inspect and require the responsible party to correct within 24 hours and/or issue a Correction Notice or Notice of Violation of the Public Works Code</policy>
        </content>
    </entry>
    <entry>
        <id>tag:open311.sfgov.org,2010-04-15:/dev/V1/reports/637620.xml</id>
        <title>A large tree branch is blocking the road</title>
        <updated>2010-04-13T18:30:02-05:00</updated>
        <link rel="self" href="http://open311.sfgov.org/dev/V1/reports/637620.xml"/>
        <author id="uniq">
            <name>John Doe</name>
        </author>
        <georss:point>40.7111 -73.9565</georss:point>
        <category label="Damaged tree" term="tree-damage" scheme="https://open311.sfgov.org/dev/V1/categories/006.xml">006</category>
        <content type="xml" ns="http://open311.org/spec/georeport-v1">
            <report_id>637620</report_id>
            <address>56 Market St, San Francisco, CA 94103</address>
            <description>A large tree branch is blocking the road</description>
            <status>created</status>
            <status_notes/>
            <policy>The City will inspect and require the responsible party to correct within 24 hours and/or issue a Correction Notice or Notice of Violation of the Public Works Code</policy>
        </content>
    </entry>
    <entry>
        <id>tag:open311.sfgov.org,2010-04-15:/dev/V1/reports/637621.xml</id>
        <title>A large tree branch is blocking the road</title>
        <updated>2010-04-13T18:30:02-05:00</updated>
        <link rel="self" href="http://open311.sfgov.org/dev/V1/reports/637621.xml"/>
        <author>
            <name>John Doe</name>
        </author>
        <georss:point>40.7111 -73.9565</georss:point>
        <category label="Damaged tree" term="tree-damage" scheme="https://open311.sfgov.org/dev/V1/categories/006.xml">006</category>
        <content type="xml" ns="http://open311.org/spec/georeport-v1">
            <report_id>637621</report_id>
            <address>1800 Market St, San Francisco, CA 94103</address>
            <description>A large tree branch is blocking the road</description>
            <status>created</status>
            <status_notes/>
            <policy>The City will inspect and require the responsible party to correct within 24 hours and/or issue a Correction Notice or Notice of Violation of the Public Works Code</policy>
        </content>
    </entry>
</reports>`;

const asText = `
tag:open311.sfgov.org,2010-04-15:/dev/V1/reports/637619.xml
A large tree branch is blocking the road
2010-04-13T18:30:02-05:00
John Doe
40.7111 -73.9565
006
637619
1600 Market St, San Francisco, CA 94103
A large
tree branch is
blocking the road
created
The City will inspect and require the responsible party to correct within 24 hours and/or issue a Correction Notice or Notice of Violation of the Public Works Code
tag:open311.sfgov.org,2010-04-15:/dev/V1/reports/637620.xml
A large tree branch is blocking the road
2010-04-13T18:30:02-05:00
John Doe
40.7111 -73.9565
006
637620
56 Market St, San Francisco, CA 94103
A large tree branch is blocking the road
created
The City will inspect and require the responsible party to correct within 24 hours and/or issue a Correction Notice or Notice of Violation of the Public Works Code
tag:open311.sfgov.org,2010-04-15:/dev/V1/reports/637621.xml
A large tree branch is blocking the road
2010-04-13T18:30:02-05:00
John Doe
40.7111 -73.9565
006
637621
1800 Market St, San Francisco, CA 94103
A large tree branch is blocking the road
created
The City will inspect and require the responsible party to correct within 24 hours and/or issue a Correction Notice or Notice of Violation of the Public Works Code
`;

const asJson = {
  declaration: { attributes: { type: 'text/xsl', href: 'xml2json.xslt' } },
  children:
   [ {
     type: 'element',
     name: 'reports',
     attributes:
        {
          'ns': 'http://www.w3.org/2005/Atom',
          'xmlns:georss': 'http://www.georss.org/georss'
        },
     children:
        [ {
          type: 'element',
          name: 'entry',
          children:
             [ {
               type: 'element',
               name: 'id',
               children:
                  [ {
                    type: 'text',
                    value: 'tag:open311.sfgov.org,2010-04-15:/dev/V1/reports/637619.xml'
                  } ]
             },
             {
               type: 'element',
               name: 'title',
               children:
                  [ {
                    type: 'text',
                    value: 'A large tree branch is blocking the road'
                  } ]
             },
             {
               type: 'element',
               name: 'updated',
               children: [ { type: 'text', value: '2010-04-13T18:30:02-05:00' } ]
             },
             {
               type: 'element',
               name: 'link',
               attributes:
                  {
                    rel: 'self',
                    href: 'http://open311.sfgov.org/dev/V1/reports/637619.xml'
                  },
               children: []
             },
             {
               type: 'element',
               name: 'author',
               children:
                  [ {
                    type: 'element',
                    name: 'name',
                    children: [ { type: 'text', value: 'John Doe' } ]
                  } ]
             },
             {
               type: 'element',
               name: 'georss:point',
               children: [ { type: 'text', value: '40.7111 -73.9565' } ]
             },
             {
               type: 'element',
               name: 'category',
               attributes:
                  {
                    label: 'Damaged tree',
                    term: 'tree-damage',
                    scheme: 'https://open311.sfgov.org/dev/V1/categories/006.xml'
                  },
               children: [ { type: 'text', value: '006' } ]
             },
             {
               type: 'element',
               name: 'content',
               attributes: { type: 'xml', ns: 'http://open311.org/spec/georeport-v1' },
               children:
                  [ {
                    type: 'element',
                    name: 'report_id',
                    children: [ { type: 'text', value: '637619' } ]
                  },
                  {
                    type: 'element',
                    name: 'address',
                    children:
                       [ {
                         type: 'text',
                         value: '1600 Market St, San Francisco, CA 94103'
                       } ]
                  },
                  {
                    type: 'element',
                    name: 'description',
                    children:
                       [ { type: 'text', value: 'A large\n                ' },
                         { type: 'element', name: 'bold', children: [{ value: 'tree', type: 'text' }] },
                         { type: 'text', value: ' branch is\n                ' },
                         { type: 'element', name: 'bold', children: [{ value: 'blocking', type: 'text' }] },
                         { type: 'text', value: ' the road\n            ' } ]
                  },
                  {
                    type: 'element',
                    name: 'status',
                    children: [ { type: 'text', value: 'created' } ]
                  },
                  { type: 'element', name: 'status_notes', children: [] },
                  {
                    type: 'element',
                    name: 'policy',
                    children:
                       [ {
                         type: 'text',
                         value: 'The City will inspect and require the responsible party to correct within 24 hours and/or issue a Correction Notice or Notice of Violation of the Public Works Code'
                       } ]
                  } ]
             } ]
        },
        {
          type: 'element',
          name: 'entry',
          children:
             [ {
               type: 'element',
               name: 'id',
               children:
                  [ {
                    type: 'text',
                    value: 'tag:open311.sfgov.org,2010-04-15:/dev/V1/reports/637620.xml'
                  } ]
             },
             {
               type: 'element',
               name: 'title',
               children:
                  [ {
                    type: 'text',
                    value: 'A large tree branch is blocking the road'
                  } ]
             },
             {
               type: 'element',
               name: 'updated',
               children: [ { type: 'text', value: '2010-04-13T18:30:02-05:00' } ]
             },
             {
               type: 'element',
               name: 'link',
               attributes:
                  {
                    rel: 'self',
                    href: 'http://open311.sfgov.org/dev/V1/reports/637620.xml'
                  },
               children: []
             },
             {
               type: 'element',
               name: 'author',
               attributes: { id: 'uniq' },
               children:
                  [ {
                    type: 'element',
                    name: 'name',
                    children: [ { type: 'text', value: 'John Doe' } ]
                  } ]
             },
             {
               type: 'element',
               name: 'georss:point',
               children: [ { type: 'text', value: '40.7111 -73.9565' } ]
             },
             {
               type: 'element',
               name: 'category',
               attributes:
                  {
                    label: 'Damaged tree',
                    term: 'tree-damage',
                    scheme: 'https://open311.sfgov.org/dev/V1/categories/006.xml'
                  },
               children: [ { type: 'text', value: '006' } ]
             },
             {
               type: 'element',
               name: 'content',
               attributes: { type: 'xml', ns: 'http://open311.org/spec/georeport-v1' },
               children:
                  [ {
                    type: 'element',
                    name: 'report_id',
                    children: [ { type: 'text', value: '637620' } ]
                  },
                  {
                    type: 'element',
                    name: 'address',
                    children: [ { type: 'text', value: '56 Market St, San Francisco, CA 94103' } ]
                  },
                  {
                    type: 'element',
                    name: 'description',
                    children:
                       [ {
                         type: 'text',
                         value: 'A large tree branch is blocking the road'
                       } ]
                  },
                  {
                    type: 'element',
                    name: 'status',
                    children: [ { type: 'text', value: 'created' } ]
                  },
                  { type: 'element', name: 'status_notes', children: [] },
                  {
                    type: 'element',
                    name: 'policy',
                    children:
                       [ {
                         type: 'text',
                         value: 'The City will inspect and require the responsible party to correct within 24 hours and/or issue a Correction Notice or Notice of Violation of the Public Works Code'
                       } ]
                  } ]
             } ]
        },
        {
          type: 'element',
          name: 'entry',
          children:
             [ {
               type: 'element',
               name: 'id',
               children:
                  [ {
                    type: 'text',
                    value: 'tag:open311.sfgov.org,2010-04-15:/dev/V1/reports/637621.xml'
                  } ]
             },
             {
               type: 'element',
               name: 'title',
               children:
                  [ {
                    type: 'text',
                    value: 'A large tree branch is blocking the road'
                  } ]
             },
             {
               type: 'element',
               name: 'updated',
               children: [ { type: 'text', value: '2010-04-13T18:30:02-05:00' } ]
             },
             {
               type: 'element',
               name: 'link',
               attributes:
                  {
                    rel: 'self',
                    href: 'http://open311.sfgov.org/dev/V1/reports/637621.xml'
                  },
               children: []
             },
             {
               type: 'element',
               name: 'author',
               children:
                  [ {
                    type: 'element',
                    name: 'name',
                    children: [ { type: 'text', value: 'John Doe' } ]
                  } ]
             },
             {
               type: 'element',
               name: 'georss:point',
               children: [ { type: 'text', value: '40.7111 -73.9565' } ]
             },
             {
               type: 'element',
               name: 'category',
               attributes:
                  {
                    label: 'Damaged tree',
                    term: 'tree-damage',
                    scheme: 'https://open311.sfgov.org/dev/V1/categories/006.xml'
                  },
               children: [ { type: 'text', value: '006' } ]
             },
             {
               type: 'element',
               name: 'content',
               attributes: { type: 'xml', ns: 'http://open311.org/spec/georeport-v1' },
               children:
                  [ {
                    type: 'element',
                    name: 'report_id',
                    children: [ { type: 'text', value: '637621' } ]
                  },
                  {
                    type: 'element',
                    name: 'address',
                    children:
                       [ {
                         type: 'text',
                         value: '1800 Market St, San Francisco, CA 94103'
                       } ]
                  },
                  {
                    type: 'element',
                    name: 'description',
                    children:
                       [ {
                         type: 'text',
                         value: 'A large tree branch is blocking the road'
                       } ]
                  },
                  {
                    type: 'element',
                    name: 'status',
                    children: [ { type: 'text', value: 'created' } ]
                  },
                  { type: 'element', name: 'status_notes', children: [] },
                  {
                    type: 'element',
                    name: 'policy',
                    children:
                       [ {
                         type: 'text',
                         value: 'The City will inspect and require the responsible party to correct within 24 hours and/or issue a Correction Notice or Notice of Violation of the Public Works Code'
                       } ]
                  } ]
             } ]
        } ]
   } ]
};

import './common.js';
import hbHelpers from 'losant-handlebars/src/helpers.js';
import HtmlParserNode from '../src/html-parser-node.js';

describe('HtmlParseNode', () => {
  it('should correctly work with no selector', () => {
    const node = new HtmlParserNode('id', [[4]], {
      documentPath: 'in',
      selectorTemplate: '{{selector}}',
      resultFormatTemplate: '{{format}}',
      resultPath: 'out'
    });

    let results = node.run({}, {
      in: sampleXml,
      format: 'xml'
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      in: sampleXml,
      format: 'xml',
      out: [sampleXml]
    });

    results = node.run({}, {
      in: sampleXml,
      format: 'text'
    });
    results[1].out[0].replace(/\W*\n+\W*/g, '\n').should.deepEqual(asText);

    results = node.run({}, {
      in: sampleXml,
      format: 'json'
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      in: sampleXml,
      format: 'json',
      out: [asJson]
    });

    String(hbHelpers.toHtml(results[1].out[0],
      { hash: { spaces: 4 } }
    )).replace(/ *\n */g, '').should.equal(sampleXml.replace(/ *\n */g, ''));
  });

  it('should correctly work with selector that finds nothing', () => {
    const node = new HtmlParserNode('id', [[4]], {
      documentPath: 'in',
      selectorTemplate: '{{selector}}',
      resultFormatTemplate: '{{format}}',
      resultPath: 'out'
    });

    let results = node.run({}, {
      in: sampleXml,
      format: 'xml',
      selector: '#nothing'
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      in: sampleXml,
      format: 'xml',
      selector: '#nothing',
      out: []
    });

    results = node.run({}, {
      in: sampleXml,
      format: 'text',
      selector: '#nothing'
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      in: sampleXml,
      format: 'text',
      selector: '#nothing',
      out: []
    });

    results = node.run({}, {
      in: sampleXml,
      format: 'json',
      selector: '#nothing'
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      in: sampleXml,
      format: 'json',
      selector: '#nothing',
      out: []
    });
  });

  it('should correctly work with selector that finds one item', () => {
    const node = new HtmlParserNode('id', [[4]], {
      documentPath: 'in',
      selectorTemplate: '{{selector}}',
      resultFormatTemplate: '{{format}}',
      resultPath: 'out'
    });

    let results = node.run({}, {
      in: sampleXml,
      format: 'xml',
      selector: 'author#uniq'
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      in: sampleXml,
      format: 'xml',
      selector: 'author#uniq',
      out: ['<author id="uniq">\n            <name>John Doe</name>\n        </author>']
    });

    results = node.run({}, {
      in: sampleXml,
      format: 'text',
      selector: 'author#uniq'
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      in: sampleXml,
      format: 'text',
      selector: 'author#uniq',
      out: ['\n            John Doe\n        ']
    });

    results = node.run({}, {
      in: sampleXml,
      format: 'json',
      selector: 'author#uniq'
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      in: sampleXml,
      format: 'json',
      selector: 'author#uniq',
      out: [
        {
          children:
          [ {
            type: 'element',
            name: 'author',
            attributes: { id: 'uniq' },
            children:
              [ {
                type: 'element',
                name: 'name',
                children: [ { type: 'text', value: 'John Doe' } ]
              } ]
          } ]
        }
      ]
    });

    String(hbHelpers.toHtml(results[1].out[0], {})).should
      .equal('<author id="uniq"><name>John Doe</name></author>');
  });

  it('should correctly work with selector that finds multiple items', () => {
    const node = new HtmlParserNode('id', [[4]], {
      documentPath: 'in',
      selectorTemplate: '{{selector}}',
      resultFormatTemplate: '{{format}}',
      resultPath: 'out'
    });

    let results = node.run({}, {
      in: sampleXml,
      format: 'xml',
      selector: 'status'
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      in: sampleXml,
      format: 'xml',
      selector: 'status',
      out: [
        '<status>created</status>',
        '<status>created</status>',
        '<status>created</status>'
      ]
    });

    results = node.run({}, {
      in: sampleXml,
      format: 'text',
      selector: 'status'
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      in: sampleXml,
      format: 'text',
      selector: 'status',
      out: ['created', 'created', 'created']
    });

    results = node.run({}, {
      in: sampleXml,
      format: 'json',
      selector: 'status'
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      in: sampleXml,
      format: 'json',
      selector: 'status',
      out: [
        {
          children:
          [ {
            type: 'element',
            name: 'status',
            children: [ { type: 'text', value: 'created' } ]
          } ]
        },
        {
          children:
          [ {
            type: 'element',
            name: 'status',
            children: [ { type: 'text', value: 'created' } ]
          } ]
        },
        {
          children:
          [ {
            type: 'element',
            name: 'status',
            children: [ { type: 'text', value: 'created' } ]
          } ]
        }
      ]
    });

    String(hbHelpers.toHtml(results[1].out[0], {})).should.equal('<status>created</status>');
  });

  it('should correctly work with bad selector', () => {
    const node = new HtmlParserNode('id', [[4]], {
      documentPath: 'in',
      selectorTemplate: '{{selector}}',
      resultFormatTemplate: '{{format}}',
      resultPath: 'out'
    });

    const results = node.run({}, {
      in: sampleXml,
      format: 'xml',
      selector: '.'
    });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({
      in: sampleXml,
      format: 'xml',
      selector: '.',
      out: []
    });
  });

  it('should work with bad documents', () => {
    const node = new HtmlParserNode('id', [[4]], {
      documentPath: 'in',
      selectorTemplate: '{{selector}}',
      resultFormatTemplate: '{{format}}',
      resultPath: 'out'
    });

    let results = node.run({}, { in: null, format: 'xml' });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({ in: null, format: 'xml', out: [] });
    results = node.run({}, { in: null, format: 'json' });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({ in: null, format: 'json', out: [] });
    results = node.run({}, { in: null, format: 'text' });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({ in: null, format: 'text', out: [] });

    results = node.run({}, { in: '<a what="foo<>b<', format: 'xml' });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({ in: '<a what="foo<>b<', format: 'xml', out: [''] });
    results = node.run({}, { in: '<a what="foo<>b<', format: 'json' });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({ in: '<a what="foo<>b<', format: 'json', out: [{}] });
    results = node.run({}, { in: '<a what="foo<>b<', format: 'text' });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({ in: '<a what="foo<>b<', format: 'text', out: [''] });

    results = node.run({}, { in: 'hello<a', format: 'xml' });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({ in: 'hello<a', format: 'xml', out: ['hello'] });
    results = node.run({}, { in: 'hello<a', format: 'json' });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({ in: 'hello<a', format: 'json', out: [{}] });
    results = node.run({}, { in: 'hello<a', format: 'text' });
    results[0].should.deepEqual([[4]]);
    results[1].should.deepEqual({ in: 'hello<a', format: 'text', out: ['hello'] });
  });

  it('should work correct with entities', () => {
    const node = new HtmlParserNode('id', [[4]], {
      documentPath: 'in',
      selectorTemplate: '{{selector}}',
      resultFormatTemplate: '{{format}}',
      resultPath: 'out'
    });

    // & is escaped
    const doc = '<ns1:feed xmlns:ns0="http://naesb.org/espi" xmlns:ns1="http://www.w3.org/2005/Atom">one&amp;two</ns1:feed>';
    const docAsJson = {
      children: [{
        type: 'element',
        name: 'ns1:feed',
        attributes: { 'xmlns:ns0': 'http://naesb.org/espi', 'xmlns:ns1': 'http://www.w3.org/2005/Atom' },
        // & is not escaped
        children: [ { type: 'text', value: 'one&two' } ]
      }]
    };
    String(hbHelpers.toHtml(docAsJson, {})).should.equal(doc);
    node.run({}, { in: doc, format: 'json' }).should.deepEqual([
      [ [ 4 ] ],
      { in: doc, format: 'json', out: [docAsJson] }
    ]);
    node.run({}, { in: doc, format: 'xml' }).should.deepEqual([
      [ [ 4 ] ],
      { in: doc, format: 'xml', out: [doc] }
    ]);
    node.run({}, { in: doc, format: 'html' }).should.deepEqual([
      [ [ 4 ] ],
      { in: doc, format: 'html', out: [doc] }
    ]);
    node.run({}, { in: doc, format: 'text' }).should.deepEqual([
      [ [ 4 ] ],
      // & is not escaped
      { in: doc, format: 'text', out: ['one&two'] }
    ]);
  });
});
