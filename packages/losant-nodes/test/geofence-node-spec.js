import './common.js';
import should from 'should';
import GeofenceNode from '../src/geofence-node.js';

describe('GeofenceNode', () => {
  it('should correctly geofence gps coords', () => {
    const node = new GeofenceNode('id', [[4], [5]], {
      gpsCheck: '$GPGLL,4916.45,N,12311.12,W,225444,A,*1D',
      gpsCenter: '$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47',
      radius: '{{radius}}',
      resultPath: 'here',
      branchPath: 'there'
    });

    let results = node.run({}, { radius: 8370735 });
    results[0].should.deepEqual([4]);
    results[1].should.deepEqual({ radius: 8370735, here: 8370736, there: false });

    results = node.run({}, { radius: 8370736 });
    results[0].should.deepEqual([5]);
    results[1].should.deepEqual({ radius: 8370736, here: 8370736, there: true });

    results = node.run({}, { radius: 8370737 });
    results[0].should.deepEqual([5]);
    results[1].should.deepEqual({ radius: 8370737, here: 8370736, there: true });
  });

  it('should correctly go false for bad radius', () => {
    const node = new GeofenceNode('id', [[4], [5]], {
      gpsCheck: '$GPGLL,4916.45,N,12311.12,W,225444,A,*1D',
      gpsCenter: '$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47',
      radius: '{{radius}}',
      resultPath: 'here',
      branchPath: 'there'
    });

    let results = node.run({}, {});
    results[0].should.deepEqual([4]);
    results[1].should.deepEqual({});

    results = node.run({}, { radius: 'hello' });
    results[0].should.deepEqual([4]);
    results[1].should.deepEqual({ radius: 'hello' });

    results = node.run({}, { radius: -1 });
    results[0].should.deepEqual([4]);
    results[1].should.deepEqual({ radius: -1 });
  });

  it('should pass for identical coords at 0 radius', () => {
    const node = new GeofenceNode('id', [[4], [5]], {
      gpsCheck: '$GPGLL,3719.940,N,12201.873,S,225444,A,*1C',
      gpsCenter: '{{latCenter}}, {{lonCenter}}',
      radius: 0
    });

    const results = node.run({}, { latCenter: 37.33233141, lonCenter: -122.0312186 });
    results[0].should.deepEqual([5]);
    results[1].should.deepEqual({ latCenter: 37.33233141, lonCenter: -122.0312186 });
  });

  it('should deal with bad coords', () => {
    const node = new GeofenceNode('id', [[4], [5]], {
      gpsCenter: '{{latCenter}}, {{lonCenter}}',
      radius: 0
    });

    should.throws(() => { node.run({}, {}); });
  });

  it('should correctly geofence polygon', () => {
    const node = new GeofenceNode('id', [[4], [5]], {
      checkType: 'polygon',
      gpsCheck: '{{myCoord}}',
      polygonPath: 'myPoints',
      branchPath: 'there'
    });

    let results = node.run({}, { myCoord: '8,10', myPoints: ['2,2', '2,12', '18,12', '18,2'] });
    results[0].should.deepEqual([5]);
    results[1].should.deepEqual({ there: true, myCoord: '8,10', myPoints: ['2,2', '2,12', '18,12', '18,2'] });

    results = node.run({}, { myCoord: '8,10', myPoints: ['2,2', '2,12', '18,2', '18,12'] });
    results[0].should.deepEqual([4]);
    results[1].should.deepEqual({ there: false, myCoord: '8,10', myPoints: ['2,2', '2,12', '18,2', '18,12'] });
  });

  it('should correctly geofence polygon coords', () => {
    const node = new GeofenceNode('id', [[4], [5]], {
      checkType: 'polygonCoords',
      gpsCheck: '{{myCoord}}',
      polygonCoords: '{{myPoints}}',
      branchPath: 'there'
    });

    let results = node.run({}, { myCoord: '8,10', myPoints: '2,2 \n 2,12 \n 18,12 \n 18,2' });
    results[0].should.deepEqual([5]);
    results[1].should.deepEqual({ there: true, myCoord: '8,10', myPoints: '2,2 \n 2,12 \n 18,12 \n 18,2' });

    results = node.run({}, { myCoord: '8,10', myPoints: '2,2 \n 2,12 \n 18,2 \n 18,12' });
    results[0].should.deepEqual([4]);
    results[1].should.deepEqual({ there: false, myCoord: '8,10', myPoints: '2,2 \n 2,12 \n 18,2 \n 18,12' });
  });

});
