#!/usr/bin/env node
process.env.TF_CPP_MIN_LOG_LEVEL=2;
// NOTE! this file should not be required it should be executed.
// if this file executes and results in a non 0 exit code we know that the tensorflow lib cannot be required.
const run = async function() {
  await import('@tensorflow/tfjs-node');
};

run();
