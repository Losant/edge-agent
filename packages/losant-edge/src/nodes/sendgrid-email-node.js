import BaseSendgridEmailNode from 'losant-nodes/src/lib/base-sendgrid-email-node.js';

const DEFAULT_FROM_DOMAIN = 'workflows.losant.com';

class SendgridEmailNode extends BaseSendgridEmailNode {

  isValidFromEmail(context, email) {
    if (!email) { return false; }

    return !BaseSendgridEmailNode.LOSANT_EMAIL_REGEXP.test(email);
  }

  fallbackFromEmail(context) {
    return `${context.flowId}@${DEFAULT_FROM_DOMAIN}`;
  }

}

export default SendgridEmailNode;
