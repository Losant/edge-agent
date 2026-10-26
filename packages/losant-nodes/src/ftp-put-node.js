import ftp from 'basic-ftp';
import sftpClient from 'ssh2-sftp-client';
import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import { validateEncoding } from 'losant-nodejs-utils/src/utils/validate-encoding.js';
import stream from 'stream';
import axios from 'losant-nodejs-utils/src/axios.js';
import { isPopulatedString, toNumber, timeoutP } from 'omnibelt';
import path from 'node:path';
import verifyHosts from 'losant-nodejs-utils/src/utils/verify-hosts.js';
import { isTimeoutError } from './lib/common.js';
import fs from 'fs-extra';
import { renderAndValidateReadFromDiskPath } from './lib/node-storage-helpers.js';

const errorToOutput = (e) => {
  if (isTimeoutError(e)) {
    const error = errors.NodeTimeout({ title: 'FTP: Put' });
    return { error: { type: error.type, message: error.message }, success: false };
  } else {
    return { error: { message: e.message }, success: false };
  }
};

const ftpPut = async (upStream, dir, filename, config, timeout) => {
  let client;
  try {
    await timeoutP(timeout, (async () => {
      client = new ftp.Client(timeout);
      await client.access(config);
      await client.ensureDir(dir);
      await client.uploadFrom(upStream, path.join(dir, filename));
      await client.close();
    })());
    return { success: true };
  } catch (e) {
    try { await client.close(); } catch {}
    return errorToOutput(e);
  }
};

const sftpPut = async (upStream, dir, filename, config, timeout) => {
  let client;
  let hasConnected = false;
  config.readyTimeout = timeout;
  try {
    await timeoutP(timeout, (async () => {
      client = new sftpClient();
      await client.connect(config);
      hasConnected = true;
      await client.mkdir(dir, true);
      await client.put(upStream, path.join(dir, filename));
      await client.end();
    })());
    return { success: true };
  } catch (e) {
    if (hasConnected) {
      try { await client.end(); } catch {}
    }
    return errorToOutput(e);
  }
};

class FTPPutNode {

