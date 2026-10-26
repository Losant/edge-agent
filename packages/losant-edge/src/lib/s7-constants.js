import { clampPositiveEnv } from '../utils.js';

export const S7_DATA_TYPES = [
  'BOOL',
  'BYTE',
  'INT',
  'WORD',
  'DINT',
  'DWORD',
  'REAL',
  'CHAR',
  'TIME',
  'TIME_OF_DAY',
  'DATE'
];

export const S7_WORDLENS = {
  BOOL: 2,
  BYTE: 2,
  CHAR: 2,
  INT: 4,
  WORD: 4,
  DATE: 4,
  DINT: 6,
  DWORD: 6,
  TIME: 6,
  TIME_OF_DAY: 6,
  REAL: 8
};

export const S7_BUFFER_LENGTHS = {
  BOOL: 1,
  BYTE: 1,
  CHAR: 1,
  INT: 2,
  WORD: 2,
  DATE: 2,
  DINT: 4,
  DWORD: 4,
  TIME: 4,
  TIME_OF_DAY: 4,
  REAL: 4
};

export const S7_DATA_TYPE_UPPER_LIMITS = {
  INT: 32767,
  WORD: 65535,
  DINT: 2147483647,
  DWORD: 4294967295,
  TIME: 2147483647,
  REAL: 3.402823e+38
};

export const S7_DATA_TYPE_LOWER_LIMITS = {
  INT: -32768,
  WORD: 0,
  DINT: -2147483648,
  DWORD: 0,
  TIME: -2147483648,
  REAL: -3.402823e+38
};

export const IDLE_S7_CLEANUP_INTERVAL = clampPositiveEnv('IDLE_S7_CLEANUP_INTERVAL', 10 * 1000);
export const MAX_INSTRUCTION_SIZE = 20;
