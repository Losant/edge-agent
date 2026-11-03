import { sinon } from '../common.js';
import should from 'should';
import { Controller, TagList, EthernetIP } from 'st-ethernet-ip';
import {
  queueInstructions,
  cleanClients,
  reset
} from '../../src/lib/connections/allen-bradley.js';
import {
  validateRenderReadInstructions,
  validateAllenBradleyConfig
} from '../../src/lib/allen-bradley-utils.js';

describe('Allen Bradley Utility', () => {
  it('should output an error on read since the connection is broken(fake) but still set plc props', async () => {
    sinon.stub(Controller.prototype, 'connect').resolves(Promise.resolve());
    sinon.stub(Controller.prototype, 'getControllerTagList').resolves(true);
    const config = {
      hostTemplate: '1.2.3.4',
      slotTemplate: 0,
      keepRateTemplate: 200,
      instructionsType: '',
      readInstructions: [
        { tagTemplate: 'tag1', programTemplate: 'My_Program', key: 'key1' }
      ],
      destinationPath: 'destination'
    };
    const payload = {};
    const clientConfig = await validateAllenBradleyConfig(payload, config, { externalTimeout: 30000 });
    const reads = validateRenderReadInstructions(config.readInstructions, payload, config.instructionsType);
    const output = await queueInstructions(clientConfig, reads, 'READ', 30000);
    should.exist(output.plcProperties);
    output.errors[0].message.should.equal('Tag not found.');
  });
  it('should output an error when the connection cannot be made successfully', async () => {
    const config = {
      hostTemplate: 'localhost',
      slotTemplate: 0,
      keepRateTemplate: 200,
      instructionsType: '',
      readInstructions: [
        { tagTemplate: 'tag1', programTemplate: 'My_Program', key: 'key1' }
      ],
      destinationPath: 'destination'
    };
    const payload = {};
    const clientConfig = await validateAllenBradleyConfig(payload, config, { externalTimeout: 30000 });
    const reads = validateRenderReadInstructions(config.readInstructions, payload, config.instructionsType);
    const output = await queueInstructions(clientConfig, reads, 'READ', 30000);
    output.errors[0].message.should.equal('connect ECONNREFUSED 127.0.0.1:44818');
  });

  describe('write validation', () => {
    const clientConfig = { host: '1.2.3.4', slot: 0, keepRate: 0, timeout: 5000 };
    beforeEach(() => {
      reset();
      sinon.stub(Controller.prototype, 'connect').resolves();
      sinon.stub(TagList.prototype, 'getTag').returns({
        name: 'myTag',
        type: { code: EthernetIP.CIP.DataTypes.Types.STRING, arrayDims: 0, structure: false }
      });
    });
    afterEach(async () => {
      await cleanClients();
    });
    it('should name the tag when a string value is too long', async () => {
      const instructions = [{ tag: 'myTag', program: 'My_Program', value: 'x'.repeat(65536) }];
      const output = await queueInstructions({ ...clientConfig }, instructions, 'WRITE');
      output.errors[0].message.should.equal('Program:My_Program.myTag length cannot exceed 65535 characters.');
      output.write.should.equal('fail');
    });
    it('should not report a length error for a string value at the limit', async () => {
      sinon.stub(Controller.prototype, 'writeTagGroup').resolves();
      const instructions = [{ tag: 'myTag', program: 'My_Program', value: 'x'.repeat(65535) }];
      const output = await queueInstructions({ ...clientConfig }, instructions, 'WRITE');
      output.write.should.equal('success');
      should.not.exist(output.errors);
    });
  });
});
