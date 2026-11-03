import * as geolib from 'geolib';
import nmea from 'nmea-0183';
import {
  pipe, split, map, trim, isEmpty, all, reject,
  round, toLower, compact
} from 'omnibelt';

const DEFAULT_FORMAT_PRECISION = 6;
const MAX_FORMAT_PRECISION = 10;

const pullApartGpsString = function(string, withAlt) {
  string = String(string).trim();
  if (!string) { return null; }

  let coords;
  if (string[0] === '$') {
    try {
      const parsed = nmea.parse(string);
      // Only GGA and GLL have valid info for GPS coords
      if (parsed.talker_type_id === 'GGA' || parsed.talker_type_id === 'GLL') {
        coords = {
          latitude:  parsed.latitude,
          longitude: parsed.longitude
        };
        if (withAlt) { coords.altitude = parsed.altitude || 0; }
      }
    } catch { }
  } else {
    const parts = string.split(',');
    if (parts.length === 2 || parts.length === 3) {
      coords = {
        latitude:  parts[0].trim(),
        longitude: parts[1].trim()
      };
      if (withAlt) { coords.altitude = Number(parts[2]?.trim()) || 0; }
    }
  }

  return coords;
};

export const isGpsString = function(string, withAlt) {
  const coords = pullApartGpsString(string, withAlt);
  if (!coords) { return false; }

  try {
    const valid2d = geolib.isValidCoordinate(coords);
    return withAlt ? valid2d && !isNaN(coords.altitude) : valid2d;
  } catch {
    return false;
  }
};

export const stringToCoords = function(string, withAlt) {
  const coords = pullApartGpsString(string, withAlt);

  if (!coords) { return null; }

  try {
    if (!geolib.isValidCoordinate(coords) ||
      (withAlt && isNaN(coords.altitude))) { return null; }
  } catch {
    return null;
  }

  return geolib.toDecimal(coords);
};

const isValidCoord = function(coordinate) {
  return coordinate &&
    typeof(coordinate.latitude) === 'number' &&
    typeof(coordinate.longitude) === 'number';
};

export const formatCoordinate = function(coord, toFormat, precision) {
  if (typeof(coord) === 'string') {
    coord = stringToCoords(coord);
  }

  if (!isValidCoord(coord)) { return ''; }

  if (!isFinite(precision) || (!precision && precision !== 0)) { precision = DEFAULT_FORMAT_PRECISION; }
  precision = Math.floor(Number(precision));
  precision = Math.max(0, Math.min(precision, MAX_FORMAT_PRECISION));
  const preciseRound = round(precision);

  let latitude = preciseRound(coord.latitude);
  let longitude = preciseRound(coord.longitude);

  toFormat = toLower(toFormat).trim();

  if (toFormat === 'gga') {
    return nmea.encode('GPGGA', {
      date: new Date(),
      lat: latitude,
      lon: longitude,
      satellites: 0
    });
  }

  if (toFormat === 'degrees' || toFormat === 'sexagesimal') {
    latitude = geolib.decimalToSexagesimal(latitude) + (latitude < 0 ? ' S' : ' N');
    longitude = geolib.decimalToSexagesimal(longitude) + (longitude < 0 ? ' W' : ' E');
  }

  return `${latitude}, ${longitude}`;
};

export const distance = function(coordinate1, coordinate2) {
  if (typeof(coordinate1) === 'string') {
    coordinate1 = stringToCoords(coordinate1);
  }
  if (typeof(coordinate2) === 'string') {
    coordinate2 = stringToCoords(coordinate2);
  }

  if (!isValidCoord(coordinate1) || !isValidCoord(coordinate2)) {
    return NaN;
  }

  return geolib.getPreciseDistance(coordinate1, coordinate2);
};

export const isPointInside = function(coord, polyArray) {
  if (typeof(coord) === 'string') { coord = stringToCoords(coord); }
  if (!isValidCoord(coord)) { return; }

  if (!Array.isArray(polyArray)) { return; }

  const origLength = polyArray.length;
  polyArray = polyArray.map((point) => {
    if (typeof(point) === 'string') { point = stringToCoords(point); }
    return isValidCoord(point) && point;
  });
  polyArray = compact(polyArray);

  // check if any of the poly points were invalid
  if (polyArray.length !== origLength) { return; }

  return geolib.isPointInPolygon(coord, polyArray);
};

export const getCleanArrayFromNewLineString = function(coords) {
  return pipe(split(/\n|\r/), map(trim), reject(isEmpty))(coords);
};

export const getCoordsFromNewLineString = function(coordsString) {
  return pipe(getCleanArrayFromNewLineString, map(stringToCoords))(coordsString);
};

export const isDrawablePolygonCoordsString = function(coordsString) {
  const cleanedCoords = getCleanArrayFromNewLineString(coordsString);
  if (cleanedCoords.length < 3) {
    return false;
  }
  return all(isGpsString, cleanedCoords);
};

export const latLngArrayToLngLatArray = function(coordinates) {
  return coordinates.map(([lat, lng]) => [lng, lat]);
};

const coordObjToLngLatArray = function(coordinate) {
  return [coordinate.longitude, coordinate.latitude];
};

export const coordObjsToLngLatArrays = function(coordinates) {
  return coordinates.map(coordObjToLngLatArray);
};
