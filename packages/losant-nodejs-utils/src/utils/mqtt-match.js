export default (filters, topics) => {
  filters = Array.isArray(filters) ? filters : [filters];
  topics = Array.isArray(topics) ? topics : [topics];

  return topics.reduce((result, topic) => {
    const topicArray = topic.split('/');
    const tLength = topicArray.length;
    return [...new Set([...result, ...filters.filter((filterTopic) => {
      const filterArray = filterTopic.split('/');
      const fLength = filterArray.length;
      if (filterArray[fLength - 1] !== '#' && fLength < tLength) { return false; }
      return filterArray.every((left, i) => {
        const right = topicArray[i] || '';
        if ((left.startsWith('$') || right.startsWith('$')) && left !== right) { return false; }
        if (left === '#') { return tLength >= fLength - 1; }
        if (left !== '+' && left !== right) { return false; }
        return i < tLength;
      });
    })])];
  }, []);
};
