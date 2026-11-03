export default (self) => {
  Object.getOwnPropertyNames(self.constructor.prototype).forEach((key) => {
    const val = self[key];
    if (key !== 'constructor' && typeof(val) === 'function') {
      self[key] = val.bind(self);
    }
  });
};