  /* Example Config:
  {
    method: <String - Optional: one of ftp, ftps, or sftp. Default ftp>,
    hostTemplate: <String - Required: template for the host address. The host is checked against the network access policy>,
    portTemplate: <String - Optional: template for the port to connect to, 1 to 65535. Default 21 for ftp and ftps, 22 for sftp>,
    userTemplate: <String - Optional: template for the username to connect with>,
    passwordTemplate: <String - Optional: template for the password>,

    // FTPS specific
    clientKeyTemplate: <String - Optional: template for the client key. clientCertTemplate is only used when this is set>,
    clientCertTemplate: <String - Optional: template for the client certificate. Only used together with clientKeyTemplate>,
    caCertTemplate: <String - Optional: template for the CA certificate>,
    disableSSLVerification: <Boolean - Optional: skip verification of the server certificate. Default false>,

    // SFTP specific
    privateKeyTemplate: <String - Optional: template for the SSH private key>,

    fileNameTemplate: <String - Required: template for the name of the file to create on the server>,
    directoryTemplate: <String - Required: template for the remote directory. It is created if it does not exist>,
    fileContentTemplate: <String - Optional: template for the file content to upload>,
    fileUrlTemplate: <String - Optional: template for a URL whose content is downloaded and uploaded>,
    diskPathTemplate: <String - Optional: Edge only. Local file to upload>,
    encoding: <String - Optional: encoding used to interpret the content. Default utf8>,
    resultPath: <String - Optional: payload path for { success: true } or { success: false, error: { message, type? } }>
  }
  Notes:
    Exactly one of fileContentTemplate, fileUrlTemplate, and diskPathTemplate should be provided. If more than one is set, fileUrlTemplate takes precedence, then diskPathTemplate, then fileContentTemplate. If none is set, the node throws.
    Connection, transfer, and timeout failures, as well as failures to download fileUrlTemplate or read diskPathTemplate, do not throw. They are written to resultPath as { success: false, error } (a timeout also sets error.type).
    A missing host, directory, or file name, an invalid port, encoding, or connection method, or missing content throws.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.method = config.method || 'ftp';
    this.hostTemplate = config.hostTemplate;
    this.portTemplate = config.portTemplate;
    this.userTemplate = config.userTemplate;
    this.passwordTemplate = config.passwordTemplate;

    //FTPS
    this.disableSSLVerification = config.disableSSLVerification || false;
    this.clientKeyTemplate = config.clientKeyTemplate;
    this.clientCertTemplate = config.clientCertTemplate;
    this.caCertTemplate = config.caCertTemplate;

    //SFTP
    this.privateKeyTemplate = config.privateKeyTemplate;

    this.encoding = config.encoding || 'utf8';
    this.fileNameTemplate = config.fileNameTemplate;
    this.directoryTemplate = config.directoryTemplate;
    this.fileContentTemplate = config.fileContentTemplate;
    this.fileUrlTemplate = config.fileUrlTemplate;
    this.diskPathTemplate = config.diskPathTemplate;
    this.resultPath = config.resultPath;
  }

  async run(context, payload) {
    const filename = payloadHelper.renderToString(this.fileNameTemplate, payload);
    if (!filename) { throw errors.MissingField({ title: 'File Name' }); }

    const dir = payloadHelper.renderToString(this.directoryTemplate, payload);
    if (!dir) { throw errors.MissingField({ title: 'Directory' }); }

    const host = payloadHelper.renderToString(this.hostTemplate, payload);
    if (!host) { throw errors.MissingField({ title: 'Host' }); }
    await verifyHosts(host);

    let port = payloadHelper.renderToString(this.portTemplate, payload);
    port = port.trim();
    if (!port) {
      port = this.method === 'sftp' ? 22 : 21;
    } else {
      port = toNumber(port);
      if (!Number.isSafeInteger(port) || port < 1 || port > 65535) {
        throw errors.Validation({ message: `Invalid ${this.method.toUpperCase()} port: ${port}` });
      }
    }

    let user = payloadHelper.renderToString(this.userTemplate, payload);
    let password = payloadHelper.renderToString(this.passwordTemplate, payload);
    if (!user) { user = null; }
    if (!password) { password = null; }
    const config = { host, port, user, password };

    let upStream;
    if (this.fileUrlTemplate) {
      const fileUrl = payloadHelper.renderToString(this.fileUrlTemplate, payload);
      try {
        upStream = await axios({
          url: fileUrl,
          method: 'GET',
          responseType: 'stream',
          timeout: context.externalTimeout
        });
        upStream = upStream.data;
      } catch (e) {
        payload = payloadHelper.set(this.resultPath, errorToOutput(e), payload);
        return [this.outputIds, payload];
      }
    } else if (this.diskPathTemplate) {
      let diskPath;
      try {
        diskPath = await renderAndValidateReadFromDiskPath(this, context, payload);
      } catch (e) {
        payload = payloadHelper.set(this.resultPath, errorToOutput(e), payload);
        return [this.outputIds, payload];
      }
      validateEncoding(this.encoding);
      upStream = fs.createReadStream(diskPath, { encoding: this.encoding });
    } else if (this.fileContentTemplate) {
      const fileContent = payloadHelper.renderToString(this.fileContentTemplate, payload);
      validateEncoding(this.encoding, fileContent);
      upStream = new stream.Readable();
      upStream.push(fileContent, this.encoding);
      upStream.push(null);
    } else {
      throw errors.MissingField({ title: 'File Content' });
    }

    let result;
    if (this.method === 'ftp') {
      result = await ftpPut(upStream, dir, filename, config, context.externalTimeout);
    } else if (this.method === 'ftps') {
      config.secure = true;
      config.secureOptions = {};
      config.secureOptions.rejectUnauthorized = !this.disableSSLVerification;
      if (isPopulatedString(this.clientKeyTemplate)) {
        config.secureOptions.key = payloadHelper.renderToString(this.clientKeyTemplate, payload);
        config.secureOptions.cert = payloadHelper.renderToString(this.clientCertTemplate, payload);
      }
      if (isPopulatedString(this.caCertTemplate)) {
        config.secureOptions.ca = payloadHelper.renderToString(this.caCertTemplate, payload);
      }

      result = await ftpPut(upStream, dir, filename, config, context.externalTimeout);
    } else if (this.method === 'sftp') {
      config.privateKey = payloadHelper.renderToString(this.privateKeyTemplate, payload);
      result = await sftpPut(upStream, dir, filename, config, context.externalTimeout);
    } else {
      throw errors.Validation({ message: 'Invalid connection method.' });
    }
    if (!upStream._readableState.closed) { try { upStream.destroy(); } catch {} }
    payload = payloadHelper.set(this.resultPath, result, payload);
    return [this.outputIds, payload];
  }
}

export default FTPPutNode;
