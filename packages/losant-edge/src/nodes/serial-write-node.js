import { SerialPort } from 'serialport';
import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import { checkEncoding } from '../utils.js';
import { defer, timeoutP, noop } from 'omnibelt';
import unescapeStr from 'losant-nodejs-utils/src/utils/unescape-str.js';
import { TEN_S_MS as timeoutWaitingForSerialTime } from 'losant-nodejs-utils/src/constants/time.js';
import { slowWriteToPort, validateSerialConfig } from '../lib/serial-utils.js';
import niceBooleanCast from 'losant-nodejs-utils/src/utils/nice-boolean-cast.js';
import { DEFAULT_SERIAL_CONFIG } from '../constants.js';

class SerialWriteNode {

  /* Example Config:
  {
    pathTemplate: <String - Required: path to the serial port. Paths inside the Edge Agent's protected directory are rejected>,
    writeTemplate: <String - Required: string to write to the port. Escape sequences in the rendered string are unescaped before writing>,
    encodeTemplate: <String - Optional: the encoding of the string to write. Default utf8>,
    baudRateTemplate: <Number - Optional: the baud rate at which to set the write, a positive integer. Default 9600>,
    dataBitsTemplate: <Number - Optional: the number of data bits per character to set. Default 8
      - valid data bits: 5, 6, 7, 8>,
    parityTemplate: <String - Optional: the parity to use for data verification. Default none
      - valid parity values: 'none', 'even', 'odd', 'space', 'mark'>,
    rtsctsTemplate: <Boolean - Optional: whether or not to use RTS/CTS. Default false>,
    stopBitsTemplate: <Number - Optional: whether to use 1 or 2 stop bits. Default 1>,
    resultPath: <String - Optional: payload path for true if the write succeeded, or { error: <message string> } if it failed. If blank, the result is discarded>
  }
  Notes:
    Invalid configuration (missing path or write value, invalid serial settings, unsupported
    encoding) throws. Runtime failures (port cannot open, write fails, port closes unexpectedly)
    do not throw and are only reported through resultPath.
    Opening the port, writing to it, and closing it are each limited to 10 seconds.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.pathTemplate = config.pathTemplate;
    this.writeTemplate = config.writeTemplate;
    this.encodeTemplate = config.encodeTemplate || DEFAULT_SERIAL_CONFIG.encoding;
    this.baudRateTemplate = config.baudRateTemplate || DEFAULT_SERIAL_CONFIG.baudRate;
    this.dataBitsTemplate = config.dataBitsTemplate || DEFAULT_SERIAL_CONFIG.dataBits;
    this.parityTemplate = config.parityTemplate || DEFAULT_SERIAL_CONFIG.parity;
    this.rtsctsTemplate = config.rtsctsTemplate || DEFAULT_SERIAL_CONFIG.rtscts;
    this.stopBitsTemplate = config.stopBitsTemplate || DEFAULT_SERIAL_CONFIG.stopBits;
    this.resultPath = config.resultPath;
  }

  async run(context, payload) {
    const path = payloadHelper.renderToString(this.pathTemplate, payload);
    const baudRate = Number(payloadHelper.render(this.baudRateTemplate, payload));
    const dataBits = Number(payloadHelper.render(this.dataBitsTemplate, payload));
    const parity = payloadHelper.renderToString(this.parityTemplate, payload).trim().toLowerCase();
    const rtscts = niceBooleanCast(payloadHelper.render(this.rtsctsTemplate, payload));
    const stopBits = Number(payloadHelper.render(this.stopBitsTemplate, payload));
    validateSerialConfig({
      path, baudRate, parity, dataBits, stopBits, rtscts
    });
    const write = payloadHelper.renderToString(this.writeTemplate, payload);
    if (!write) {
      throw errors.Validation({ message: 'Write Template is required for Serial Write Node.' });
    }
    const encoding = payloadHelper.renderToString(this.encodeTemplate, payload);
    checkEncoding(encoding);
    const port = new SerialPort({
      path,
      autoOpen: false,
      lock: false,
      baudRate,
      parity,
      rtscts,
      stopBits,
      dataBits
    });

    let deferredOpen = defer();
    let deferredClosed;
    let result = true;
    const closePort = async () => {
      if (deferredClosed) { return deferredClosed.promise; }
      deferredClosed = defer();

      port.removeAllListeners();
      port.on('error', noop);
      if (deferredOpen) { deferredOpen.resolve(); }

      if (port.isOpen) {
        return port.close(deferredClosed.resolve);
      } else {
        deferredClosed.resolve();
      }

      return deferredClosed.promise;
    };
    port.on('open', deferredOpen.resolve);

    port.on('error', (err) => {
      if (!result.error) {
        result = { error: err.message };
      }
      closePort();
    });

    port.on('close', () => {
      if (!result.error) {
        result = { error: 'Port unexpectedly closed.' };
      }
    });

    port.open();

    await timeoutP(timeoutWaitingForSerialTime, deferredOpen.promise).catch(() => {
      deferredOpen = null;
      if (!result.error) {
        result = { error: `Timeout occurred before port ${path} could open.` };
      }
    });

    if (!result.error) {
      const buffer = Buffer.from(unescapeStr(write), encoding);
      await timeoutP(timeoutWaitingForSerialTime, slowWriteToPort(port, buffer)).catch((err) => {
        if (!result.error) {
          result = { error: err.message };
        }
      });
    }

    await timeoutP(timeoutWaitingForSerialTime, closePort()).catch(noop);

    if (this.resultPath) {
      payload = payloadHelper.set(this.resultPath, result, payload);
    }

    return [this.outputIds, payload];
  }

}


export default SerialWriteNode;
