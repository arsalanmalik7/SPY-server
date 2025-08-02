import dotenv from 'dotenv';
import path from 'path';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const config = {
  mongodb: {
    url: process.env.DEVELOPMENT_URI,
    databaseName: "test",
    options: {}
  },
  migrationsDir: "migrations",
  changelogCollectionName: "changelog",
  lockCollectionName: "changelog_lock",
  migrationFileExtension: ".js", 
  moduleSystem: "commonjs"
};

export default config;
