import mongoose from 'mongoose';
(async () => {
  await mongoose.connect(process.env.MONGODB_URI || 'mongodb://127.0.0.1:27017/collegeos');
  const db = mongoose.connection.db;
  const distinct = await db.collection('students').distinct('batch');
  console.log('batches', JSON.stringify(distinct));
  const distinctProg = await db.collection('students').distinct('program');
  console.log('programs', JSON.stringify(distinctProg));
  const distinctStatus = await db.collection('students').distinct('status');
  console.log('status', JSON.stringify(distinctStatus));
  await mongoose.connection.close();
})();
