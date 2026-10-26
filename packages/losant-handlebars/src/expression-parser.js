/* eslint-disable no-bitwise */
/*!
 Based on ndef.parser, by Raphael Graf(r@undefined.ch)
 http://www.undefined.ch/mparser/index.html

 Ported to JavaScript and modified by Matthew Crumley (email@matthewcrumley.com, http://silentmatt.com/)

 You are free to use and modify this code in anyway you find useful. Please leave this comment in the code
 to acknowledge its original source. If you feel like it, I enjoy hearing about projects that use my code,
 but don't feel like you have to let me know or ask permission.
*/

import errors from './errors.js';
import {
  toString, includes, isNil, isArrayLike, values as oValues
} from 'omnibelt';

const TNUMBER = 0;
const TOP1 = 1;
const TOP2 = 2;
const TVAR = 3;
const TFUNCALL = 4;
const PRIMARY = 1 << 0;
const OPERATOR = 1 << 1;
const FUNCTION = 1 << 2;
const LPAREN = 1 << 3;
const RPAREN = 1 << 4;
const COMMA = 1 << 5;
const SIGN = 1 << 6;
const CALL = 1 << 7;
const NULLARY_CALL = 1 << 8;

const ops2funcs = new Set(['atan2', 'pow', 'max', 'min', 'includes']);

const object = (o) => {
  const F = function() {};
  F.prototype = o;
  return new F();
};

const Token = function(type_, index_, prio_, number_) {
  this.type_ = type_;
  this.index_ = index_ || 0;
  this.prio_ = prio_ || 0;
  if (type_ === TNUMBER) {
    this.number_ = number_;
  } else {
    this.number_ = (number_ !== undefined && number_ !== null) ? number_ : 0;
  }

  this.toString = function() {
    switch (this.type_) {
      case TNUMBER:
        return this.number_;
      case TOP1:
      case TOP2:
      case TVAR:
        return this.index_;
      case TFUNCALL:
        return 'CALL';
      default:
        return 'Invalid Token';
    }
  };
};

