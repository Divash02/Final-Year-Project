import mongoose from "mongoose";

/**
 * Executes a callback within a MongoDB transaction if replica set is available,
 * or gracefully falls back to non-transactional execution on standalone instances.
 *
 * This guarantees safety across diverse development, CI/CD, and production MongoDB deployments
 * without throwing "Transaction numbers are only allowed on a replica set member or mongos".
 *
 * @param {Function} callback - Async function receiving (session) where session is null or ClientSession
 * @returns {Promise<any>} Result of the callback
 */
export async function withTransaction(callback) {
  // If connection is not active or readyState is not connected (1), run directly
  if (!mongoose.connection || mongoose.connection.readyState !== 1) {
    return callback(null);
  }

  // Check if current connection supports transactions (replica set or mongos)
  const isReplicaSet = Boolean(
    mongoose.connection?.client?.topology?.description?.type === "ReplicaSetWithPrimary" ||
    mongoose.connection?.client?.topology?.description?.type === "Sharded" ||
    (mongoose.connection?.client?.topology?.servers && mongoose.connection.client.topology.servers.size > 1)
  );

  if (!isReplicaSet) {
    return callback(null);
  }

  let session = null;
  try {
    session = await mongoose.startSession();
  } catch (err) {
    // Session creation failed or not supported in this environment
    return callback(null);
  }

  // Attempt transaction
  try {
    let result;
    let transactionStarted = false;

    try {
      session.startTransaction();
      transactionStarted = true;
    } catch (startErr) {
      // Standalone mongod does not allow transactions
      transactionStarted = false;
    }

    if (transactionStarted) {
      try {
        result = await callback(session);
        await session.commitTransaction();
      } catch (execErr) {
        await session.abortTransaction();
        throw execErr;
      }
    } else {
      // Fallback: run without transaction session
      result = await callback(null);
    }

    return result;
  } finally {
    try {
      await session.endSession();
    } catch (_) {
      // Session already closed
    }
  }
}
