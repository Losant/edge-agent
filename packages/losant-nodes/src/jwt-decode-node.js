import * as payloadHelper from 'losant-handlebars';
import jwt from 'jsonwebtoken';

class JWTDecodeNode {

  /* Example Config:
  {
    tokenTemplate: <String - Required: template for the JWT to decode. The rendered value is trimmed>,
    complete: <Boolean - Optional: if true, the result includes the header, payload, and signature instead of only the payload. Default false>,
    destinationPath: <String - Required: payload path for the decoded token, or null if the token cannot be decoded>
  }
  Notes:
    The token is decoded only. The signature is NOT verified; use the JWT Verify node for that.
    Decoding failures never throw; null is written to destinationPath.
    There is a single output.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.tokenTemplate = config.tokenTemplate;
    this.complete = config.complete || false;
    this.destinationPath = config.destinationPath;
  }

  run(context, payload) {
    const token = payloadHelper.renderToString(this.tokenTemplate, payload).trim();

    const options = { complete: this.complete };

    let decodedToken = null;
    try {
      decodedToken = jwt.decode(token, options);
    } catch {
      // jwt.decode returns null for most malformed tokens and throws for others.
      // Both cases are treated as null.
    }

    payload = payloadHelper.set(this.destinationPath, decodedToken, payload);
    return [ this.outputIds, payload ];
  }

}

export default JWTDecodeNode;
