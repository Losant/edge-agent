export default (toCast) => {
  toCast = String(toCast).trim();
  return toCast.length > 0 && !toCast.match(/^(0|false|null|undefined)$/i);
};
