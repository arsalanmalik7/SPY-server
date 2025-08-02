import { expect } from 'chai';
import mongoose from 'mongoose';
import dotenv from 'dotenv';
import { checkChapterCompletion, checkUnitCompletion } from '../services/badgeService.mjs';
import User from '../schema/userschema.mjs';
import Lesson from '../schema/lessonschema.mjs';
import { v4 as uuidv4 } from 'uuid';

// Load environment variables
dotenv.config();

// Connect to MongoDB
mongoose.connect(process.env.MONGODB_URI || process.env.DEVELOPMENT_URI)
  .then(() => console.log('Connected to MongoDB for testing'))
  .catch(err => {
    console.error('MongoDB connection error:', err);
    process.exit(1);
  });

describe('Badge Service Tests', () => {
  let testUser;
  let testLesson;
  
  before(async () => {
    // Create a test user
    testUser = new User({
      uuid: uuidv4(),
      first_name: 'Test',
      last_name: 'User',
      email: `test-${uuidv4()}@example.com`,
      password: 'password123',
      role: 'employee',
      assigned_restaurants: [uuidv4()],
      active: true
    });
    await testUser.save();
    
    // Create a test lesson
    testLesson = new Lesson({
      uuid: uuidv4(),
      category: 'food',
      unit: 1,
      unit_name: 'Food Unit 1',
      chapter: 1,
      chapter_name: 'Food Chapter 1',
      restaurant_uuid: testUser.assigned_restaurants[0],
      difficulty: 'beginner',
      content: new Map([['content', 'Test content']]),
      questions: [],
      createdBy: testUser.uuid
    });
    await testLesson.save();
  });
  
  after(async () => {
    // Clean up test data
    await User.deleteOne({ uuid: testUser.uuid });
    await Lesson.deleteOne({ uuid: testLesson.uuid });
    await mongoose.disconnect();
  });
  
  describe('checkChapterCompletion', () => {
    it('should not award a badge if chapter is not completed', async () => {
      const result = await checkChapterCompletion(testUser.uuid, 'food', 1, 1);
      expect(result).to.be.false;
    });
    
    it('should award a badge if chapter is completed', async () => {
      // Update lesson progress to completed
      testLesson.progress.push({
        employeeId: testUser.uuid,
        status: 'completed',
        score: 80,
        startTime: new Date(),
        completionTime: new Date(),
        timeSpent: 300,
        attempts: [{
          timestamp: new Date(),
          score: 80,
          timeSpent: 300,
          answers: []
        }],
        lastAccessed: new Date(),
        completedAt: new Date()
      });
      await testLesson.save();
      
      // Check for badge
      const result = await checkChapterCompletion(testUser.uuid, 'food', 1, 1);
      expect(result).to.be.true;
      
      // Verify badge was awarded
      const updatedUser = await User.findOne({ uuid: testUser.uuid });
      expect(updatedUser.badges).to.have.lengthOf(1);
      expect(updatedUser.badges[0].category).to.equal('food');
      expect(updatedUser.badges[0].unit).to.equal(1);
      expect(updatedUser.badges[0].chapter).to.equal(1);
    });
  });
  
  describe('checkUnitCompletion', () => {
    it('should not award a badge if unit is not completed', async () => {
      const result = await checkUnitCompletion(testUser.uuid, 'food', 2);
      expect(result).to.be.false;
    });
    
    it('should award a badge if unit is completed', async () => {
      // Create another lesson in the same unit
      const testLesson2 = new Lesson({
        uuid: uuidv4(),
        category: 'food',
        unit: 1,
        unit_name: 'Food Unit 1',
        chapter: 2,
        chapter_name: 'Food Chapter 2',
        restaurant_uuid: testUser.assigned_restaurants[0],
        difficulty: 'beginner',
        content: new Map([['content', 'Test content']]),
        questions: [],
        createdBy: testUser.uuid
      });
      await testLesson2.save();
      
      // Update lesson progress to completed
      testLesson2.progress.push({
        employeeId: testUser.uuid,
        status: 'completed',
        score: 85,
        startTime: new Date(),
        completionTime: new Date(),
        timeSpent: 300,
        attempts: [{
          timestamp: new Date(),
          score: 85,
          timeSpent: 300,
          answers: []
        }],
        lastAccessed: new Date(),
        completedAt: new Date()
      });
      await testLesson2.save();
      
      // Check for badge
      const result = await checkUnitCompletion(testUser.uuid, 'food', 1);
      expect(result).to.be.true;
      
      // Verify badge was awarded
      const updatedUser = await User.findOne({ uuid: testUser.uuid });
      expect(updatedUser.badges).to.have.lengthOf(2);
      expect(updatedUser.badges[1].category).to.equal('food');
      expect(updatedUser.badges[1].unit).to.equal(1);
      expect(updatedUser.badges[1].chapter).to.be.undefined;
      
      // Clean up
      await Lesson.deleteOne({ uuid: testLesson2.uuid });
    });
  });
}); 