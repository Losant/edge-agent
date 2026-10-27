import axios from 'losant-nodejs-utils/src/axios.js';
import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import LJSON from 'losant-nodejs-utils/src/ljson.js';
import { isNilOrEmpty, camelCase, isNil, is, snakeCase, toLower, pipe, path } from 'omnibelt';
import { getDataByTemplateType } from './lib/common.js';
import isValidDomain from 'losant-nodejs-utils/src/utils/is-valid-domain.js';
const URL_CONST = 'service-now.com';
const lowerSnakeCase = pipe(snakeCase, toLower);

const ACTIONS = {
  tableGet: {
    method: 'get',
    qs: {
      sysparmQuery: { type: 'string' },
      sysparmDisplayValue: { type: 'boolean' },
      sysparmFields: { type: 'string' },
      sysparmView: { type: 'string' },
      sysparmLimit: { type: 'number' },
      sysparmOffset: { type: 'number' },
      sysparmExcludeReferenceLink: { type: 'boolean' },
      sysparmSuppressPaginationHeader: { type: 'boolean' }
    }
  },
  tablePost: {
    method: 'post',
    bodyRequired: true,
    qs: {
      sysparmDisplayValue: { type: 'boolean' },
      sysparmFields: { type: 'string' },
      sysparmView: { type:  'string' },
      sysparmExcludeReferenceLink: { type: 'boolean' },
      sysparmInputDisplayValue: { type: 'boolean' }
    }
  },
  tableRowGet: {
    method: 'get',
    idRequired: true,
    qs: {
      sysparmDisplayValue: { type: 'boolean' },
      sysparmFields: { type: 'string' },
      sysparmView: { type:  'string' },
      sysparmExcludeReferenceLink: { type: 'boolean' }
    }
  },
  tableRowPut: {
    method: 'put',
    bodyRequired: true,
    idRequired: true,
    qs: {
      sysparmDisplayValue: { type: 'boolean' },
      sysparmFields: { type: 'string' },
      sysparmView: { type:  'string' },
      sysparmExcludeReferenceLink: { type: 'boolean' },
      sysparmInputDisplayValue: { type: 'boolean' }
    }
  }
};

