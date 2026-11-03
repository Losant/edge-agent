import errors from '../errors.js';

export default (topic, alternateLosantTopic) => {
  if (!topic || Buffer.byteLength(topic, 'utf8') > 230 || // 255 minus applicationId prefix
    // no wildcards, no null chars
    topic.includes('#') || topic.includes('+') ||
    // no null chars
    topic.includes('\0') ||
    // no system topics
    topic.startsWith('$') ||
    // no losant topics
    topic.startsWith('losant') || (alternateLosantTopic && topic.startsWith(alternateLosantTopic))
  ) {
    throw errors.Validation({ message: `Invalid topic name: ${topic}` });
  }
};
