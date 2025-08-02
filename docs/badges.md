# Badge System Documentation

## Overview
The badge system is designed to gamify the learning experience and reward users for their achievements in completing chapters and units. Badges serve as visual indicators of progress and mastery in different areas of food and wine knowledge.

## Badge Types

### Food Badges
1. **Unit 1 Badges**
   - Chapter 1 Expert (Food_U1C1.png)
   - Chapter 2 Expert (Food_U1C2.png)
   - Chapter 3 Expert (Food_U1C3.png)
   - Chapter 4 Expert (Food_U1C4.png)
   - Chapter 5 Expert (Food_U1C5.png)
   - Unit 1 Complete (Food_Unit_1.png)

2. **Unit 2 Badges**
   - Chapter 1 Expert (Food_U2C1.png)
   - Chapter 2 Expert (Food_U2C2.png)
   - Chapter 3 Expert (Food_U2C3.png)
   - Unit 2 Complete (Food_Unit_2.png)

### Wine Badges
1. **Unit 1 Badges**
   - Chapter 1 Expert (Wine_U1C1.png)
   - Chapter 2 Expert (Wine_U1C2.png)
   - Chapter 3 Expert (Wine_U1C3.png)
   - Chapter 4 Expert (Wine_U1C4.png)
   - Unit 1 Complete (Wine_Unit_1.png)

2. **Unit 2 Badges**
   - Chapter 1 Expert (Wine_U2C1.png)
   - Chapter 2 Expert (Wine_U2C2.png)
   - Chapter 3 Expert (Wine_U2C3.png)
   - Chapter 4 Expert (Wine_U2C4.png)
   - Unit 2 Complete (Wine_Unit_2.png)

## Earning Criteria

### Chapter Badges
- Complete all lessons in the chapter
- Achieve a minimum score of 90% in the chapter's final assessment
- Complete all required exercises and quizzes

### Unit Badges
- Earn all chapter badges within the unit
- Complete all unit-level assessments
- Maintain an average score of 85% across all chapter assessments

## Badge Management

### Automatic Awarding
- Badges are automatically awarded when users meet the earning criteria
- The system tracks progress and scores in real-time
- Badges are stored in the user's profile and displayed on their dashboard

### Manual Management (Super Admin Only)
Super Admins have the following capabilities:
1. View all available badges in the system
2. Assign badges to users manually
3. Remove badges from users
4. View badge analytics and distribution

## API Endpoints

### Badge Management
- `GET /api/badges` - Get all available badges
- `GET /api/badges/user/:userId` - Get user's badges
- `POST /api/badges/user/:userId` - Assign a badge to a user
- `DELETE /api/badges/user/:userId/:badgeId` - Remove a badge from a user
- `GET /api/badges/analytics` - Get badge distribution analytics

### Required Permissions
- `view_badges` - Required to view badges
- `manage_badges` - Required to assign/remove badges
- `view_analytics` - Required to view badge analytics

## Badge Analytics

The system provides comprehensive analytics including:
1. Total badges awarded
2. Distribution by category (Food/Wine)
3. Distribution by unit and chapter
4. Most common badges
5. Least common badges
6. Recent badge earnings
7. Average time to earn badges

## Best Practices

### For Users
1. Focus on completing chapters sequentially
2. Aim for high scores to earn badges
3. Review missed questions to improve understanding
4. Track progress through the dashboard

### For Super Admins
1. Regularly review badge distribution
2. Monitor analytics for engagement patterns
3. Use manual badge assignment sparingly
4. Document any manual badge assignments
5. Review badge removal requests carefully

## Troubleshooting

### Common Issues
1. **Badge Not Awarded**
   - Verify score meets minimum requirement (90%)
   - Check if all chapter requirements are completed
   - Ensure no technical issues with progress tracking

2. **Badge Display Issues**
   - Clear browser cache
   - Verify user permissions
   - Check badge image paths

3. **Analytics Discrepancies**
   - Verify data collection period
   - Check for incomplete data
   - Ensure proper permission settings

## Support

For badge-related issues:
1. Contact your Super Admin
2. Submit a support ticket
3. Check the system logs for error messages
4. Review the analytics dashboard for patterns 