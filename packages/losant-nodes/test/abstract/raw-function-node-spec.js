import fs from 'fs';
import { sleep } from 'omnibelt';
import crazyFuncInput from '../__fixtures__/crazy-function-input.js';
import crazyFuncOutput from '../__fixtures__/crazy-function-output.js';

const crazyFuncScript = fs.readFileSync(
  new URL('../__fixtures__/crazy-function.func', import.meta.url)
).toString();

export default function(loadRawFunctionTest) {

  it('should work with crazy function', async () => {
    const { RawFunctionNode, contextify, prevNodeInfo, getPublishedDebugMessages } = loadRawFunctionTest();
    const node = new RawFunctionNode('id', [[4]], { script: crazyFuncScript });
    const context = contextify({ applicationId: 'rfnAppId2', flowId: 'aflowId2' });

    const result = await node.run(context,
      crazyFuncInput,
      prevNodeInfo
    );

    result[1].should.deepEqual(crazyFuncOutput);

    await sleep(0); // because log might not be ready yet
    const publishedDebugMessages = getPublishedDebugMessages();
    publishedDebugMessages.length.should.equal(2);
    publishedDebugMessages[0].msgObj.message.should.match(/LOG: .* Mar 2019 \d\d:59:59 GMT/);
    publishedDebugMessages[1].msgObj.message.should.match(/LOG: .* Feb 2019 \d\d:00:00 GMT/);
  });
}
