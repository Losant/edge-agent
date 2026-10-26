import { Tag } from 'st-ethernet-ip';
import * as payloadHelper from 'losant-handlebars';
import errors from 'losant-nodejs-utils/src/errors.js';
import {
  isNilOrEmpty, curry, capitalize,
  toNumber, has
} from 'omnibelt';
import { getTimeoutTemplate } from 'losant-nodes/src/lib/common.js';
import { clampPositiveEnv } from '../utils.js';

const MAX_ALLEN_BRADLEY_LENGTH = clampPositiveEnv('ALLENBRADLEY_MAX_LENGTH', 255);
const PROGRAM_PREFIX = 'Program:';

const isKeyValid = (key) => {
  return key !== 'errors' && !key.startsWith('errors.') && key !== 'plcProperties' && !key.startsWith('plcProperties.');
};

const validateRenderInstructions = curry((nodeType, instructions, payload, instructionsType) => {
  const payloadPath = instructionsType === 'payloadPath';

  if (payloadPath) {
    instructions = payloadHelper.lookup(instructions, payload) || [];
  }
  if (!Array.isArray(instructions)) {
    throw errors.Validation({ message: `${capitalize(nodeType)} instructions must be an array.` });
  }
  if (instructions.length < 1) {
    throw errors.Validation({ message: `${capitalize(nodeType)} instructions are required for Allen-Bradley ${nodeType}` });
  }
  const tagNameToProgram = new Map();
  return instructions.map((instruction) => {
    if (!instruction || typeof instruction !== 'object') {
      throw errors.Validation({ message: `Each ${nodeType} instruction must be an object.` });
    }
    let tag = payloadPath ? instruction.tag : payloadHelper.renderToString(instruction.tagTemplate, payload);
    let program = payloadPath ? instruction.program : payloadHelper.renderToString(instruction.programTemplate, payload);
    if (tag?.startsWith(PROGRAM_PREFIX) && program && !tag.toLowerCase().startsWith(`${PROGRAM_PREFIX}${program}`.toLowerCase())) {
      throw errors.Validation({ message: `Tag name (${tag}) conflicts with given program name (${program}).` });
    }
    let value, length, key;
    if (nodeType === 'write') {
      value = payloadPath ? instruction.value : payloadHelper.render(instruction.valueTemplate, payload);
      if (Array.isArray(value) && value.length > MAX_ALLEN_BRADLEY_LENGTH) {
        throw errors.Validation({ message: `Value has excceed max length of ${MAX_ALLEN_BRADLEY_LENGTH}.` });
      }
    } else {
      if (payloadPath && has('length', instruction)) {
        length = toNumber(instruction.length);
      } else if (instruction.lengthTemplate) {
        length = toNumber(payloadHelper.render(instruction.lengthTemplate, payload));
      }
      key = instruction.key;
    }
    if (isNilOrEmpty(tag)) {
      throw errors.Validation({ message: 'Tag is required.' });
    }
    if (!Tag.isValidTagname(tag)) {
      throw errors.Validation({ message: 'Tag name must be a valid string.' });
    }
    if (isNilOrEmpty(program)) {
      program = null;
    } else if (!Tag.isValidTagname(program)) {
      throw errors.Validation({ message: 'Program name must be a valid string.' });
    }
    if (nodeType === 'read') {
      if (isNilOrEmpty(key)) {
        key = tag;
      }
      if (!isKeyValid(key)) {
        throw errors.Validation({ message: 'Keys cannot contain the special path errors or plcProperties.' });
      }
      if (length !== undefined) {
        if (isNaN(length) || !Number.isInteger(length) || length < 1 || length > MAX_ALLEN_BRADLEY_LENGTH) {
          throw errors.Validation({ message: `Length must be an integer greater than 0 and must not exceed ${MAX_ALLEN_BRADLEY_LENGTH}.` });
        }
      } else {
        length = 0;
      }
    }
    if (tag.startsWith(PROGRAM_PREFIX)) {
      tag = tag.replace(PROGRAM_PREFIX, '');
      const parts = tag.split('.');
      program = parts.shift();
      tag = parts.join('.');
    }
    tag = tag.toLowerCase();
    const programSet = tagNameToProgram.get(tag) || new Set();
    if (programSet.has(program)) {
      throw errors.Validation({ message: `Cannot ${nodeType} to the same tag (${tag}) twice.` });
    }
    programSet.add(program);
    tagNameToProgram.set(tag, programSet);
    return { tag, program, key, value, length };
  });
});

export const validateRenderReadInstructions = validateRenderInstructions('read');
export const validateRenderWriteInstructions = validateRenderInstructions('write');

export const validateAllenBradleyConfig = async (payload, node, { externalTimeout }) => {
  let slot = payloadHelper.renderToString(node.slotTemplate, payload);
  const host = payloadHelper.renderToString(node.hostTemplate, payload);
  let keepRate = payloadHelper.renderToString(node.keepRateTemplate, payload);
  if (!host) {
    throw errors.Validation({ message: 'Host is required.' });
  }

  if (isNilOrEmpty(slot)) {
    slot = 0;
  } else {
    slot = parseInt(slot, 10);
  }
  if (isNaN(slot)) {
    throw errors.Validation({ message: 'Slot must be a valid integer.' });
  }
  if (slot < 0 || slot > 255) {
    throw errors.Validation({ message: 'Slot must be an integer between 0 and 255' });
  }
  if (isNilOrEmpty(keepRate)) {
    keepRate = 0;
  } else {
    keepRate = parseInt(keepRate, 10);
  }
  if (isNaN(keepRate)) {
    throw errors.Validation({ message: 'Keep Alive rate must be a valid integer.' });
  }
  if (keepRate < 0 || keepRate > 300) {
    throw errors.Validation({ message: 'Keep Alive rate must be between 0(off) and 300(s).' });
  }
  const timeout = getTimeoutTemplate(node, payload, externalTimeout);
  return { host, slot, keepRate, timeout };
};
