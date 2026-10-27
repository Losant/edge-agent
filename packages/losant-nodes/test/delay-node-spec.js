import './common.js';
import DelayNode from '../src/delay-node.js';

describe('DelayNode', () => {
  it('should correctly delay', async () => {
    const node = new DelayNode('id', [[4]], {
      delay: 0.110
    });

    const now = process.uptime();
    const [ oids, payload ] = await node.run({}, { data: { in: [1, '2'] } });
    const delay = process.uptime() - now;
    delay.should.be.greaterThan(0.100);
    oids.should.deepEqual([[4]]);
    payload.should.deepEqual({ data: { in: [1, '2'] } });
  });

  it('should correctly delay, template', async () => {
    const node = new DelayNode('id', [[4]], {
      delay: '{{a}}'
    });

    const now = process.uptime();
    const [ oids, payload ] = await node.run({}, { a: '0.160', data: { in: [1, '2'] } });
    const delay = process.uptime() - now;
    delay.should.be.greaterThan(0.150);
    oids.should.deepEqual([[4]]);
    payload.should.deepEqual({ a: '0.160', data: { in: [1, '2'] } });
  });

  it('should correctly delay, template, not number', async () => {
    const node = new DelayNode('id', [[4]], {
      delay: '{{a}}'
    });

    const now = process.uptime();
    const [ oids, payload ] = await node.run({}, { a: 'nan', data: { in: [1, '2'] } });
    const delay = process.uptime() - now;
    delay.should.be.lessThan(0.050);
    oids.should.deepEqual([[4]]);
    payload.should.deepEqual({ a: 'nan', data: { in: [1, '2'] } });
  });
  it('should correctly skip delay when there are no output ids', async () => {
    const node = new DelayNode('id', [[]], {
      delay: '{{a}}'
    });

    const now = process.uptime();
    const [ oids, payload ] = await node.run({}, { a: '10', data: { in: [1, '2'] } });
    const delay = process.uptime() - now;
    delay.should.be.lessThan(0.001);
    oids.should.deepEqual([[]]);
    payload.should.deepEqual({ a: '10', data: { in: [1, '2'] } });
  });
});
