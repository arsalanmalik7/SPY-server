import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { checkAllBadges } from '../services/badgeService.mjs';
import User from '../schema/userschema.mjs';
import Log from '../schema/logschema.mjs';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables
dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI)
  .then(() => console.log('Connected to MongoDB'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

// Function to check badges for all users
const checkBadgesForAllUsers = async () => {
  try {
    console.log('Starting badge check for all users...');
    
    // Get all active users
    const users = await User.find({ active: true });
    console.log(`Found ${users.length} active users`);
    
    let badgesAwarded = 0;
    
    // Check badges for each user
    for (const user of users) {
      console.log(`Checking badges for user: ${user.first_name} ${user.last_name} (${user.uuid})`);
      
      // Check all badges for this user
      const result = await checkAllBadges(user.uuid);
      
      if (result) {
        badgesAwarded++;
        console.log(`Successfully checked badges for user: ${user.first_name} ${user.last_name}`);
      } else {
        console.log(`Failed to check badges for user: ${user.first_name} ${user.last_name}`);
      }
    }
    
    console.log(`Badge check completed. Checked ${users.length} users.`);
    
    // Log the operation
    await Log.create({
      uuid: uuidv4(),
      user_uuid: 'system',
      action: 'check_all_user_badges',
      details: {
        users_checked: users.length,
        badges_awarded: badgesAwarded
      },
      role: 'system',
      timestamp: new Date()
    });
    
    console.log('Operation logged successfully');
    
    // Disconnect from MongoDB
    await mongoose.disconnect();
    console.log('Disconnected from MongoDB');
    
    process.exit(0);
  } catch (error) {
    console.error('Error checking badges for all users:', error);
    process.exit(1);
  }
};

// Run the function
checkBadgesForAllUsers(); 