const escapable =
  // eslint-disable-next-line no-control-regex, no-misleading-character-class
  /[\\'\x00-\x1f\x7f-\x9f\u00ad\u0600-\u0604\u070f\u17b4\u17b5\u200c-\u200f\u2028-\u202f\u2060-\u206f\ufeff\ufff0-\uffff]/g;
const meta = {    // table of character substitutions
  '\b': '\\b',
  '\t': '\\t',
  '\n': '\\n',
  '\f': '\\f',
  '\r': '\\r',
  '\'': '\\\'',
  '\\': '\\\\'
};

const escapeValue = (v, quoteType) => {
  if (typeof v === 'string') {
    escapable.lastIndex = 0;
    if (escapable.test(v)) {
      v = v.replace(escapable, (a) => {
        const c = meta[a];
        return typeof c === 'string' ? c : `\\u${(`0000${a.charCodeAt(0).toString(16)}`).slice(-4)}`;
      });
    }
    return quoteType + v + quoteType;
  }
  return v;
};

class Expression {
  constructor(tokens, ops1, ops2, functions, ops2Str = {}) {
    this.tokens = tokens;
    this.ops1 = ops1;
    this.ops2 = ops2;
    this.functions = functions;
    this.ops2Str = {
      atan2: 'Math.atan2',
      pow: 'Math.pow',
      min: 'min',
      max: 'max',
      includes: 'includes',
      ...ops2Str
    };
  }

  simplify(values) {
    values = values || {};
    const nstack = [];
    const newexpression = [];
    let n1, n2, f;
    (this.tokens || []).forEach((item) => {
      const type_ = item.type_;
      if (type_ === TNUMBER) {
        nstack.push(item);
      } else if (type_ === TVAR && (item.index_ in values)) {
        item = new Token(TNUMBER, 0, 0, values[item.index_]);
        nstack.push(item);
      } else if (type_ === TOP2 && nstack.length > 1) {
        n2 = nstack.pop();
        n1 = nstack.pop();
        f = this.ops2[item.index_];
        item = new Token(TNUMBER, 0, 0, f(n1.number_, n2.number_));
        nstack.push(item);
      } else if (type_ === TOP1 && nstack.length > 0) {
        n1 = nstack.pop();
        f = this.ops1[item.index_];
        item = new Token(TNUMBER, 0, 0, f(n1.number_));
        nstack.push(item);
      } else {
        while (nstack.length > 0) {
          newexpression.push(nstack.shift());
        }
        newexpression.push(item);
      }
    });
    while (nstack.length > 0) {
      newexpression.push(nstack.shift());
    }

    return new Expression(newexpression, object(this.ops1), object(this.ops2), object(this.functions), this.ops2Str);
  }

  evaluate(values) {
    values = values || {};
    const nstack = [];
    let n1, n2, f;
    (this.tokens || []).forEach((item) => {
      const type_ = item.type_;
      if (type_ === TNUMBER) {
        nstack.push(item.number_);
      } else if (type_ === TOP2) {
        n2 = nstack.pop();
        n1 = nstack.pop();
        f = this.ops2[item.index_];
        nstack.push(f(n1, n2));
      } else if (type_ === TVAR) {
        if (item.index_ in values) {
          nstack.push(values[item.index_]);
        } else if (item.index_ in this.functions) {
          nstack.push(this.functions[item.index_]);
        } else {
          throw errors.ExpressionError({ message: `Undefined variable: ${item.index_}` });
        }
      } else if (type_ === TOP1) {
        n1 = nstack.pop();
        f = this.ops1[item.index_];
        nstack.push(f(n1));
      } else if (type_ === TFUNCALL) {
        n1 = nstack.pop();
        f = nstack.pop();
        if (f.apply && f.call) {
          if (Object.prototype.toString.call(n1) === '[object Array]') {
            nstack.push(f.apply(undefined, n1));
          } else {
            // eslint-disable-next-line no-useless-call
            nstack.push(f.call(undefined, n1));
          }
        } else {
          throw errors.ExpressionError({ message: `${f} is not a function` });
        }
      } else {
        throw errors.ExpressionError({ message: 'Invalid Expression' });
      }
    });
    if (nstack.length > 1) {
      throw errors.ExpressionError({ message: 'Invalid Expression (parity)' });
    }
    return nstack[0];
  }

  toString(quoteType = "'") {
    const nstack = [];
    let n1, n2, f;
    (this.tokens || []).forEach((item) => {
      const type_ = item.type_;
      if (type_ === TNUMBER) {
        nstack.push(escapeValue(item.number_, quoteType));
      } else if (type_ === TOP2) {
        n2 = nstack.pop();
        n1 = nstack.pop();
        f = item.index_;
        if (this.ops2Str[f]) {
          nstack.push(`${this.ops2Str[f]}(${n1},${n2})`);
        } else {
          nstack.push(`(${n1}${f}${n2})`);
        }
      } else if (type_ === TVAR) {
        nstack.push(item.index_);
      } else if (type_ === TOP1) {
        n1 = nstack.pop();
        f = item.index_;
        if (f === '-') {
          nstack.push(`(${f}${n1})`);
        } else {
          nstack.push(`${f}(${n1})`);
        }
      } else if (type_ === TFUNCALL) {
        n1 = nstack.pop();
        f = nstack.pop();
        nstack.push(`${f}(${n1})`);
      } else {
        throw errors.ExpressionError({ message: 'Invalid Expression' });
      }
    });
    if (nstack.length > 1) {
      throw errors.ExpressionError({ message: 'Invalid Expression (parity)' });
    }
    return nstack[0];
  }

  variables() {
    const vars = [];
    (this.tokens || []).forEach((item) => {
      if (item.type_ === TVAR && (vars.indexOf(item.index_) === -1)) {
        vars.push(item.index_);
      }
    });

    return vars;
  }
}

class ExpParser {
  constructor() {
    this.success = false;
    this.errormsg = '';
    this.expression = '';

    this.pos = 0;

    this.tokennumber = 0;
    this.tokenprio = 0;
    this.tokenindex = 0;
    this.tmpprio = 0;

    this.ops1 = {
      'sin': Math.sin,
      'cos': Math.cos,
      'tan': Math.tan,
      'asin': Math.asin,
      'acos': Math.acos,
      'atan': Math.atan,
      'sinh': Math.sinh,
      'cosh': Math.cosh,
      'tanh': Math.tanh,
      'asinh': Math.asinh,
      'acosh': Math.acosh,
      'atanh': Math.atanh,
      'sqrt': Math.sqrt,
      'log': Math.log,
      'log10': (a) => { return Math.log10(Number(a)); },
      'abs': Math.abs,
      'ceil': Math.ceil,
      'floor': Math.floor,
      'round': Math.round,
      'trunc': Math.trunc,
      'length': (a) => {
        if (Array.isArray(a)) { return a.length; }
        const type = typeof(a);
        if (type === 'object') { return Object.keys(a).length; }
        if (type === 'string') { return a.length; }
        return null;
      },
      '-': (a) => { return -Number(a); },
      'exp': Math.exp,
      '!': (a) => { return !a; }
    };

    this.ops2 = {
      // explicity make sure you can't add strings
      '+': (a, b) => { return Number(a) + Number(b); },
      '-': (a, b) => { return Number(a) - Number(b); },
      '*': (a, b) => { return Number(a) * Number(b); },
      '/': (a, b) => { return Number(a) / Number(b); },
      '%': (a, b) => { return Number(a) % Number(b); },
      '^': Math.pow,
      // eslint-disable-next-line eqeqeq
      '==': (a, b) => { return a == b; },
      '===': (a, b) => { return a === b; },
      // eslint-disable-next-line eqeqeq
      '!=': (a, b) => { return a != b; },
      '!==': (a, b) => { return a !== b; },
      '>': (a, b) => { return a > b; },
      '<': (a, b) => { return a < b; },
      '>=': (a, b) => { return a >= b; },
      '<=': (a, b) => { return a <= b; },
      '&&': (a, b) => { return Boolean(a && b); },
      '||': (a, b) => { return Boolean(a || b); },
      'atan2': Math.atan2,
      'pow': Math.pow,
      'min': (a, b) => { return a <= b ? a : b; },
      'max': (a, b) => { return a >= b ? a : b; },
      '<<': (a, b) => { return a << b; },
      '>>': (a, b) => { return a >> b; },
      // matching, as close as possible, to the handlebars includes helper
      'includes': (collection, value) => {
        if (isNil(collection) || isNil(value)) { return false; }
        collection = isArrayLike(collection) ? collection : oValues(collection);
        value = typeof collection === 'string' ? toString(value) : value;
        return includes(value, collection);
      }
    };

    this.functions = { };

    this.consts = {
      E: Math.E,
      PI: Math.PI,
      true: true,
      false: false,
      null: null,
      undefined: undefined
    };
  }

  parse(expr, ops2Str = {}) {
    this.errormsg = '';
    this.success = true;
    const operstack = [];
    const tokenstack = [];
    this.tmpprio = 0;
    let expected = (PRIMARY | LPAREN | FUNCTION | SIGN);
    let noperators = 0;
    let token;
    let lastArg = false;
    this.expression = expr;
    this.pos = 0;

    while (this.pos < this.expression.length) {
      if (this.isOperator()) {
        if (this.isSingleOp() && (expected & SIGN)) {
          if (this.isMeaningfulSingleOp()) {
            noperators++;
            this.addfunc(tokenstack, operstack, TOP1);
          }
          expected = (PRIMARY | LPAREN | FUNCTION | SIGN);
        } else {
          if ((expected & OPERATOR) === 0 || this.tokenindex === '!') {
            this.errorParsing(this.pos, 'unexpected operator');
          }
          noperators += 2;
          this.addfunc(tokenstack, operstack, TOP2);
          expected = (PRIMARY | LPAREN | FUNCTION | SIGN);
        }
      } else if (this.isNumber()) {
        if ((expected & PRIMARY) === 0) {
          this.errorParsing(this.pos, 'unexpected number');
        }
        token = new Token(TNUMBER, 0, 0, this.tokennumber);
        tokenstack.push(token);

        expected = (OPERATOR | RPAREN | COMMA);
      } else if (this.isString()) {
        if ((expected & PRIMARY) === 0) {
          this.errorParsing(this.pos, 'unexpected string');
        }
        token = new Token(TNUMBER, 0, 0, this.tokennumber);
        tokenstack.push(token);

        expected = (OPERATOR | RPAREN | COMMA);
      } else if (this.isLeftParenth()) {
        if ((expected & LPAREN) === 0) {
          this.errorParsing(this.pos, 'unexpected "("');
        }

        if (expected & CALL) {
          noperators += 2;
          this.tokenprio = -2;
          this.tokenindex = -1;
          this.addfunc(tokenstack, operstack, TFUNCALL);
        }

        expected = (PRIMARY | LPAREN | FUNCTION | SIGN | NULLARY_CALL);
      } else if (this.isRightParenth()) {
        if (expected & NULLARY_CALL) {
          token = new Token(TNUMBER, 0, 0, []);
          tokenstack.push(token);
        } else if ((expected & RPAREN) === 0) {
          this.errorParsing(this.pos, 'unexpected ")"');
        }

        expected = (OPERATOR | RPAREN | COMMA | LPAREN | CALL);
      } else if (this.isVar()) {
        if ((expected & PRIMARY) === 0) {
          this.errorParsing(this.pos, 'unexpected variable');
        }
        token = new Token(TVAR, this.tokenindex, 0, 0);
        tokenstack.push(token);

        expected = (OPERATOR | RPAREN | COMMA | LPAREN | CALL);
      } else if (this.isConst()) {
        if ((expected & PRIMARY) === 0) {
          this.errorParsing(this.pos, 'unexpected constant');
        }
        token = new Token(TNUMBER, 0, 0, this.tokennumber);
        tokenstack.push(token);
        expected = (OPERATOR | RPAREN | COMMA);
      } else if (this.isOp2()) {
        if ((expected & FUNCTION) === 0) {
          this.errorParsing(this.pos, 'unexpected function');
        }
        this.addfunc(tokenstack, operstack, TOP2);
        noperators += 2;
        expected = (LPAREN);
      } else if (this.isOp1()) {
        if ((expected & FUNCTION) === 0) {
          this.errorParsing(this.pos, 'unexpected function');
        }
        this.addfunc(tokenstack, operstack, TOP1);
        noperators++;
        expected = (LPAREN);
      } else if (this.isComma()) {
        if ((expected & COMMA) === 0) {
          this.errorParsing(this.pos, 'unexpected comma');
        }

        // comma means we are inside an ops 2 function(e.g. pow(x,y))
        // which we must track and stack for first arguments containing ops
        if (lastArg) {
          tokenstack.push(operstack.pop());
          lastArg = false;
        }
        if (operstack.length > 1 && ops2funcs.has(operstack.at(-1).index_)) {
          lastArg = true;
        }
        while (operstack.length && !ops2funcs.has(operstack.at(-1).index_)) {
          tokenstack.push(operstack.pop());
        }

        expected = (PRIMARY | LPAREN | FUNCTION | SIGN);
      } else if (!this.isWhite()) {
        if (this.errormsg === '') {
          this.errorParsing(this.pos, 'unknown character');
        } else {
          this.errorParsing(this.pos, this.errormsg);
        }
      }
    }
    if (this.tmpprio < 0 || this.tmpprio >= 10) {
      this.errorParsing(this.pos, 'unmatched "()"');
    }
    while (operstack.length > 0) {
      tokenstack.push(operstack.pop());
    }
    if (noperators + 1 !== tokenstack.length) {
      this.errorParsing(this.pos, 'parity');
    }

    return new Expression(tokenstack, object(this.ops1), object(this.ops2), object(this.functions), ops2Str);
  }

  evaluate(expr, variables) {
    return this.parse(expr).evaluate(variables);
  }

  errorParsing(column, msg) {
    this.success = false;
    this.errormsg = `parse error [column ${column}]: ${msg}`;
    this.column = column;
    throw errors.ExpressionError({ message: this.errormsg });
  }

  //\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\/\

  addfunc(tokenstack, operstack, type_) {
    const operator = new Token(type_, this.tokenindex, this.tokenprio + this.tmpprio, 0);
    if (type_ !== TOP1) {
      while (operstack.length > 0) {
        if (operator.prio_ <= operstack[operstack.length - 1].prio_) {
          tokenstack.push(operstack.pop());
        } else {
          break;
        }
      }
    }
    operstack.push(operator);
  }

  isNumber() {
    let r = false;
    let str = '';
    while (this.pos < this.expression.length) {
      const code = this.expression.charCodeAt(this.pos);
      if ((code >= 48 && code <= 57) || code === 46) {
        str += this.expression.charAt(this.pos);
        this.pos++;
        this.tokennumber = parseFloat(str);
        r = true;
      } else {
        break;
      }
    }
    return r;
  }

  // Ported from the yajjl JSON parser at http://code.google.com/p/yajjl/
  unescape(v, pos) {
    const buffer = [];
    let escaping = false;

    for (let i = 0; i < v.length; i++) {
      const c = v.charAt(i);
      let codePoint;

      if (escaping) {
        switch (c) {
          case '\'':
            buffer.push('\'');
            break;
          case '"':
            buffer.push('"');
            break;
          case '\\':
            buffer.push('\\');
            break;
          case '/':
            buffer.push('/');
            break;
          case 'b':
            buffer.push('\b');
            break;
          case 'f':
            buffer.push('\f');
            break;
          case 'n':
            buffer.push('\n');
            break;
          case 'r':
            buffer.push('\r');
            break;
          case 't':
            buffer.push('\t');
            break;
          case 'u':
            // interpret the following 4 characters as the hex of the unicode code point
            codePoint = parseInt(v.substring(i + 1, i + 5), 16);
            buffer.push(String.fromCharCode(codePoint));
            i += 4;
            break;
          default:
            throw this.errorParsing(pos + i, `Illegal escape sequence: "\\${c}"`);
        }
        escaping = false;
      } else {
        if (c === '\\') {
          escaping = true;
        } else {
          buffer.push(c);
        }
      }
    }

    return buffer.join('');
  }

  isString() {
    let r = false;
    let str = '';
    let strQuote;
    const startpos = this.pos;
    if (this.pos < this.expression.length) {
      strQuote = this.expression.charAt(this.pos);
      if (strQuote === '\'' || strQuote === '"') {
        this.pos++;
        while (this.pos < this.expression.length) {
          const code = this.expression.charAt(this.pos);
          if (code !== strQuote || str.slice(-1) === '\\') {
            str += this.expression.charAt(this.pos);
            this.pos++;
          } else {
            this.pos++;
            this.tokennumber = this.unescape(str, startpos);
            r = true;
            break;
          }
        }
      }
    }
    return r;
  }

  isConst() {
    let str;
    for (const i in this.consts) {
      if (this.expression) {
        const L = i.length;
        str = this.expression.substr(this.pos, L);
        if (i === str) {
          this.tokennumber = this.consts[i];
          this.pos += L;
          return true;
        }
      }
    }
    return false;
  }

  isOperator() {
    const code = this.expression.charCodeAt(this.pos);
    if (code === 43) { // +
      this.tokenprio = 2;
      this.tokenindex = '+';
    } else if (code === 45) { // -
      this.tokenprio = 2;
      this.tokenindex = '-';
    } else if (code === 62) { // >
      if (this.expression.charCodeAt(this.pos + 1) === 61) {
        this.pos++;
        this.tokenprio = 1;
        this.tokenindex = '>=';
      } else if (this.expression.charCodeAt(this.pos + 1) === 62) {
        this.pos++;
        this.tokenprio = 1;
        this.tokenindex = '>>';
      } else {
        this.tokenprio = 1;
        this.tokenindex = '>';
      }
    } else if (code === 60) { // <
      if (this.expression.charCodeAt(this.pos + 1) === 61) {
        this.pos++;
        this.tokenprio = 1;
        this.tokenindex = '<=';
      } else if (this.expression.charCodeAt(this.pos + 1) === 60) {
        this.pos++;
        this.tokenprio = 1;
        this.tokenindex = '<<';
      } else {
        this.tokenprio = 1;
        this.tokenindex = '<';
      }
    } else if (code === 61) { // =
      if (this.expression.charCodeAt(this.pos + 1) === 61) {
        if (this.expression.charCodeAt(this.pos + 2) === 61) {
          this.pos += 2;
          this.tokenprio = 1;
          this.tokenindex = '===';
        } else {
          this.pos++;
          this.tokenprio = 1;
          this.tokenindex = '==';
        }
      } else {
        return false;
      }
    } else if (code === 33) { // !
      if (this.expression.charCodeAt(this.pos + 1) === 61) {
        if (this.expression.charCodeAt(this.pos + 2) === 61) {
          this.pos += 2;
          this.tokenprio = 1;
          this.tokenindex = '!==';
        } else {
          this.pos++;
          this.tokenprio = 1;
          this.tokenindex = '!=';
        }
      } else {
        this.tokenprio = 2;
        this.tokenindex = '!';
      }
    } else if (code === 38) { // &
      if (this.expression.charCodeAt(this.pos + 1) === 38) { // &
        this.pos++;
        this.tokenprio = 0;
        this.tokenindex = '&&';
      } else {
        return false;
      }
    } else if (code === 124) { // |
      if (this.expression.charCodeAt(this.pos + 1) === 124) { // |
        this.pos++;
        this.tokenprio = 0;
        this.tokenindex = '||';
      } else {
        return false;
      }
    } else if (code === 42 || code === 8729 || code === 8226) { // * or ∙ or •
      this.tokenprio = 3;
      this.tokenindex = '*';
    } else if (code === 47) { // /
      this.tokenprio = 4;
      this.tokenindex = '/';
    } else if (code === 37) { // %
      this.tokenprio = 4;
      this.tokenindex = '%';
    } else if (code === 94) { // ^
      this.tokenprio = 5;
      this.tokenindex = '^';
    } else {
      return false;
    }
    this.pos++;
    return true;
  }

  isSingleOp() {
    return this.tokenindex === '-' ||
      this.tokenindex === '+' ||
      this.tokenindex === '!';
  }

  isMeaningfulSingleOp() {
    return this.tokenindex === '-' ||
      this.tokenindex === '!';
  }

  isComma() {
    const code = this.expression.charCodeAt(this.pos);
    if (code === 44) { // ,
      this.pos++;
      return true;
    }
    return false;
  }

  isLeftParenth() {
    const code = this.expression.charCodeAt(this.pos);
    if (code === 40) { // (
      this.pos++;
      this.tmpprio += 10;
      return true;
    }
    return false;
  }

  isRightParenth() {
    const code = this.expression.charCodeAt(this.pos);
    if (code === 41) { // )
      this.pos++;
      this.tmpprio -= 10;
      return true;
    }
    return false;
  }

  isWhite() {
    const code = this.expression.charCodeAt(this.pos);
    if (code === 32 || code === 9 || code === 10 || code === 13) {
      this.pos++;
      return true;
    }
    return false;
  }

  isOp1() {
    let str = '';
    for (let i = this.pos; i < this.expression.length; i++) {
      const c = this.expression.charAt(i);
      if (c.toUpperCase() === c.toLowerCase()) {
        if (i === this.pos || (c !== '_' && (c < '0' || c > '9'))) {
          break;
        }
      }
      str += c;
    }
    if (str.length > 0 && (str in this.ops1)) {
      this.tokenindex = str;
      this.tokenprio = 5;
      this.pos += str.length;
      return true;
    }
    return false;
  }

  isOp2() {
    let str = '';
    for (let i = this.pos; i < this.expression.length; i++) {
      const c = this.expression.charAt(i);
      if (c.toUpperCase() === c.toLowerCase()) {
        if (i === this.pos || (c !== '_' && (c < '0' || c > '9'))) {
          break;
        }
      }
      str += c;
    }
    if (str.length > 0 && (str in this.ops2)) {
      this.tokenindex = str;
      this.tokenprio = 5;
      this.pos += str.length;
      return true;
    }
    return false;
  }

  isVar() {
    if (this.expression.charAt(this.pos) !== '{' || this.expression.charAt(this.pos + 1) !== '{') {
      return false;
    }

    let str = '';
    let foundEndingBraces = false;
    for (let i = this.pos + 2; i < this.expression.length; i++) {
      const c = this.expression.charAt(i);
      if (c === '}' && this.expression.charAt(i + 1) === '}') {
        foundEndingBraces = true;
        break;
      }
      str += c;
    }

    if (foundEndingBraces && str.length > 0) {
      this.tokenindex = str;
      this.tokenprio = 4;
      this.pos += str.length + 4;
      return true;
    }
    return false;
  }
}

export default new ExpParser();
