import * as payloadHelper from 'losant-handlebars';

class SwitchNode {

  /* Example Config:
  { switchTemplate: <String - Required: template for the root value to compare>,
    cases: [
      0 or more of:
      { caseTemplate: <String - Required: template for the case value>,
        caseLabel: <String - Optional: user defined name for the case. Not used at runtime> }
    ] }

  Notes: The outputIds for a given case are in the outputIds array at case index + 1.
  The 'default' outputIds are always at index 0 and are taken when no case matches.
  Cases are checked in order and only the first matching case is taken.
  A case matches when its value is strictly equal to the root value or when both
  convert to the same string. Plain objects never match unless strictly equal.
  */

  constructor(id, outputIds, config) {
    this.id = id;
    this.outputIds = outputIds;
    this.switchTemplate = config.switchTemplate;
    this.cases = config.cases || [];
  }

  switchCompare(switchValue, caseValue) {
    // if they are exact === match, MATCH
    if (switchValue === caseValue) { return true; }

    switchValue = String(switchValue);
    caseValue = String(caseValue);

    // if they are just objects with no other string representation, they can't match
    if (switchValue === '[object Object]') { return false; }
    if (caseValue === '[object Object]') { return false; }

    return switchValue === caseValue;
  }

  run(context, payload) {
    let resultIds  = [];
    const switchValue = payloadHelper.render(this.switchTemplate, payload);

    const matched = this.cases.some((caseInfo, index) => {
      const caseValue = payloadHelper.render(caseInfo.caseTemplate, payload);
      if (this.switchCompare(switchValue, caseValue)) {
        resultIds = resultIds.concat(this.outputIds[index+1] || []);
        return true;
      }
    });

    if (!matched) { resultIds = resultIds.concat(this.outputIds[0] || []); }
    return [resultIds, payload];
  }
}

export default SwitchNode;
