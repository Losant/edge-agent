const RE = /\\(u\{([0-9A-Fa-f]+)\}|u([0-9A-Fa-f]{4})|x([0-9A-Fa-f]{2})|([1-7][0-7]{0,2}|[0-7]{2,3})|(.))/g;
const CHAR = new Map([
  ['0', '\0'],
  ['b', '\b'],
  ['f', '\f'],
  ['n', '\n'],
  ['r', '\r'],
  ['t', '\t'],
  ['v', '\v']
]);


const by = function(m, p1, hex, hex4, hex2, oct, chr) {
  if (chr !== undefined) { return CHAR.get(chr)||chr; }
  if (oct !== undefined) { return String.fromCodePoint(parseInt(oct, 8)); }
  return String.fromCodePoint(parseInt(hex||hex4||hex2, 16));
};

export default (str) => {
  return str.replace(RE, by);
};