class ServiceNowNode {
  /* Example Config:
    {
      instanceNameTemplate: <String - Optional: ServiceNow instance name, used to build https://<instance>.service-now.com. Required unless urlTemplate renders non-empty>,
      urlTemplate: <String - Optional: base URL of the ServiceNow instance. Takes precedence over instanceNameTemplate when it renders non-empty>,
      usernameTemplate: <String - Required: template for the ServiceNow username>,
      passwordTemplate: <String - Required: template for the ServiceNow password>,
      tableNameTemplate: <String - Required: name of the table to call, for example incident>,
      action: <String - Required: one of tableGet|tablePost|tableRowGet|tableRowPut>,
      idTemplate: <String - Optional: Required for tableRowGet and tableRowPut, ignored otherwise. The id of the table row>,
      resultPath: <String - Optional: payload path for the response data, or { error: { statusCode, message, detail? } } if the request fails>,
      params: [
        {
          name: <String - Required: template for a query parameter name (for example sysparmLimit)>,
          type: <String - Required: string|path. string renders value as a template, path looks value up in the payload>,
          value: <String, Boolean, or Number - Required: parameter value>
        }
      ],
      bodyTemplate: <String or Array - Optional: template for the request body. Default []>,
      bodyTemplateType: <String - Optional: payloadPath|jsonTemplate|individualFields. How bodyTemplate is interpreted. Default individualFields>
    }
    Notes:
      The request body is only sent for tablePost and tableRowPut; bodyTemplate and bodyTemplateType are ignored for tableGet and tableRowGet.
      Params with a name that is not valid for the chosen action are ignored. Valid values are: sysparmQuery (tableGet), sysparmLimit (tableGet), sysparmOffset (tableGet),
      sysparmSuppressPaginationHeader (tableGet), sysparmInputDisplayValue (tablePost and tableRowPut), sysparmDisplayValue, sysparmFields, sysparmView,
      and sysparmExcludeReferenceLink (all actions). Param values must match the type the parameter expects (string, boolean, or finite number), otherwise the node throws.
      If resultPath is not set, request failures are swallowed and the payload passes through unchanged.
      Configuration problems (missing url/instance, username, password, table name, or id; invalid action; invalid body JSON) throw.
      The node always sends the payload to all outputs after the request completes, whether or not the request succeeded.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.instanceNameTemplate = config.instanceNameTemplate;
    this.urlTemplate = config.urlTemplate;
    this.usernameTemplate = config.usernameTemplate;
    this.passwordTemplate = config.passwordTemplate;
    this.tableNameTemplate = config.tableNameTemplate; // incident, request, xp
    this.action = camelCase(config.action);
    this.idTemplate = config.idTemplate;
    this.resultPath = config.resultPath;
    this.params = config.params || [];
    this.bodyTemplateType = config.bodyTemplateType || 'individualFields';
    this.bodyTemplate = config.bodyTemplate || [];
  }

  async run(context, payload) {
    let url = payloadHelper.renderToString(this.urlTemplate, payload);
    if (isNilOrEmpty(url)) {
      const instanceName = payloadHelper.renderToString(this.instanceNameTemplate, payload);
      if (isNilOrEmpty(instanceName)) {
        throw errors.MissingField({ title: 'ServiceNow Url or Instance Name' });
      }
      if (!isValidDomain(`${instanceName}.${URL_CONST}`)) {
        throw errors.Validation({ message: `Instance name is invalid: ${instanceName}` });
      }
      url = `https://${instanceName}.${URL_CONST}`;
    }

    url += '/api/now/v2/table/';

    const username = payloadHelper.renderToString(this.usernameTemplate, payload);
    const password = payloadHelper.renderToString(this.passwordTemplate, payload);
    if (isNilOrEmpty(username)) {
      throw errors.MissingField({ title: 'ServiceNow Username' });
    }

    if (isNilOrEmpty(password)) {
      throw errors.MissingField({ title: 'ServiceNow Password' });
    }

    const tableName = payloadHelper.renderToString(this.tableNameTemplate, payload);
    if (isNilOrEmpty(tableName)) {
      throw errors.MissingField({ title: 'ServiceNow Table Name' });
    } else {
      url += `${tableName}`;
    }
    const actionInfo = ACTIONS[this.action];
    if (isNil(actionInfo)) {
      throw errors.Validation({ message: `The action ${this.action} is not valid.` });
    }

    if (actionInfo.idRequired) {
      const id = payloadHelper.renderToString(this.idTemplate, payload);
      if (isNilOrEmpty(id)) {
        throw errors.MissingField({ title: 'ServiceNow ID' });
      }
      url += `/${id}`;
    }

    let body;
    if (actionInfo.bodyRequired) {
      body = getDataByTemplateType(this.bodyTemplate, this.bodyTemplateType, payload);
      if (is(String, body)) {
        try {
          body = LJSON.parse(body);
        } catch {
          throw errors.InvalidJsonTemplate({ title: 'bodyTemplate' });
        }
      }
    }

    const qs = {};

    this.params.forEach((param) => {
      if (!param.name || !param.value) { return; }
      const name = payloadHelper.renderToString(param.name, payload);
      if (!name) { return; }

      const info = actionInfo.qs[name];
      if (!info) { return; }

      let value = param.value;
      if (param.type === 'path') {
        value = payloadHelper.lookup(value, payload);
      } else {
        value = payloadHelper.render(value, payload);
      }

      if (isNil(value)) { return; }

      if (info.type === 'number') {
        value = Number(value);
        if (!isFinite(value)) {
          throw errors.Validation({ message: `Param ${name} must be a finite number` });
        }
      }

      if (typeof(value) !== info.type) {
        throw errors.Validation({ message: `Param ${name} is not of the correct type` });
      }

      qs[lowerSnakeCase(name)] = value;
    });

    let result, error;
    try {
      const request = await axios({
        method: actionInfo.method,
        url,
        auth: {
          username,
          password
        },
        headers: {
          'Accept': 'application/json',
          'Content-Type': 'application/json'
        },
        params: qs,
        data: body
      });
      result = request.data;
    } catch (e) {
      error = e;
    }

    if (error && this.resultPath) {
      const errorResp = { statusCode: error.response ? error.response.status : error.code, message: error.message };
      if (path([ 'response', 'data', 'error' ], error)) {
        errorResp.message = error.response.data.error.message;
        errorResp.detail = error.response.data.error.detail;
      }
      payload = payloadHelper.set(this.resultPath, { error: errorResp }, payload);
    }

    if (result && this.resultPath) {
      payload = payloadHelper.set(this.resultPath, result, payload);
    }
    return [this.outputIds, payload];
  }

}

export default ServiceNowNode;
