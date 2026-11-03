import { AmsNetId } from '../src/types/lib/refinements.js';

describe('Type refinements', () => {
  describe('AmsNetId', () => {
    const net = (octet) => `${octet}.${octet}.${octet}.${octet}.1.1`;

    it('should accept octets at every boundary', () => {
      [0, 9, 10, 99, 100, 199, 200, 206, 209, 216, 219, 226, 229, 236, 239, 246, 249, 250, 255].forEach((octet) => {
        AmsNetId.is(net(octet)).should.equal(true, `octet ${octet}`);
      });
    });

    it('should accept every octet from 0 to 255 in any position', () => {
      for (let i = 0; i <= 255; i++) {
        AmsNetId.is(`${i}.1.1.1.1.1`).should.equal(true, `first ${i}`);
        AmsNetId.is(`1.1.1.1.1.${i}`).should.equal(true, `last ${i}`);
      }
    });

    it('should reject octets above 255', () => {
      [256, 260, 299, 300, 999, 1000].forEach((octet) => {
        AmsNetId.is(`${octet}.1.1.1.1.1`).should.equal(false, `first ${octet}`);
        AmsNetId.is(`1.1.1.1.1.${octet}`).should.equal(false, `last ${octet}`);
      });
    });

    it('should accept realistic net ids', () => {
      AmsNetId.is('192.168.5.221.1.2').should.equal(true);
      AmsNetId.is('5.123.154.18.1.1').should.equal(true);
      AmsNetId.is('172.216.246.249.1.1').should.equal(true);
    });

    it('should reject malformed net ids', () => {
      ['', '1.1.1.1.1', '1.1.1.1.1.1.1', '1.1.1.1.1.', '01.1.1.1.1.1', '1.1.1.1.1.x', 'a.b.c.d.e.f', '-1.1.1.1.1.1'].forEach((value) => {
        AmsNetId.is(value).should.equal(false, value);
      });
    });
  });
});
