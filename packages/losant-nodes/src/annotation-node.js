import errors from 'losant-nodejs-utils/src/errors.js';

class AnnotationNode {

  constructor(id) {
    this.id = id;
  }

  async run() {
    throw errors.Validation({ message: 'Annotations should not be run.' });
  }

}

export default AnnotationNode;
