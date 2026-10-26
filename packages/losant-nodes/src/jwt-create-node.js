import * as payloadHelper from 'losant-handlebars';
import jwt from 'jsonwebtoken';
import errors from 'losant-nodejs-utils/src/errors.js';
import ljsonRender from './lib/ljson-render.js';
import jwtAlgorithms from 'losant-nodejs-utils/src/constants/jwt-algorithms.js';
import { isPlainObject } from 'omnibelt';

class JWTCreateNode {

  /* Example Config:
  {
    credentialNameTemplate: <String - Optional: Template for the name of a JWT credential. If set, secretTemplate, algorithmTemplate and issuerTemplate are ignored and the credential's secret, algorithm and issuer are used instead>,
    dataTemplate: <String - Required: JSON template or payload path (per dataTemplateType) of the claims to sign. Must resolve to an object>,
    dataTemplateType: <String - Optional: One of path or json. Defaults to path, and any value other than json is treated as path>,
    headerTemplate: <String - Optional: JSON template or payload path (per headerTemplateType) of additional header fields. Must resolve to an object>,
    headerTemplateType: <String - Optional: One of path or json. Any value other than json is treated as path>,
    secretTemplate: <String - Required unless credentialNameTemplate is set: Template for the secret key>,
    algorithmTemplate: <String - Optional: Template for the signing algorithm. Default HS256. Ignored if the header contains alg>,
    expiresIn: <Number - Optional: Seconds until the token expires. Ignored if the data contains exp>,
    issuerTemplate: <String - Optional: Template for the issuer (iss) to put on the token. Ignored if the data contains iss or credentialNameTemplate is set>,
    destinationPath: <String - Required: Payload path where the signed JWT string is written>
  }
  Notes:
    Result: The signed JWT string is written to destinationPath.
    Errors: Problems with the input are written to destinationPath as an error object instead of throwing: invalid
      dataTemplate or headerTemplate (not valid JSON, or not an object), or an unsupported algorithm. Only a
      failure in jwt.sign (for example an invalid secret for the algorithm) throws.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.credentialNameTemplate = config.credentialNameTemplate;
    this.dataTemplate = config.dataTemplate;
    this.dataTemplateType = config.dataTemplateType;
    this.headerTemplate = config.headerTemplate;
    this.headerTemplateType = config.headerTemplateType;
    this.secretTemplate = config.secretTemplate;
    this.algorithmTemplate = config.algorithmTemplate;
    this.expiresIn = parseInt(config.expiresIn, 10); // should be seconds
    this.issuerTemplate = config.issuerTemplate;
    this.destinationPath = config.destinationPath;
  }

  async run(context, payload) {
    let data, header = {};
    if (this.dataTemplateType === 'json') {
      try {
        data = ljsonRender(this.dataTemplate, payload, 'dataTemplate');
      } catch (e) {
        payload = payloadHelper.set(this.destinationPath, {
          error: { type: e.type, message: e.message }
        }, payload);
        return [ this.outputIds, payload ];
      }
    } else {
      data = payloadHelper.lookup(this.dataTemplate, payload);
    }
    if (!isPlainObject(data)) {
      const err = errors.InvalidJsonSource({ title: 'dataTemplate' });
      payload = payloadHelper.set(this.destinationPath, { error: err }, payload);
      return [ this.outputIds, payload ];
    }

    if (this.headerTemplate) {
      if (this.headerTemplateType === 'json') {
        try {
          header = ljsonRender(this.headerTemplate, payload, 'headerTemplate');
        } catch (e) {
          payload = payloadHelper.set(this.destinationPath, {
            error: { type: e.type, message: e.message }
          }, payload);
          return [ this.outputIds, payload ];
        }
      } else {
        header = payloadHelper.lookup(this.headerTemplate, payload);
      }
      if (!isPlainObject(header)) {
        const err = errors.InvalidJsonSource({ title: 'headerTemplate' });
        payload = payloadHelper.set(this.destinationPath, { error: err }, payload);
        return [ this.outputIds, payload ];
      }
    }

    let jwtConfig;
    if (this.credentialNameTemplate) {
      jwtConfig = await context.loadCredential({
        credentialNameTemplate: this.credentialNameTemplate,
        type: 'jwt',
        applicationId: context.applicationId,
        payload
      });
    } else {
      jwtConfig = {
        secret: payloadHelper.renderToString(this.secretTemplate, payload),
        algorithm: !header.alg && payloadHelper.renderToString(this.algorithmTemplate, payload),
        issuer: !data.iss && payloadHelper.renderToString(this.issuerTemplate, payload)
      };
    }

    const algorithm = header.alg || jwtConfig.algorithm || 'HS256';
    if (!jwtAlgorithms[algorithm]) {
      payload = payloadHelper.set(this.destinationPath,
        { error: { type: 'INVALID_ALGORITHM', message: `The algorithm ${algorithm} is not supported` } },
        payload
      );
      return [ this.outputIds, payload ];
    }

    const options = { algorithm, header };
    if (!data.exp && this.expiresIn) {
      options.expiresIn = this.expiresIn;
    }
    if (!data.iss && jwtConfig.issuer) {
      options.issuer = jwtConfig.issuer;
    }

    let token;
    try {
      token = jwt.sign(data, jwtConfig.secret, options);
    } catch (e) {

      throw errors.JWTSign({ message: e.message });
    }
    payload = payloadHelper.set(this.destinationPath, token, payload);
    return [ this.outputIds, payload ];
  }

}

export default JWTCreateNode;
