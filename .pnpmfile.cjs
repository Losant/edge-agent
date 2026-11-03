const readPackage = (pkg) => {
  if (pkg.name === 'seedrandom' || pkg.name === '@tensorflow/tfjs-node') {
    pkg.cpu = ['!arm64'];
    pkg.libc = ['!musl'];
  }
  return pkg;
};

module.exports = { hooks: { readPackage } };
