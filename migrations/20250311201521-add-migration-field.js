export async function up(db, client) {
  console.log("🚀 Running migration: Adding TTL index to users...");

  // Ensure all documents have a valid `createdAt` field (MongoDB requires a Date type for TTL)
  await db.collection("users").updateMany(
    { createdAt: { $exists: false } },
    { $set: { createdAt: new Date() } }
  );

  // Explicitly set expireAfterSeconds as a number to avoid null issues
  await db.collection("users").createIndex(
    { createdAt: 1 },
    { expireAfterSeconds: Number(86400) } // Ensure it's a number
  );

  console.log("✅ TTL index created successfully.");
}

export async function down(db, client) {
  console.log("⏪ Rolling back migration...");

  await db.collection("users").dropIndex("createdAt_1").catch(() => {
    console.log("⚠️ 'createdAt_1' index was not found.");
  });

  console.log("✅ Rollback complete.");
}