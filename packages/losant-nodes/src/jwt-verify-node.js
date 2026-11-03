import * as payloadHelper from 'losant-handlebars';
import jwt from 'jsonwebtoken';

class JWTVerifyNode {

  /* Example Config:
  {
    credentialNameTemplate: <String - Optional: template for the name of a JWT credential supplying the secret and issuer. When set, secretTemplate and issuerTemplate are ignored>,
    tokenTemplate: <String - Required: template for the JWT to verify. The rendered value is trimmed>,
    secretTemplate: <String - Required unless credentialNameTemplate is set: template for the secret key>,
    issuerTemplate: <String - Optional: template for the issuer the token must match. No issuer check is made when it renders empty>,
    errorPath: <String - Optional: payload path for { type, message } describing why verification failed>
  }
  Notes:
    Outputs: outputIds[0] is taken when the token is invalid, outputIds[1] when it is valid.
    A verification failure does not throw. The error is written to errorPath if set, and the invalid output is taken.
    Errors loading the credential still throw.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.credentialNameTemplate = config.credentialNameTemplate;
    this.tokenTemplate = config.tokenTemplate;
    this.secretTemplate = config.secretTemplate;
    this.issuerTemplate = config.issuerTemplate;
    this.errorPath = config.errorPath;
  }

  async run(context, payload) {
    const data = payloadHelper.renderToString(this.tokenTemplate, payload).trim();

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
        issuer: payloadHelper.renderToString(this.issuerTemplate, payload)
      };
    }
    const options = jwtConfig.issuer ? { issuer: jwtConfig.issuer } : {};

    let result;
    try {
      jwt.verify(data, jwtConfig.secret, options);
      result = true;
    } catch (err) {
      if (this.errorPath) {
        const errMessage = err.message;
        const strippedErr = errMessage.indexOf('. expected:') > -1 ?
          errMessage.substring(0, errMessage.indexOf('. expected:')) : errMessage;
        const error = { type: err.name, message: strippedErr };
        payload = payloadHelper.set(this.errorPath, error, payload);
      }
      // A verification error means the token is invalid. It is reported at
      // errorPath (if set) and routed to the invalid output, not thrown.
      result = false;
    }
    const resultIds = this.outputIds[Number(result)];
    return [ resultIds, payload ];
  }

}

export default JWTVerifyNode;
