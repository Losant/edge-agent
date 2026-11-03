import nodeConfig from '@losant/eslint-config-losant/env/node.js';

const noPayloadMutation = (message) => [
  { selector: 'AssignmentExpression > MemberExpression.left[object.name="payload"]', message },
  { selector: 'AssignmentExpression > .left MemberExpression[object.name="payload"]', message },
  { selector: 'UnaryExpression[operator="delete"] MemberExpression[object.name="payload"]', message },
  { selector: 'UpdateExpression > MemberExpression.argument[object.name="payload"]', message },
  { selector: 'UpdateExpression > .argument MemberExpression[object.name="payload"]', message }
];

export default [
  ...nodeConfig,
  {
    rules: {
      'import/no-unresolved': ['error', { ignore: ['uuid', 'cacheable-lookup', '@tensorflow/tfjs-node', 'seedrandom', 'spdx-expression-parse', 'license-checker', 'omnibelt'] }]
    }
  },
  {
    files: [
      'packages/losant-nodes/src/**/*.js',
      'packages/losant-edge/src/nodes/**/*.js'
    ],
    rules: {
      'no-restricted-syntax': ['error', ...noPayloadMutation(
        'payload is immutable — derive a new one via losant-handlebars\' set()/remove() and reassign the payload variable.'
      )]
    }
  },
  {
    files: ['scripts/**/*.{js,mjs}'],
    rules: { 'no-console': 0 }
  }
];
