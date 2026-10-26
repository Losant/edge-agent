import stream from 'node:stream';
import path from 'node:path';
import ftp from 'basic-ftp';
import sftpClient from 'ssh2-sftp-client';
import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import { isPopulatedString, toNumber, timeoutP } from 'omnibelt';
import verifyHosts from 'losant-nodejs-utils/src/utils/verify-hosts.js';
import { MAX_RESPONSE_SIZE } from 'losant-nodejs-utils/src/utils/storage-helpers.js';
import { validateEncoding } from 'losant-nodejs-utils/src/utils/validate-encoding.js';
import { isTimeoutError } from './lib/common.js';
import fs from 'fs-extra';
import { renderAndValidateWriteToDiskPath, getFlagOption } from './lib/node-storage-helpers.js';

const errorToOutput = (e) => {
  if (isTimeoutError(e)) {
    const error = errors.NodeTimeout({ title: 'FTP: Get' });
    return { error: { type: error.type, message: error.message } };
  } else {
    return { error: { message: e.message } };
  }
};

const get = async ({
  dir, filename, config, encoding, timeout, sftp = false, diskPath, flags
}) => {
  let client, writeStream;
  let dataSize = 0;
  let hasConnected = false;
  const bufferData = [];
  try {
    if (diskPath) {
      writeStream = fs.createWriteStream(diskPath, { encoding, flags });
    } else {
      writeStream = new stream.Writable({
        write: (buffer, e, cb) => {
          dataSize += buffer && buffer.length || 0;
          if (dataSize > MAX_RESPONSE_SIZE) {
            return cb(errors.Validation({ message: 'File size cannot exceed 5MB' }));
          }
          bufferData.push(buffer);
          cb();
        }
      });
    }
    await timeoutP(timeout, (async () => {
      if (sftp) {
        client = new sftpClient();
        await client.connect(config);
        hasConnected = true;
        await client.get(path.join(dir, filename), writeStream, encoding);
        await client.end();
      } else {
        client = new ftp.Client(timeout);
        writeStream.once('error', (e) => {
          // got the idea from this https://github.com/patrickjuchli/basic-ftp/blob/v6.2.1/src/Client.ts#L569
          client.ftp.closeWithError(e);
        });
        await client.access(config);
        await client.downloadTo(writeStream, path.join(dir, filename));
        client.close();
      }
    })());
    if (diskPath) {
      return { value: diskPath };
    }
    return { value: (Buffer.concat(bufferData)).toString(encoding) };
  } catch (e) {
    try {
      writeStream.destroy();
      if (sftp) {
        if (hasConnected) {
          await client.end();
        }
      } else {
        await client.close();
      }
    } catch {}
    return errorToOutput(e);
  }
};

class FTPGetNode {

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

    fileNameTemplate: <String - Required: template for the name of the file to download>,
    directoryTemplate: <String - Required: template for the remote directory containing the file>,
    encoding: <String - Optional: encoding used to interpret the file contents. Default utf8>,
    diskPathTemplate: <String - Optional: Edge only. When set, the file is written to this local path instead of being returned in memory>,
    shouldAppend: <Boolean - Optional: with diskPathTemplate, append to the local file instead of overwriting it. Default false>,
    errorIfFileExists: <Boolean - Optional: with diskPathTemplate, fail if the local file already exists instead of overwriting it. Default false>,
    resultPath: <String - Required: payload path for { value: <String> } or { error: { message, type? } }. value is the file contents, or the local path when diskPathTemplate is set>
  }
  Notes:
    Connection, transfer, and timeout failures do not throw. They are written to resultPath as { error: { message } } (a timeout also sets error.type).
    A missing host, directory, or file name, an invalid port, encoding, or connection method, or an invalid disk path throws.
    Files returned in memory (no diskPathTemplate) cannot exceed 5MB.
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
    this.diskPathTemplate = config.diskPathTemplate;
    this.shouldAppend = config.shouldAppend || false;
    this.errorIfFileExists = config.errorIfFileExists || false;
    this.resultPath = config.resultPath;
  }

  async run(context, payload) {
    validateEncoding(this.encoding);
    let diskPath;
    if (this.diskPathTemplate) {
      diskPath = await renderAndValidateWriteToDiskPath(this, context, payload);
    }
    const flags = getFlagOption(this);

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

    let result;
    if (this.method === 'ftp') {
      result = await get({
        dir, filename, config, encoding: this.encoding, timeout: context.externalTimeout, diskPath, flags
      });
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

      result = await get({
        dir, filename, config, encoding: this.encoding, timeout: context.externalTimeout, diskPath, flags
      });
    } else if (this.method === 'sftp') {
      config.privateKey = payloadHelper.renderToString(this.privateKeyTemplate, payload);
      result = await get({
        dir, filename, config, encoding: this.encoding, timeout: context.externalTimeout, sftp: true, diskPath, flags
      });
    } else {
      throw errors.Validation({ message: 'Invalid connection method.' });
    }
    payload = payloadHelper.set(this.resultPath, result, payload);
    return [this.outputIds, payload];
  }
}

export default FTPGetNode;
