import * as payloadHelper from 'losant-handlebars';
import {
  distance as calculateDistance,
  isPointInside,
  getCleanArrayFromNewLineString
} from 'losant-handlebars/src/gps-helpers.js';
import errors from 'losant-nodejs-utils/src/errors.js';
import { isNilOrEmpty } from 'omnibelt';

class GeofenceNode {

  /* Example Config:
  {
    checkType: <String - Optional: One of radius, polygon, or polygonCoords. Default radius>,
    gpsCheck: <String - Required: Template or value for the GPS formatted string to test>,
    polygonPath: <String - Required when checkType is polygon: Payload path to an array of GPS coordinates that define a polygon>,
    polygonCoords: <String - Required when checkType is polygonCoords: Template for a string of newline-delimited GPS coordinates that define a polygon>,
    gpsCenter: <String - Required when checkType is radius: Template or value for the GPS formatted string at the center of the circle>,
    radius: <String - Required when checkType is radius: Template or value for the radius, in meters>,
    resultPath: <String - Optional (radius only): Payload path where the distance between the two coordinates, in meters, is written>,
    branchPath: <String - Optional: Payload path where the boolean result of the check is written (true if inside, false if outside)>
  }
  Notes:
    Outputs: outputIds[1] is the true path (inside), outputIds[0] is the false path (outside).
    Radius: The true path is taken if the distance between the two points is less than or equal to
      the radius. Otherwise the false path is taken. If the radius renders empty, is negative,
      or is not a finite number, the false path is taken and neither resultPath nor branchPath is written.
    Polygon: gpsCheck must be within the provided polygon. The order of the points in the polygon matters.
      resultPath is not used for polygon checks.
    Errors: A GeoError is thrown if the distance or polygon enclosure cannot be calculated.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.gpsCheck = config.gpsCheck;
    this.branchPath = config.branchPath;
    this.checkType = config.checkType || 'radius';

    this.gpsCenter = config.gpsCenter;
    this.radius = config.radius;
    this.resultPath = config.resultPath;

    this.polygonPath = config.polygonPath;

    this.polygonCoords = config.polygonCoords;
  }

  runRadius(context, payload) {
    let radius = payloadHelper.render(this.radius, payload);

    if (isNilOrEmpty(radius)) { return [this.outputIds[0], payload]; }

    radius = Number(radius);
    if (radius < 0 || !Number.isFinite(radius)) { return [this.outputIds[0], payload]; }

    const distance = calculateDistance(
      payloadHelper.render(this.gpsCheck, payload),
      payloadHelper.render(this.gpsCenter, payload));

    if (!isFinite(distance)) { throw new errors.GeoError({ message: 'Error calculating coordinate distance.' }); }

    if (this.resultPath) { payload = payloadHelper.set(this.resultPath, distance, payload); }

    const result = distance <= radius;
    if (this.branchPath) { payload = payloadHelper.set(this.branchPath, result, payload); }

    const resultIds = this.outputIds[Number(result)];
    return [resultIds, payload];
  }

  runPolygon(context, payload) {
    let isInside = isPointInside(
      payloadHelper.render(this.gpsCheck, payload),
      payloadHelper.lookup(this.polygonPath, payload));

    if (isInside === undefined) { throw new errors.GeoError({ message: 'Error calculating polygon enclosure.' }); }

    isInside = !!isInside; // make sure it is a boolean, in case
    if (this.branchPath) { payload = payloadHelper.set(this.branchPath, isInside, payload); }

    const resultIds = this.outputIds[Number(isInside)];
    return [resultIds, payload];
  }

  runPolygonCoords(context, payload) {
    const coordsString = payloadHelper.renderToString(this.polygonCoords, payload);
    const coords = getCleanArrayFromNewLineString(coordsString); // split by new line or return line

    let isInside = isPointInside(
      payloadHelper.render(this.gpsCheck, payload),
      coords);

    if (isInside === undefined) { throw new errors.GeoError({ message: 'Error calculating polygon enclosure.' }); }

    isInside = !!isInside; // make sure it is a boolean, in case
    if (this.branchPath) { payload = payloadHelper.set(this.branchPath, isInside, payload); }

    const resultIds = this.outputIds[Number(isInside)];
    return [resultIds, payload];
  }

  run(context, payload) {
    if (this.checkType === 'polygon') {
      return this.runPolygon(context, payload);
    } else if (this.checkType === 'polygonCoords') {
      return this.runPolygonCoords(context, payload);
    } else {
      return this.runRadius(context, payload);
    }
  }

}

export default GeofenceNode;
