# Badge System Documentation

## Overview

The badge system is a gamification feature that awards visual badges to users (Employees, Managers, Directors) upon completing individual chapters and entire units. Badges appear on their dashboard and represent achievement milestones to increase motivation and engagement.

## Badge Types

### Chapter Badges
- Awarded when a user completes all lessons in a chapter with a score of 70% or higher
- Naming: `{Category}_U{Unit}C{Chapter}.png`
- Example: `Food_U1C1.png` for Food Unit 1 Chapter 1

### Unit Badges
- Awarded when a user completes all chapters in a unit
- Naming: `{Category}_Unit_{Unit}.png`
- Example: `Food_Unit_1.png` for Food Unit 1

## Badge Categories

- **Food** - For food-related badges
- **Wine** - For wine-related badges

## Badge Assignment

Badges are automatically awarded when:
- A user completes all lessons in a chapter (score >= 70%)
- A user completes all chapters in a unit

Badges can also be manually assigned by Super Admins through the admin interface.

## API Endpoints

### Get All Badges
- **URL**: `/api/badges`
- **Method**: `GET`
- **Auth Required**: Yes (Super Admin only)
- **Permissions Required**: `view_badges`
- **Description**: Returns all available badges in the system

### Get User Badges
- **URL**: `/api/badges/user/:userId`
- **Method**: `GET`
- **Auth Required**: Yes
- **Permissions Required**: `view_badges`
- **Description**: Returns all badges earned by a specific user

### Assign Badge
- **URL**: `/api/badges/user/:userId`
- **Method**: `POST`
- **Auth Required**: Yes (Super Admin only)
- **Permissions Required**: `manage_badges`
- **Description**: Manually assign a badge to a user

### Remove Badge
- **URL**: `/api/badges/user/:userId/:badgeId`
- **Method**: `DELETE`
- **Auth Required**: Yes (Super Admin only)
- **Permissions Required**: `manage_badges`
- **Description**: Remove a badge from a user

### Get Badge Analytics
- **URL**: `/api/badges/analytics`
- **Method**: `GET`
- **Auth Required**: Yes (Super Admin only)
- **Permissions Required**: `view_analytics`
- **Description**: Returns analytics about badge distribution and earning patterns

## Badge Images

Badge images are stored in the `public/badges` directory and are served via the `/public/badges` endpoint. See the README in that directory for image requirements and naming conventions.

## Implementation Details

### Automatic Badge Awarding

The system automatically checks for badge eligibility when:
1. A user completes a lesson with a score of 70% or higher
2. A user completes all lessons in a chapter
3. A user completes all chapters in a unit

### Badge Checking Script

A script is available to check and award badges for all users:
```
npm run check-badges
```

This is useful for initial setup or to fix any missing badges.

### Testing

Tests are available for the badge system:
```
npm run test:badges
```

## Future Enhancements

- Badge notification system
- Badge progress tracking
- Badge details view
- Badge sharing on social media 