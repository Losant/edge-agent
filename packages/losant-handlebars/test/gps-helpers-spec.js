import { tk } from './common.js';
import * as gpsHelper from '../src/gps-helpers.js';

describe('GPSHelpers', () => {
  it('generate a clean array from a new line delineated string', () => {
    const newLineDelineatedString = 'this\n\r\n\r\n\ris my \r string \n yo';
    gpsHelper.getCleanArrayFromNewLineString(newLineDelineatedString).should.deepEqual(['this', 'is my', 'string', 'yo']);
    gpsHelper.getCleanArrayFromNewLineString(newLineDelineatedString).length.should.equal(4);
  });

  it('generates coordinates from a new line delineated string', () => {
    const newLineDelineatedCoords = '44.71281,-118.01689\n  39.51805,-116.65458\n 41.29146,-109.77714\n 47.09745,-107.73368';
    gpsHelper.getCoordsFromNewLineString(newLineDelineatedCoords).length.should.deepEqual(4);
    gpsHelper.getCoordsFromNewLineString(newLineDelineatedCoords).should.deepEqual([
      { latitude: 44.71281, longitude: -118.01689 },
      { latitude: 39.51805, longitude: -116.65458 },
      { latitude: 41.29146, longitude: -109.77714 },
      { latitude: 47.09745, longitude: -107.73368 }]);
  });

  it('checks if a new line delineated string is suited to be drawn on a map', () => {
    const newLineDelineatedCoords = '44.71281,-118.01689\n  39.51805,-116.65458\n 41.29146,-109.77714';
    const newLineDelineatedCoordsWithBunkCoord = '44.71281,-118.01689\n  39.51805,-116.65458\n 41.29146,-109.77714\n 47.09745,-107.73368\n this is not a coord!';
    const newLineDelineatedCoordsWithoutEnoughPoints = '44.71281,-118.01689\n  39.51805,-116.65458';
    gpsHelper.isDrawablePolygonCoordsString(newLineDelineatedCoords).should.equal(true);
    gpsHelper.isDrawablePolygonCoordsString(newLineDelineatedCoordsWithBunkCoord).should.equal(false);
    gpsHelper.isDrawablePolygonCoordsString(newLineDelineatedCoordsWithoutEnoughPoints).should.equal(false);
  });

  it('mutates an array of LatLng coordinate objects to an array of LngLat coordinate arrays', () => {
    const latLngArray = [
      { latitude: 44.71281, longitude: -118.01689 },
      { latitude: 39.51805, longitude: -116.65458 },
      { latitude: 41.29146, longitude: -109.77714 },
      { latitude: 47.09745, longitude: -107.73368 }];
    gpsHelper.coordObjsToLngLatArrays(latLngArray).should.deepEqual([
      [ -118.01689, 44.71281 ],
      [ -116.65458, 39.51805 ],
      [ -109.77714, 41.29146 ],
      [ -107.73368, 47.09745 ]
    ]);
  });

  it('mutates an array of LatLng coordinate arrays to an array of LngLat coordinate arrays', () => {
    const latLngArray = [
      [44.71281, -118.01689 ],
      [39.51805, -116.65458 ],
      [41.29146, -109.77714 ],
      [47.09745, -107.73368 ]];
    gpsHelper.latLngArrayToLngLatArray(latLngArray).should.deepEqual([
      [-118.01689, 44.71281],
      [-116.65458, 39.51805],
      [-109.77714, 41.29146],
      [-107.73368, 47.09745]
    ]);
  });

  it('transforms gps strings correctly', () => {
    tk.freeze(new Date(1602259425947)); // because gga has the date

    gpsHelper.formatCoordinate({ latitude: 44.71281, longitude: -118.01689 }).should.equal('44.71281, -118.01689');
    gpsHelper.formatCoordinate({ latitude: 44.71281, longitude: -118.01689 }, 'decimal').should.equal('44.71281, -118.01689');
    gpsHelper.formatCoordinate({ latitude: 44.71281, longitude: -118.01689 }, 'degrees').should.equal('44° 42\' 46.116" N, 118° 01\' 00.804" W');
    gpsHelper.formatCoordinate({ latitude: 44.71281, longitude: -118.01689 }, 'sexagesimal').should.equal('44° 42\' 46.116" N, 118° 01\' 00.804" W');
    gpsHelper.formatCoordinate({ latitude: 44.71281, longitude: -118.01689 }, 'gga').should.equal('$GPGGA,160345,4442.769,N,11801.013,W,,00,,,,,,,*7F');

    gpsHelper.formatCoordinate({ latitude: 44.71281, longitude: -118.01689 }, undefined, 2).should.equal('44.71, -118.02');
    gpsHelper.formatCoordinate({ latitude: 44.71281, longitude: -118.01689 }, 'decimal', 2).should.equal('44.71, -118.02');
    gpsHelper.formatCoordinate({ latitude: 44.71281, longitude: -118.01689 }, 'degrees', 2).should.equal('44° 42\' 36.0" N, 118° 01\' 12.0" W');
    gpsHelper.formatCoordinate({ latitude: 44.71281, longitude: -118.01689 }, 'sexagesimal', 2).should.equal('44° 42\' 36.0" N, 118° 01\' 12.0" W');
    gpsHelper.formatCoordinate({ latitude: 44.71281, longitude: -118.01689 }, 'gga', 2).should.equal('$GPGGA,160345,4442.600,N,11801.200,W,,00,,,,,,,*71');

    gpsHelper.formatCoordinate('44.71281, -118.01689').should.equal('44.71281, -118.01689');
    gpsHelper.formatCoordinate('44.71281, -118.01689', 'decimal').should.equal('44.71281, -118.01689');
    gpsHelper.formatCoordinate('44.71281, -118.01689', 'degrees').should.equal('44° 42\' 46.116" N, 118° 01\' 00.804" W');
    gpsHelper.formatCoordinate('44.71281, -118.01689', 'sexagesimal').should.equal('44° 42\' 46.116" N, 118° 01\' 00.804" W');
    gpsHelper.formatCoordinate('44.71281, -118.01689', 'gga').should.equal('$GPGGA,160345,4442.769,N,11801.013,W,,00,,,,,,,*7F');

    gpsHelper.formatCoordinate('44° 42\' 46.116" N, 118° 01\' 00.804" W').should.equal('44.71281, -118.01689');
    gpsHelper.formatCoordinate('44° 42\' 46.116" N, 118° 01\' 00.804" W', 'decimal').should.equal('44.71281, -118.01689');
    gpsHelper.formatCoordinate('44° 42\' 46.116" N, 118° 01\' 00.804" W', 'degrees').should.equal('44° 42\' 46.116" N, 118° 01\' 00.804" W');
    gpsHelper.formatCoordinate('44° 42\' 46.116" N, 118° 01\' 00.804" W', 'sexagesimal').should.equal('44° 42\' 46.116" N, 118° 01\' 00.804" W');
    gpsHelper.formatCoordinate('44° 42\' 46.116" N, 118° 01\' 00.804" W', 'gga').should.equal('$GPGGA,160345,4442.769,N,11801.013,W,,00,,,,,,,*7F');

    // GPGGA encodes with less precision, so the result is not identical
    gpsHelper.formatCoordinate('$GPGGA,160345,4442.769,N,11801.013,W,,00,,,,,,,*7F').should.equal('44.712817, -118.016883');
    gpsHelper.formatCoordinate('$GPGGA,160345,4442.769,N,11801.013,W,,00,,,,,,,*7F', 'decimal').should.equal('44.712817, -118.016883');
    gpsHelper.formatCoordinate('$GPGGA,160345,4442.769,N,11801.013,W,,00,,,,,,,*7F', 'degrees').should.equal('44° 42\' 46.1412" N, 118° 01\' 00.7788" W');
    gpsHelper.formatCoordinate('$GPGGA,160345,4442.769,N,11801.013,W,,00,,,,,,,*7F', 'sexagesimal').should.equal('44° 42\' 46.1412" N, 118° 01\' 00.7788" W');
    gpsHelper.formatCoordinate('$GPGGA,160345,4442.769,N,11801.013,W,,00,,,,,,,*7F', 'gga').should.equal('$GPGGA,160345,4442.769,N,11801.013,W,,00,,,,,,,*7F');

    gpsHelper.formatCoordinate('$GPGGA,160345,4442.600,N,11801.200,W,,00,,,,,,,*71', undefined, 2).should.equal('44.71, -118.02');
    gpsHelper.formatCoordinate('$GPGGA,160345,4442.600,N,11801.200,W,,00,,,,,,,*71', 'decimal', 2).should.equal('44.71, -118.02');
    gpsHelper.formatCoordinate('$GPGGA,160345,4442.600,N,11801.200,W,,00,,,,,,,*71', 'degrees', 2).should.equal('44° 42\' 36.0" N, 118° 01\' 12.0" W');
    gpsHelper.formatCoordinate('$GPGGA,160345,4442.600,N,11801.200,W,,00,,,,,,,*71', 'sexagesimal', 2).should.equal('44° 42\' 36.0" N, 118° 01\' 12.0" W');
    gpsHelper.formatCoordinate('$GPGGA,160345,4442.600,N,11801.200,W,,00,,,,,,,*71', 'gga', 2).should.equal('$GPGGA,160345,4442.600,N,11801.200,W,,00,,,,,,,*71');

    gpsHelper.formatCoordinate('invalid').should.equal('');
    gpsHelper.formatCoordinate().should.equal('');
  });

  it('transforms strings to gps coordinates correctly', () => {
    gpsHelper.stringToCoords('44.71281, -118.01689').should.deepEqual({ latitude: 44.71281, longitude: -118.01689 });
    gpsHelper.stringToCoords('44.71281, -118.01689', true).should.deepEqual({ latitude: 44.71281, longitude: -118.01689, altitude: 0 });
    gpsHelper.stringToCoords('44° 42\' 46.116" N, 118° 01\' 00.804" W', true).should.deepEqual({ latitude: 44.712810000000005, longitude: -118.01689, altitude: 0 });
    gpsHelper.stringToCoords('$GPGGA,123519,4807.038,N,01131.000,E,1,08,0.9,545.4,M,46.9,M,,*47', true).should.deepEqual({ latitude: 48.1173, longitude: 11.51666667, altitude: 545.4 });
  });

  it('it validates gps strings correctly', () => {
    gpsHelper.isGpsString('').should.equal(false);
    gpsHelper.isGpsString('44.71281, -118.01689').should.equal(true);
    gpsHelper.isGpsString('123').should.equal(false);
    gpsHelper.isGpsString({}).should.equal(false);
  });
});
