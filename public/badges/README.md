# Badge Images

This directory contains badge images for the gamification system.

## Badge Naming Convention

Badge images should follow this naming convention:

- Chapter badges: `{Category}_U{Unit}C{Chapter}.png`
  - Example: `Food_U1C1.png` for Food Unit 1 Chapter 1

- Unit badges: `{Category}_Unit_{Unit}.png`
  - Example: `Food_Unit_1.png` for Food Unit 1

## Categories

- `Food` - For food-related badges
- `Wine` - For wine-related badges

## Image Requirements

- Format: PNG with transparency
- Size: 200x200 pixels recommended
- Resolution: 72 DPI
- Color space: RGB

## Adding New Badge Images

1. Create the badge image following the naming convention
2. Place the image in this directory
3. Update the badge definitions in `src/controllers/badgeController.mjs` if needed

## Badge Types

### Chapter Badges
- Awarded when a user completes all lessons in a chapter
- Naming: `{Category}_U{Unit}C{Chapter}.png`

### Unit Badges
- Awarded when a user completes all chapters in a unit
- Naming: `{Category}_Unit_{Unit}.png`

## Badge Assignment

Badges are automatically awarded when:
- A user completes all lessons in a chapter (score >= 70%)
- A user completes all chapters in a unit

Badges can also be manually assigned by Super Admins through the admin interface. 