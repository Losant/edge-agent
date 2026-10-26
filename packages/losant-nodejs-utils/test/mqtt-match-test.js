import mqttMatch from '../src/utils/mqtt-match.js';

describe('MQTT Match', () => {

  it('should match a single MQTT topic with wildcards', () => {
    const filters = '+/+/#';
    let topics = 'any/old/topic';
    let myMatch = mqttMatch(filters, topics);
    myMatch.should.deepEqual([filters]);
    topics = 'any';
    myMatch = mqttMatch(filters, topics);
    myMatch.should.deepEqual([]);
  });

  it('should match multiple MQTT topics with wildcards', () => {
    // these will pass
    const exactMatch = 'all/the/things/topic';
    const tameCards = ['+/the/things/topic', 'all/+/things/topic', 'all/the/+/topic', 'all/the/things/+'];
    const wildCards = ['#', '+/#', '+/+/#', '+/+/+/#', '+/+/+/+/#', '+/+/+/+', '+/the/#'];
    // these will fail
    const crazyCards = ['$SYS/#', '+/#/+', '+/not/my/#', '+//#', '+/+/+/+/+', ''];

    const filters = [exactMatch, ...tameCards, ...wildCards, ...crazyCards];
    let topics = ['all/the/things/topic', 'some/the/things/topic'];
    let myMatch = mqttMatch(filters, topics);
    myMatch.should.deepEqual([exactMatch, ...tameCards, ...wildCards]);

    // trailing plus check
    topics = 'plus/this/';
    myMatch = mqttMatch(['+/+/+'], topics);
    myMatch.should.deepEqual(['+/+/+']);

    // dollar sign
    filters.push('$all/#');
    topics = '$all/the/things/topic';
    myMatch = mqttMatch(filters, topics);
    myMatch.should.deepEqual(['$all/#']);
  });

});
