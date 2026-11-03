import * as payloadHelper from 'losant-handlebars';
import { phone, countryPhoneData } from 'phone';
import { toString, flatten } from 'omnibelt';

// https://github.com/AfterShip/phone/issues/133
const nonGeoAreaCodes = [ '500', '521', '522', '523', '533', '544', '566', '577', '588' ];
countryPhoneData[0].mobile_begin_with.push(...nonGeoAreaCodes);

export default (numberTemplates, payload) => {
  if (!Array.isArray(numberTemplates)) { numberTemplates = [numberTemplates]; }
  const numbers = numberTemplates.map((potentialNumbers) => {
    potentialNumbers = payloadHelper.render(potentialNumbers, payload);
    if (!potentialNumbers) { return { orig: potentialNumbers }; }
    if (!Array.isArray(potentialNumbers)) { potentialNumbers = [potentialNumbers]; }
    return potentialNumbers.map((innerNumbers) => {
      return toString(innerNumbers).split(/,|;/).map((potNum) => {
        if (!potNum) { return { orig: potNum }; }
        let phoneInfo = phone(potNum);
        if (!phoneInfo.isValid) {
          phoneInfo = phone(`+${potNum}`);
          if (!phoneInfo.isValid) {
            phoneInfo = phone(`+1${potNum}`);
          }
        }
        return {
          orig: potNum,
          parsed: phoneInfo.phoneNumber
        };
      });
    });
  });
  return flatten(numbers);
};
