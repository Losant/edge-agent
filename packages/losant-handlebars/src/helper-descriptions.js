export default {
  // built in handlebars helpers
  if: {
    block: true,
    description: 'If value is not one of false, undefined, null, "", 0, or [] it will render the block.',
    example: '{{#if value}} {{value}} {{else}} Not set! {{/if}}',
    arguments: [
      {
        name: 'value',
        description: 'The value to check.'
      }
    ]
  },
  unless: {
    block: true,
    description: 'If value is one of false, undefined, null, "", 0, or [] it will render the block (the inverse of the if helper).',
    example: '{{#unless value}} Not set! {{else}} {{value}} {{/unless}}',
    arguments: [
      {
        name: 'value',
        description: 'The value to check.'
      }
    ]
  },
  each: {
    block: true,
    description: 'Iterates over the given list. Inside the block, the current item becomes the root context of the block.',
    example: '{{#each list}} {{@index}}: {{this}} {{else}} List is empty. {{/each}}',
    arguments: [
      {
        name: 'list',
        description: 'The list to iterate over.'
      }
    ]
  },
  with: {
    block: true,
    description: 'Changes the root evaluation context of the block to be the provided value.',
    example: '{{#with value}} {{name}} {{else}} Value does not exist. {{/with}}',
    arguments: [
      {
        name: 'value',
        description: 'The object that should become the root context of the block.'
      }
    ]
  },
  lookup: {
    description: 'Returns the value of the given key field in the given context object.',
    example: '{{lookup key context}}',
    arguments: [
      {
        name: 'context',
        description: 'The object or array to perform the lookup in.'
      },
      {
        name: 'key',
        description: 'The property or index to access in the provided context.'
      }
    ]
  },

  // Losant provided block handlebars helpers
  eq: {
    block: true,
    description: 'If p1 and p2 are equal by shallow comparison it will render the block.',
    example: '{{#eq item1 item2}} Equal! {{else}} Not equal! {{/eq}}',
    arguments: [
      {
        name: 'p1',
        description: 'The first value to check.'
      },
      {
        name: 'p2',
        description: 'The second value to check.'
      }
    ]
  },
  gt: {
    block: true,
    description: 'If p1 is greater than p2 it will render the block.',
    example: '{{#gt item1 item2}} Larger! {{else}} Equal or smaller! {{/gt}}',
    arguments: [
      {
        name: 'p1',
        description: 'The first value to check.'
      },
      {
        name: 'p2',
        description: 'The second value to check.'
      }
    ]
  },
  gte: {
    block: true,
    description: 'If p1 is greater than or equal to p2 it will render the block.',
    example: '{{#gte item1 item2}} Equal or larger! {{else}} Smaller! {{/gte}}',
    arguments: [
      {
        name: 'p1',
        description: 'The first value to check.'
      },
      {
        name: 'p2',
        description: 'The second value to check.'
      }
    ]
  },
  includes: {
    block: true,
    description: 'If value is in collection it will render the block.',
    example: '{{#includes myCollection myValue}} Included! {{else}} Not included! {{/lte}}',
    arguments: [
      {
        name: 'collection',
        description: 'The collection to check.'
      },
      {
        name: 'value',
        description: 'The value to check.'
      }
    ]
  },
  lt: {
    block: true,
    description: 'If p1 is less than p2 it will render the block.',
    example: '{{#lt item1 item2}} Smaller! {{else}} Equal or larger! {{/lt}}',
    arguments: [
      {
        name: 'p1',
        description: 'The first value to check.'
      },
      {
        name: 'p2',
        description: 'The second value to check.'
      }
    ]
  },
  lte: {
    block: true,
    description: 'If p1 is less than or equal to p2 it will render the block.',
    example: '{{#lte item1 item2}} Equal or smaller! {{else}} Larger! {{/lte}}',
    arguments: [
      {
        name: 'p1',
        description: 'The first value to check.'
      },
      {
        name: 'p2',
        description: 'The second value to check.'
      }
    ]
  },
  match: {
    block: true,
    description: 'If str matches regExpStr it will render the block.',
    example: '{{#match myString myExp}} Matches! {{else}} No match! {{/lte}}',
    arguments: [
      {
        name: 'str',
        description: 'The string to check.'
      },
      {
        name: 'regExpStr',
        description: 'A regular expression to match against the string.'
      }
    ]
  },
  ne: {
    block: true,
    description: 'If p1 and p2 are not equal by shallow comparison it will render the block (the inverse of the eq helper).',
    example: '{{#ne item1 item2}} Not equal! {{else}} Equal! {{/ne}}',
    arguments: [
      {
        name: 'p1',
        description: 'The first value to check.'
      },
      {
        name: 'p2',
        description: 'The second value to check.'
      }
    ]
  },

  // Losant provided format handlebars helpers
  add: {
    description: 'Casts the two values as numbers and adds them.',
    example: '{{add val1 val2}}',
    arguments: [
      {
        name: 'val1',
        description: 'The first value.'
      },
      {
        name: 'val1',
        description: 'The second value.'
      }
    ]
  },
  array: {
    description: 'Creates an array out of all of the given arguments.',
    example: '{{array value1 value2 value3}}'
  },
  ceil: {
    description: 'Casts the value as a number and returns the ceiling of that number.',
    example: '{{ceil val}}',
    arguments: [
      {
        name: 'val',
        description: 'The value to take the ceiling of.'
      }
    ]
  },
  colorMarker: {
    description: 'Returns an encoded image URI for a marker of the desired color.',
    example: '{{colorMarker color}}',
    arguments: [
      {
        name: 'color',
        description: 'A hex string of the color to use for the marker.',
        optional: true,
        default: '#000000'
      }
    ]
  },
  currentDateTime: {
    description: 'Returns the current date/time formatted by the provided format string.',
    example: '{{currentDateTime formatStr}}',
    arguments: [
      {
        name: 'formatStr',
        description: 'The format string to use.',
        optional: true,
        default: 'L LTS'
      }
    ]
  },
  dashboardUrl: {
    description: 'Creates a link to the dashboard at the given ID and adds the optional query parameters.',
    example: '{{dashboardUrl id queryParamKey1="queryParamValue1" queryParamKey2=queryParamValue2}}',
    arguments: [
      {
        name: 'id',
        description: 'The dashboard ID - defaults to the current dashboard (if used on a dashboard).',
        optional: true
      }
    ]
  },
  decodeBase64: {
    description: 'Treats val as Base64-encoded and returns a decoded string (UTF-8 character set).',
    example: '{{decodeBase64 val}}',
    arguments: [
      {
        name: 'val',
        description: 'The value to decode.'
      }
    ]
  },
  decodeURI: {
    description: 'Returns str as a decoded URI.',
    example: '{{decodeURI str}}',
    arguments: [
      {
        name: 'str',
        description: 'The string to decode.'
      }
    ]
  },
  decodeURIComponent: {
    description: 'Returns str as a decoded URI component.',
    example: '{{decodeURIComponent str}}',
    arguments: [
      {
        name: 'str',
        description: 'The string to decode.'
      }
    ]
  },
  defaultTo: {
    description: 'Returns the value of default if the value of val is null, undefined, or an empty string. Otherwise returns the value of val.',
    example: '{{defaultTo val default}}',
    arguments: [
      {
        name: 'val',
        description: 'The value to check.'
      },
      {
        name: 'default',
        description: 'The default to use.'
      }
    ]
  },
  divide: {
    description: 'Casts the two values as numbers and divides them.',
    example: '{{divide val1 val2}}',
    arguments: [
      {
        name: 'val1',
        description: 'The first value.'
      },
      {
        name: 'val1',
        description: 'The second value.'
      }
    ]
  },
  encodeBase64: {
    description: 'Treats val as a string, and returns the Base64-encoded version of that string (UTF-8 character set).',
    example: '{{encodeBase64 val}}',
    arguments: [
      {
        name: 'val',
        description: 'The value to encode.'
      }
    ]
  },
  encodeURI: {
    description: 'Returns str as an encoded URI.',
    example: '{{encodeURI str}}',
    arguments: [
      {
        name: 'str',
        description: 'The string to encode.'
      }
    ]
  },
  encodeURIComponent: {
    description: 'Returns str as an encoded URI component.',
    example: '{{encodeURIComponent str}}',
    arguments: [
      {
        name: 'str',
        description: 'The string to encode.'
      }
    ]
  },
  evalExpression: {
    description: 'Evaluates str as an expression, using ctx as the context for variable lookups.',
    example: '{{evalExpression str ctx}}',
    arguments: [
      {
        name: 'str',
        description: 'The string to evaluate as an expression.'
      },
      {
        name: 'ctx',
        description: 'The context used for the evaluation. If not provided, the overall payload context will be used.',
        optional: true
      }
    ]
  },
  floor: {
    description: 'Casts the value as a number and returns the floor of that number.',
    example: '{{floor val}}',
    arguments: [
      {
        name: 'val',
        description: 'The value to take the floor of.'
      }
    ]
  },
  format: {
    description: 'Formats the provided value according to the provided format string.',
    example: '{{format val formatStr}}',
    arguments: [
      {
        name: 'val',
        description: 'The value to format.'
      },
      {
        name: 'formatStr',
        description: 'The format string to use. The default depends on the type of value.',
        optional: true
      }
    ]
  },
  formatDate: {
    description: 'Casts the given value as a date, and then formats it using the formatStr parameter.',
    example: '{{formatDate val formatStr}}',
    arguments: [
      {
        name: 'val',
        description: 'The date value to format.'
      },
      {
        name: 'formatStr',
        description: 'The format string to use.',
        optional: true,
        default: 'L LTS'
      }
    ]
  },
  formatDateRelative: {
    description: 'Outputs a relative date value (such as “5 minutes ago”). Date is calculated relative to the relativeTo parameter, which defaults to the current time when not set.',
    example: '{{formatDateRelative date relativeTo}}',
    arguments: [
      {
        name: 'date',
        description: 'The date value to use.'
      },
      {
        name: 'relativeTo',
        description: 'The date to use as the relative comparison. Defaults to now.',
        optional: true
      }
    ]
  },
  formatGps: {
    description: 'Takes the given GPS coordinate, in any of the supported formats, and reformats to the desired format.',
    example: '{{formatGps gpsStr formatStr precision}}',
    arguments: [
      {
        name: 'gpsStr',
        description: 'The GPS coordinates to format.'
      },
      {
        name: 'formatStr',
        description: 'The way to format the GPS coordinates.',
        optional: true,
        default: 'decimal',
        options: ['decimal', 'degrees', 'sexagesimal', 'gga']
      },
      {
        name: 'precision',
        description: 'The precision to use when creating the final formatted coordinates.',
        optional: true,
        default: 6
      }
    ]
  },
  gpsDistance: {
    description: 'Takes two GPS points and returns the distance between them (in meters).',
    example: '{{gpsDistance gpsStr1 gpsStr2}}',
    arguments: [
      {
        name: 'gpsStr1',
        description: 'The first GPS coordinate.'
      },
      {
        name: 'gpsStr1',
        description: 'The second GPS coordinate.'
      }
    ]
  },
  gpsIsPointInside: {
    description: 'Takes a GPS point and an array of GPS points that represents a bounding box, and returns true if gpsStr is within the bounds of gpsCoordArray.',
    example: '{{gpsIsPointInside gpsStr gpsCoordArray}}',
    arguments: [
      {
        name: 'gpsStr',
        description: 'The GPS coordinate to check.'
      },
      {
        name: 'gpsCoordArray',
        description: 'The array of GPS points representing the bounding box.'
      }
    ]
  },
  indexByKey: {
    description: 'Returns the index of the first object in the objArray whose value at keyPath deeply matches keyValue. If there is no match found, -1 is returned.',
    example: '{{indexByKey objArray keyValue keyPath}}',
    arguments: [
      {
        name: 'objArray',
        description: 'The array of objects to search in.'
      },
      {
        name: 'keyValue',
        description: 'The value to deeply match against the value at the keyPath on the objects.'
      },
      {
        name: 'keyPath',
        description: 'The path within the object to the value to match against the keyValue.',
        optional: true,
        default: 'key'
      }
    ]
  },
  join: {
    description: 'Joins the values in the given array as a single string, separated by the given separator.',
    example: '{{join array separator}}',
    arguments: [
      {
        name: 'array',
        description: 'The array of items to join.'
      },
      {
        name: 'separator',
        description: 'The separator string to use.',
        optional: true,
        default: ','
      }
    ]
  },
  jsonDecode: {
    description: 'Treats val as a JSON string and parses it. If unparsable, returns undefined.',
    example: '{{jsonDecode val}}',
    arguments: [
      {
        name: 'val',
        description: 'The value to decode.'
      }
    ]
  },
  jsonEncode: {
    description: 'Returns val stringified. If no spacer string is given (for adding whitespace for readability to the output), defaults to adding no whitespace.',
    example: '{{jsonEncode val spacerStr}}',
    arguments: [
      {
        name: 'val',
        description: 'The value to encode.'
      },
      {
        name: 'spacerStr',
        description: 'The string to use for indentation and spacing.',
        optional: true
      }
    ]
  },
  last: {
    description: 'Returns the last item in an array or the last character in a string.',
    example: '{{last arr}}',
    arguments: [
      {
        name: 'array',
        description: 'The array or string from which to get the last item.'
      }
    ]
  },
  length: {
    description: 'Returns the length of an array, object, or string.',
    example: '{{length val}}',
    arguments: [
      {
        name: 'val',
        description: 'The value to get the length of.'
      }
    ]
  },
  lower: {
    description: 'Returns str converted to all lowercase characters.',
    example: '{{lower str}}',
    arguments: [
      {
        name: 'str',
        description: 'The string to lowercase.'
      }
    ]
  },
  max: {
    description: 'Returns the larger of the two given values.',
    example: '{{max val1 val2}}',
    arguments: [
      {
        name: 'val1',
        description: 'The first value.'
      },
      {
        name: 'val1',
        description: 'The second value.'
      }
    ]
  },
  merge: {
    description: 'Shallow merges all the given arguments into a single object. If keys are duplicated, the value from the last argument with that key is used.',
    example: '{{merge value1 value2 value3}}'
  },
  min: {
    description: 'Returns the smaller of the two given values.',
    example: '{{min val1 val2}}',
    arguments: [
      {
        name: 'val1',
        description: 'The first value.'
      },
      {
        name: 'val1',
        description: 'The second value.'
      }
    ]
  },
  multiply: {
    description: 'Casts the two values as numbers and multiplies them.',
    example: '{{multiply val1 val2}}',
    arguments: [
      {
        name: 'val1',
        description: 'The first value.'
      },
      {
        name: 'val1',
        description: 'The second value.'
      }
    ]
  },
  obj: {
    description: 'Creates an object out of all of the given hash parameters.',
    example: '{{obj key1=value1 key2=value2 key3=value3}}'
  },
  queryStringEncode: {
    description: 'Takes the given object and converts it to a URL query string.',
    example: '{{queryStringEncode object}}',
    arguments: [
      {
        name: 'object',
        description: 'The object to encode.'
      }
    ]
  },
  scaleLinear: {
    description: 'Scales the given value from the domain defined by fromLow and fromHigh to the range defined by toLow and toHigh. Similar to the Arduino Map function.',
    example: '{{scaleLinear fromLow fromHigh toLow toHigh value}}',
    arguments: [
      {
        name: 'fromLow',
        description: 'The low end of the "from" scale.'
      },
      {
        name: 'fromHigh',
        description: 'The high end of the "from" scale.'
      },
      {
        name: 'toLow',
        description: 'The low end of the "to" scale.'
      },
      {
        name: 'toHigh',
        description: 'The high end of the "to" scale.'
      },
      {
        name: 'value',
        description: 'The value to re-map from the "from" scale to the "to" scale.'
      }
    ]
  },
  substring: {
    description: 'Returns part of a string from the start index up to and excluding the end index, or to the end of the string if no end index is supplied.',
    example: '{{substring sourceStr startIdx optionalEndIdx}}',
    arguments: [
      {
        name: 'sourceStr',
        description: 'The string to manipulate.'
      },
      {
        name: 'startIdx',
        description: 'The index of the first character to include in the returned substring.'
      },
      {
        name: 'optionalEndIdx',
        description: 'The index of the first character to exclude from the returned substring.',
        optional: true
      }
    ]
  },
  subtract: {
    description: 'Casts the two values as numbers and subtracts them.',
    example: '{{subtract val1 val2}}',
    arguments: [
      {
        name: 'val1',
        description: 'The first value.'
      },
      {
        name: 'val1',
        description: 'The second value.'
      }
    ]
  },
  template: {
    description: 'Evaluates str as a string template, using ctx as the context for variable lookups.',
    example: '{{template str ctx}}',
    arguments: [
      {
        name: 'str',
        description: 'The string to render as a string template.'
      },
      {
        name: 'ctx',
        description: 'The context used for the render. If not provided, the overall payload context will be used.',
        optional: true
      }
    ]
  },
  titleCase: {
    description: 'Takes the given string and applies title capitalization rules.',
    example: '{{titleCase str}}',
    arguments: [
      {
        name: 'str',
        description: 'The string to change to title case.'
      }
    ]
  },
  toHtml: {
    description: 'Takes the given object and converts it to an HTML/XML document string. The object must be of the same format that the HTML Parser Node outputs in JSON mode.',
    example: '{{toHtml object}}',
    arguments: [
      {
        name: 'object',
        description: 'A JSON object representing an HTML document structure.'
      }
    ]
  },
  trim: {
    description: 'Returns str with all whitespace trimmed from the start and end.',
    example: '{{trim str}}',
    arguments: [
      {
        name: 'str',
        description: 'The string to trim.'
      }
    ]
  },
  typeof: {
    description: 'Returns the type of the given value.',
    example: '{{typeof val}}',
    arguments: [
      {
        name: 'val',
        description: 'The value to get the type of.'
      }
    ]
  },
  upper: {
    description: 'Returns str converted to all uppercase characters.',
    example: '{{upper str}}',
    arguments: [
      {
        name: 'str',
        description: 'The string to uppercase.'
      }
    ]
  },
  valueByKey: {
    description: 'Returns the value at valuePath on the first object in the objArray whose value at keyPath deeply matches keyValue. If there is no match found, a blank result is returned.',
    example: '{{valueByKey objArray keyValue keyPath valuePath}}',
    arguments: [
      {
        name: 'objArray',
        description: 'The array of objects to search in.'
      },
      {
        name: 'keyValue',
        description: 'The value to deeply match against the value at the keyPath on the objects.'
      },
      {
        name: 'keyPath',
        description: 'The path within the object to the value to match against the keyValue.',
        optional: true,
        default: 'key'
      },
      {
        name: 'valuePath',
        description: 'The path within the object to the value to return.',
        optional: true,
        default: 'value'
      }
    ]
  }
};
