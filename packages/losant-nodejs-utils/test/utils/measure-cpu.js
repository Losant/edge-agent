export default async (func) => {
  global.gc();
  const start = process.cpuUsage();
  await func();
  const diff = process.cpuUsage(start);
  return diff.system + diff.user;
};
