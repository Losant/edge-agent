export default (error) => {
  if (error instanceof Error) {
    return { name: error.name, message: error.message };
  } else {
    return error;
  }
};
