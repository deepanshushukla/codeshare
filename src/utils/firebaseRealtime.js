const firebaseRealTime = (firebaseDatabaseRef) => {
  return {
    set: (data) => {
      firebaseDatabaseRef.set({
        ...data,
        createdOn: Date(),
        updatedOn: Date(),
      });
    },
    update: (data) => {
      firebaseDatabaseRef.update({ ...data, updatedOn: Date() });
    },
  };
};

export default firebaseRealTime;
