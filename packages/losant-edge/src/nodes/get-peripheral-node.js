import * as payloadHelper from 'losant-handlebars';
import { mapRejectNil, curry, prop, ascend, descend, sort } from 'omnibelt';
import errors from 'losant-nodejs-utils/src/errors.js';

const SORT_FIELD_OPTIONS = {
  name: 'name',
  id: 'id'
};

const checkTagKeys = curry((tagKeys, method, device) => {
  return (tagKeys[method]((key) => { return device.tags[key]; }));
});

const checkTagValues = curry((tagValues, method, device) => {
  return tagValues[method]((val) => {
    return Object.values(device.tags).some((values) => {
      return values.includes(val);
    });
  });
});

const checkTagPairs = curry((tagPairs, method, device) => {
  return tagPairs[method]((pair) => {
    return device.tags[pair.key] && device.tags[pair.key].includes(pair.value);
  });
});

const renderTags = (tags, payload) => {
  const tagKeys   = [];
  const tagValues = [];
  const tagPairs  = [];

  tags.forEach((pair) => {
    const key = payloadHelper.renderToString(pair.keyTemplate, payload).trim();
    const value = payloadHelper.renderToString(pair.valueTemplate, payload);

    if (key && value) {
      tagPairs.push({ key, value });
    } else if (key) {
      tagKeys.push(key);
    } else if (value) {
      tagValues.push(value);
    }
  });
  return { tagKeys, tagValues, tagPairs };
};

const findById = (peripherals, config, payload) => {
  const id = payloadHelper.renderToString(config.idTemplate, payload);
  return peripherals[id] ? [peripherals[id]] : [];
};

const findByTags = curry(async (type, peripherals, config, payload) => {
  const { tagKeys, tagValues, tagPairs } = renderTags(config.tags, payload);
  const checkFunctions = [checkTagKeys(tagKeys), checkTagPairs(tagPairs), checkTagValues(tagValues)];
  const method = type === 'all' ? 'every' : 'some';
  return mapRejectNil((peripheral) => {
    return checkFunctions[method]((checkFunc) => { return checkFunc(method, peripheral); }) ? peripheral : null;
  }, Object.values(peripherals));
});

const findByName = (peripherals, config, payload) => {
  const name = payloadHelper.renderToString(config.nameTemplate, payload);
  return mapRejectNil((peripheral) => {
    return peripheral.name === name ? peripheral : null;
  }, Object.values(peripherals));
};

const DEVICE_METHOD_RESOLVER = {
  id: findById,
  findByAllTags: findByTags('all'),
  findByAnyTags: findByTags('any'),
  name: findByName
};

const sortOrder = (fieldTemplate, directionTemplate, payload) => {
  const sortField = payloadHelper.renderToString(fieldTemplate, payload) || 'name';
  const sortDirection = payloadHelper.renderToString(directionTemplate, payload).toLowerCase() || 'asc';
  if (!SORT_FIELD_OPTIONS[sortField]) {
    throw errors.Validation({ message: `Invalid sortField value: ${sortField}` });
  }
  if (sortDirection === 'asc') {
    return ascend(prop(sortField));
  } else {
    return descend(prop(sortField));
  }
};

const formatPeripheral = (peripheral, tagsAsObject, attributesAsObject) => {
  const peripheralObj = {
    id: peripheral.id,
    name: peripheral.name,
    deviceClass: peripheral.deviceClass,
    tags: tagsAsObject ? {} : [],
    attributes: attributesAsObject ? {} : []
  };

  if (peripheral.tags) {
    Object.keys(peripheral.tags).forEach((tagKey) => {
      const tagValues = peripheral.tags[tagKey];
      if (tagsAsObject) {
        peripheralObj.tags[tagKey] = tagValues.slice();
      } else {
        tagValues.forEach((tagValue) => {
          peripheralObj.tags.push({ key: tagKey, value: tagValue });
        });
      }
    });
  }

  if (peripheral.attributes?.length) {
    peripheral.attributes.forEach((attrStruct) => {
      const attr = {
        name: attrStruct.name,
        dataType: attrStruct.dataType,
        attributeTags: attrStruct.attributeTags ? { ...attrStruct.attributeTags } : {}
      };
      if (attrStruct.contentType) {
        attr.contentType = attrStruct.contentType;
      }
      if (attributesAsObject) {
        peripheralObj.attributes[attr.name] = attr;
      } else {
        peripheralObj.attributes.push(attr);
      }
    });
  }

  return peripheralObj;
};

class GetPeripheralNode {

  /* Example Config:
    {
      findMethod: <String - Optional: how to find peripherals (id|findByAllTags|findByAnyTags|name). Default id. An unrecognized value falls back to id>,
      findMultiple: <Boolean - Optional: return an array of all matches instead of a single peripheral. Ignored (always false) when findMethod is id. Default false>,
      idTemplate: <String - Optional: template for the peripheral id. Used when findMethod is id>,
      name: <String - Optional: template for the peripheral name (exact match). Used when findMethod is name. Rendered as a template despite the key name>,
      tags: [
        0 or more of (used when findMethod is findByAllTags or findByAnyTags):
        { keyTemplate: <String - Optional: template for tag key. With only a key, matches peripherals that have the tag key>,
          valueTemplate: <String - Optional: template for tag value. With only a value, matches peripherals with that value under any key. With both, matches the key/value pair> }
      ],
      sortField: <String - Optional: template for the field to sort results by (name|id). Any other rendered value throws a Validation error. Default name>,
      sortDirection: <String - Optional: template for the sort direction (asc|desc, case-insensitive). Any value other than asc sorts descending. Default asc>,
      resultPath: <String - Optional: payload path at which to place the found peripheral(s). If omitted, the payload is returned unchanged>,
      attributesAsObject: <Boolean - Optional: return attributes as an object map keyed by attribute name instead of an array. Default false>,
      tagsAsObject: <Boolean - Optional: return peripheral tags as an object map instead of an array of { key, value }. Default true>
    }
    Notes:
      Result written to resultPath is { id, name, deviceClass, tags, attributes } for a single match (null when nothing matches),
      or an array of those objects when findMultiple is true (empty array when nothing matches).
      There is a single output: every outputId receives the payload whether or not a peripheral was found.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.findMethod = config.findMethod || 'id';
    this.findMultiple = this.findMethod !== 'id' && config.findMultiple;
    this.idTemplate = config.idTemplate;
    this.nameTemplate = config.name;
    this.tags = config.tags || [];
    this.sortField = config.sortField || 'name';
    this.sortDirection = config.sortDirection || 'asc';
    this.resultPath = config.resultPath;
    this.attributesAsObject = config.attributesAsObject ?? false;
    this.tagsAsObject = config.tagsAsObject ?? true;
  }

  async run(context, payload) {
    const method = DEVICE_METHOD_RESOLVER[this.findMethod] || findById;
    let result = await method(context.peripherals, this, payload);

    result = sort(sortOrder(this.sortField, this.sortDirection, payload), result);
    result = result.map((peripheral) => formatPeripheral(peripheral, this.tagsAsObject, this.attributesAsObject));


    if (!this.findMultiple) { result = result[0] || null; }

    if (this.resultPath) { payload = payloadHelper.set(this.resultPath, result, payload); }
    return [this.outputIds, payload];
  }
}

export default GetPeripheralNode;
