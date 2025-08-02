import { v4 as uuidv4 } from "uuid";

module.exports = {
  async up(db, client) {
    console.log("🚀 Running migration: Adding unique UUID field to users...");

    // Use `updateMany` with `$set` and `$function` to generate a unique UUID for each user
    await db.collection("users").updateMany(
      { uuid: { $exists: false } },
      [
        {
          $set: { uuid: { $function: () => uuidv4() } },
        },
      ]
    );

    console.log("✅ Migration complete: UUID field added to users.");
  },

  async down(db, client) {
    console.log("⏪ Rolling back migration: Removing UUID field from users...");

    await db.collection("users").updateMany({}, { $unset: { uuid: "" } });

    console.log("✅ Rollback complete: UUID field removed from users.");
  },
};



// npx migrate-mongo up
// npx migrate-mongo down 

// mongosh "mongodb+srv://<email>:Ll9T6BXUMbFAETSy@cluster0.rywr9.mongodb.net/test"
// use test
// db.changelog.drop()