import { v4 as uuidv4 } from 'uuid';
import { User } from '../schema/userschema.mjs';
import { Lesson } from '../schema/lessonschema.mjs';
import { Log } from '../schema/logschema.mjs';



const badgeImages = {
  food: {
    units: {
      1: '/public/Food_Unit_1.png',
      2: '/public/Food_Unit_2.png'
    },
    chapters: {
      '1-1': '/public/Food_U1C1.png',
      '1-2': '/public/Food_U1C2.png',
      '1-3': '/public/Food_U1C3.png',
      '1-4': '/public/Food_U1C4.png',
      '1-5': '/public/Food_U1C5.png',
      '2-1': '/public/Food_U2C1.png',
      '2-2': '/public/Food_U2C2.png',
      '2-3': '/public/Food_U2C3.png'
    }
  },
  wine: {
    units: {
      1: '/public/Wine_Unit_1.png',
      2: '/public/Wine_Unit_2.png'
    },
    chapters: {
      '1-1': '/public/Wine_U1C1.png',
      '1-2': '/public/Wine_U1C2.png',
      '1-3': '/public/Wine_U1C3.png',
      '1-4': '/public/Wine_U1C4.png',
      '2-1': '/public/Wine_U2C1.png',
      '2-2': '/public/Wine_U2C2.png',
      '2-3': '/public/Wine_U2C3.png',
      '2-4': '/public/Wine_U2C4.png'
    }
  }
};


const getBadgeImage = (category, unit, chapter) => {
  if (chapter) {
    return badgeImages[category]?.chapters?.[`${unit}-${chapter}`] || '';
  }
  return badgeImages[category]?.units?.[unit] || '';
};


// Check if a user has completed all chapters in a unit
const hasCompletedUnit = async (userId, category, unit, restaurant_uuid) => {
  // Get all lessons for this category and unit
  const lessons = await Lesson.find({ isDeleted: false, category, unit, restaurant_uuid });

  // Get user's progress for these lessons
  const user = await User.findOne({ uuid: userId });
  if (!user) return false;

  // Check if user has completed all lessons in this unit
  const completedLessons = lessons.filter(lesson => {
    const progress = lesson.progress.find(p => p.employeeId === userId);
    return progress && progress.status === 'completed' && progress.score >= 70;
  });

  return completedLessons.length === lessons.length;
};

// Check if a user has completed a specific chapter
const hasCompletedChapter = async (userId, category, unit, chapter, restaurant_uuid, menu_items) => {
  // Get all lessons for this category, unit, and chapter
  const lessons = await Lesson.find({ isDeleted: false, category, unit, chapter, restaurant_uuid, menu_items });

  // Get user's progress for these lessons
  const user = await User.findOne({ uuid: userId });
  if (!user) return false;

  // Check if user has completed all lessons in this chapter
  const completedLessons = lessons.filter(lesson => {
    const progress = lesson.progress.find(p => p.employeeId === userId);
    console.log(progress, "progress");
    return progress && progress.status === 'completed' && progress.score >= 70;
  });

  return completedLessons.length === lessons.length;
};

// Award a badge to a user
const awardBadge = async (userId, badgeData) => {
  try {
    const user = await User.findOne({ uuid: userId });
    console.log(badgeData, "badgeData");
    if (!user) return false;

    // Check if user already has this badge
    const existingBadge = user.badges.find(b =>
      b.category === badgeData.category &&
      b.unit === badgeData.unit &&
      b.chapter === badgeData.chapter
    );

    if (existingBadge) return false;

    // Add new badge
    const newBadge = {
      badge_id: uuidv4(),
      badge_name: badgeData.name,
      category: badgeData.category,
      unit: badgeData.unit,
      chapter: badgeData.chapter,
      score: badgeData.score || 100,
      earned_at: new Date(),
      badge_image: getBadgeImage(badgeData.category, badgeData.unit, badgeData.chapter)
    };



    user.badges.push(newBadge);
    await user.save();

    // Log badge award
    await Log.create({
      uuid: uuidv4(),
      user_uuid: userId,
      action: "badge_awarded",
      details: {
        badge_id: newBadge.badge_id,
        badge_name: newBadge.badge_name,
        category: newBadge.category,
        unit: newBadge.unit,
        chapter: newBadge.chapter,
        score: newBadge.score
      },
      role: user.role,
      restaurant_uuid: user.assigned_restaurants[0],
      timestamp: new Date()
    });

    return true;
  } catch (error) {
    console.error("Error awarding badge:", error);
    return false;
  }
};

// Check and award chapter completion badge
export const checkChapterCompletion = async (userId, category, unit, chapter, score, restaurant_uuid, menu_items) => {
  try {
    const completed = await hasCompletedChapter(userId, category, unit, chapter, restaurant_uuid, menu_items);
    console.log(completed, 'completed');
    if (!completed) return false;

    // Get image based on category, unit, and chapter
    const badgeImage = badgeImages[category]?.chapters?.[`${unit}-${chapter}`] || '';
    

    const badgeData = {
      name: `${category.charAt(0).toUpperCase() + category.slice(1)} Chapter ${chapter} Expert`,
      category,
      unit,
      chapter,
      score: score,
      badge_image: badgeImage // <-- pass image here
    };

    return await awardBadge(userId, badgeData);
  } catch (error) {
    console.error("Error checking chapter completion:", error);
    return false;
  }
};


// Check and award unit completion badge
export const checkUnitCompletion = async (userId, category, unit, score, restaurant_uuid, menu_items) => {
  try {
    const completed = await hasCompletedUnit(userId, category, unit, restaurant_uuid, menu_items);
    console.log(completed, 'completed');
    if (!completed) return false;

    // Get image based on category and unit
    const badgeImage = badgeImages[category]?.units?.[unit] || '';

    const badgeData = {
      name: `${category.charAt(0).toUpperCase() + category.slice(1)} Unit ${unit} Complete`,
      category,
      unit,
      score: score,
      badge_image: badgeImage // <-- pass image here
    };

    return await awardBadge(userId, badgeData);
  } catch (error) {
    console.error("Error checking unit completion:", error);
    return false;
  }
};


// Check all badges for a user
export const checkAllBadges = async (userId) => {
  try {
    const user = await User.findOne({ uuid: userId });
    if (!user) return false;

    // Get all lessons for this user
    const lessons = await Lesson.find({
      isDeleted: false,
      category: { $in: ['food', 'wine'] },
      restaurant_uuid: { $in: user.assigned_restaurants }
    });

    // Get unique categories, units, and chapters
    const categories = [...new Set(lessons.map(l => l.category))];

    for (const category of categories) {
      const categoryLessons = lessons.filter(l => l.category === category);
      const units = [...new Set(categoryLessons.map(l => l.unit))];

      for (const unit of units) {
        // Check unit completion
        await checkUnitCompletion(userId, category, unit);

        // Check chapter completion
        const unitLessons = categoryLessons.filter(l => l.unit === unit);
        const chapters = [...new Set(unitLessons.map(l => l.chapter))];

        for (const chapter of chapters) {
          await checkChapterCompletion(userId, category, unit, chapter);
        }
      }
    }

    return true;
  } catch (error) {
    console.error("Error checking all badges:", error);
    return false;
  }
}; 