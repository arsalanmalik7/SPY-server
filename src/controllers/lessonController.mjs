import { Lesson } from "../schema/lessonschema.mjs";
import { User } from "../schema/userschema.mjs";
import { Log } from "../schema/logschema.mjs";
import { Restaurant } from "../schema/restaurantschema.mjs";
import { Dish } from "../schema/dishschema.mjs";
import { v4 as uuidv4 } from "uuid";  // Import UUID
import { checkChapterCompletion, checkUnitCompletion } from '../services/badgeService.mjs';
import { Menu } from "../schema/menuschema.mjs";
import { LessonTemplate } from "../schema/lessonTemplate.mjs";
import { readFile } from "fs/promises"
import { GlobalWine } from "../schema/wineschema.mjs";

// Utility function to check admin/super_admin roles
const isSuperAdmin = (req) => req.user && (req.user.role === "admin" || req.user.role === "super_admin");
const isAdminOrManager = (req) => req.user && ["admin", "super_admin", "manager", "director"].includes(req.user.role);
const hasRole = (user, roles) => user && roles.includes(user.role);

// Create a new lesson
export const createLesson = async (req, res) => {
    try {
        const { category, unit, unit_name, chapter, chapter_name, questions, glossary, difficulty, content, restaurant_uuid, menu_items, dueDate } = req.body;



        // Validate required fields
        if (!category || !restaurant_uuid || !menu_items || !difficulty || !content) {
            return res.status(400).json({ message: "Missing required fields" });
        }

        // Check if user has permission to create lessons for this restaurant
        if (!isSuperAdmin(req) && !req.user.assigned_restaurants.includes(restaurant_uuid)) {
            return res.status(403).json({ message: "Unauthorized to create lessons for this restaurant" });
        }

        // Verify restaurant exists
        const restaurant = await Restaurant.findOne({ uuid: restaurant_uuid });
        if (!restaurant) {
            return res.status(404).json({ message: "Restaurant not found" });
        }

        // Verify menu items exist
        const menuItems = await Menu.find({ uuid: { $in: menu_items } });
        if (menuItems.length !== menu_items.length) {
            return res.status(400).json({ message: "One or more menu items not found" });
        }

        const newLesson = new Lesson({
            category,
            unit,
            unit_name,
            chapter,
            chapter_name,
            questions,
            glossary: glossary || {},
            difficulty,
            content,
            restaurant_uuid,
            menu_items,
            DueDate: dueDate || new Date(Date.now() + 24 * 60 * 60 * 1000), // Default to 1 day from now
            createdBy: req.user.uuid,
            lastModifiedBy: req.user.uuid
        });

        await newLesson.save();

        // Find all users (Directors, Managers, and Employees) in the restaurant
        const users = await User.find({
            role: { $in: ["director", "manager", "employee", "super_admin"] },
            assigned_restaurants: restaurant_uuid,
            active: true
        });

        // Automatically assign the lesson to all users
        const assignmentPromises = users.map(async (user) => {
            // Add lesson to user's assigned lessons if not already assigned
            if (!user.assignedLessons.includes(newLesson.uuid)) {
                user.assignedLessons.push(newLesson.uuid);
                await user.save();

                // Add user to lesson's assigned employees
                newLesson.assignedEmployees.push(user.uuid);

                // Initialize lesson progress for this user in this restaurant
                let restaurantProgress = user.lesson_progress.find(
                    rp => rp.restaurant_uuid === restaurant_uuid
                );

                if (!restaurantProgress) {
                    restaurantProgress = {
                        restaurant_uuid: restaurant_uuid,
                        lessons: [],
                        next_lesson_due: null
                    };
                    user.lesson_progress.push(restaurantProgress);
                }

                // Add initial lesson progress
                restaurantProgress.lessons.push({
                    lesson_id: newLesson.uuid,
                    status: "not_started",
                    attempts: 0,
                    score: 0
                });

                await user.save();
            }

            // Log the assignment
            await Log.create({
                uuid: uuidv4(),
                user_uuid: req.user.uuid,
                action: "auto_assign_lesson",
                details: {
                    lesson_uuid: newLesson.uuid,
                    user_uuid: user.uuid,
                    user_role: user.role,
                    restaurant_uuid
                },
                role: req.user.role,
                restaurant_uuid,
                timestamp: new Date()
            });
        });

        // Wait for all assignments to complete
        await Promise.all(assignmentPromises);

        // Save the updated lesson with assigned employees
        await newLesson.save();

        // Log the lesson creation
        await Log.create({
            uuid: uuidv4(),
            user_uuid: req.user.uuid,
            action: "create_lesson",
            details: {
                lesson_uuid: newLesson.uuid,
                restaurant_uuid,
                assigned_users_count: users.length
            },
            role: req.user.role,
            restaurant_uuid,
            timestamp: new Date()
        });

        res.status(201).json({
            message: "Lesson created and assigned successfully",
            lesson: newLesson,
            assignedUsersCount: users.length
        });
    } catch (error) {
        console.error("Error creating lesson:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Get all lessons
export const getAllLessons = async (req, res) => {
    try {
        let query = {};

        if (req.user.role === "super_admin") {
            // Super admin can see all lessons
            query = { isDeleted: false };
        } else if (req.user.role === "director") {
            // Directors can see lessons for their assigned restaurants
            query = { isDeleted: false, restaurant_uuid: { $in: req.user.assigned_restaurants } };
        } else if (req.user.role === "manager") {
            // Managers can only see lessons for their specific restaurant
            query = { isDeleted: false, restaurant_uuid: req.user.assigned_restaurants[0] };
        } else if (req.user.role === "employee") {
            // Employees can only see their assigned lessons
            query = { isDeleted: false, assignedEmployees: req.user.uuid };
        } else {
            return res.status(403).json({ message: "Unauthorized" });
        }

        // First get all lessons
        const lessons = await Lesson.find(query);

        // Then manually populate all references using UUIDs
        const populatedLessons = await Promise.all(lessons.map(async (lesson) => {
            // Get menu items
            const menuItems = await Dish.find({ isDeleted: false, uuid: { $in: lesson.menu_items } });

            // Get created by user
            const createdByUser = await User.findOne({ uuid: lesson.createdBy }, "first_name last_name");

            // Get last modified by user
            const lastModifiedByUser = await User.findOne({ uuid: lesson.lastModifiedBy }, "first_name last_name");

            return {
                ...lesson.toObject(),
                menu_items: menuItems,
                createdBy: createdByUser,
                lastModifiedBy: lastModifiedByUser
            };
        }));

        return res.status(200).json({ lessons: populatedLessons });
    } catch (error) {
        return res.status(500).json({ message: "Error fetching lessons", error });
    }
};

// Get lesson by ID
export const getLessonById = async (req, res) => {
    try {
        const lesson = await Lesson.findOne({ isDeleted: false, uuid: req.params.uuid }).populate("questions");

        if (!lesson) {
            return res.status(404).json({ message: "Lesson not found" });
        }

        if (!isSuperAdmin(req) && !req.user.lesson_progress.some(lp => lp.lesson_id === lesson.uuid)) {
            return res.status(403).json({ message: "You are not authorized to view this lesson." });
        }

        res.status(200).json(lesson);
    } catch (error) {
        console.error("Error fetching lesson:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Update lesson
export const updateLesson = async (req, res) => {
    try {
        const { uuid } = req.params;
        const { content, difficulty, questions, menu_items, isActive, dueDate } = req.body;

        // Find the lesson by UUID
        const lesson = await Lesson.findOne({ isDeleted: false, uuid });
        if (!lesson) {
            console.error("Lesson not found with UUID:", uuid);
            return res.status(404).json({ message: "Lesson not found" });
        }

        // Check if user has permission to update this lesson
        if (!isSuperAdmin(req) && !req.user.assigned_restaurants.includes(lesson.restaurant_uuid)) {
            return res.status(403).json({ message: "Unauthorized to update this lesson" });
        }

        // If lesson is already assigned to employees, only super admin can modify it
        if (lesson.assignedEmployees && lesson.assignedEmployees.length > 0 && !isSuperAdmin(req)) {
            return res.status(403).json({ message: "Cannot modify assigned lesson" });
        }

        // Update fields
        if (content) lesson.content = content;
        if (difficulty) lesson.difficulty = difficulty;
        if (questions) lesson.questions = questions;
        if (dueDate) lesson.DueDate = new Date(dueDate);
        if (menu_items) {
            // Verify menu items exist
            const menuItems = await Dish.find({ isDeleted: false, uuid: { $in: menu_items } });
            if (menuItems.length !== menu_items.length) {
                return res.status(400).json({ message: "One or more menu items not found" });
            }
            lesson.menu_items = menu_items;
        }
        if (isActive !== undefined) lesson.isActive = isActive;

        lesson.lastModifiedBy = req.user.uuid;
        await lesson.save();

        // Log the update
        await Log.create({
            uuid: uuidv4(),
            user_uuid: req.user.uuid,
            action: "update_lesson",
            details: { lesson_uuid: lesson.uuid, restaurant_uuid: lesson.restaurant_uuid },
            role: req.user.role,
            restaurant_uuid: lesson.restaurant_uuid,
            timestamp: new Date()
        });

        return res.status(200).json({ message: "Lesson updated successfully", lesson });
    } catch (error) {
        console.error("Error updating lesson:", error);
        return res.status(500).json({ message: "Error updating lesson", error: error.message });
    }
};

export const getEmployeeLessons = async (req, res) => {
    try {
        const { restaurant_uuid } = req.params;
        let lessonsWithStatus = [];

        const restaurant = await Restaurant.findOne({ uuid: restaurant_uuid });

        // If no restaurant specified, return lessons for all assigned restaurants
        if (restaurant_uuid === "employee") {
            const lessons = await Lesson.find({
                isDeleted: false,
                restaurant_uuid: { $in: req.user.assigned_restaurants.map(r => r.uuid) },
                "questions.isDeleted": false
            }).populate({
                path: "menu_items",
                match: { uuid: { $exists: true } }, // Ensures only valid references are populated
                localField: "menu_items",
                foreignField: "uuid",
            });


            const lessonsWithFilteredQuestions = lessons.map(lesson => {
                const lessonObj = lesson.toObject();
                lessonObj.questions = lessonObj.questions.filter(q => q.isDeleted === false);
                return lessonObj;
            });

            let menuItems;


            lessonsWithStatus = await Promise.all(lessonsWithFilteredQuestions.map(async (lesson) => {
                const userId = req.user.uuid;

                const userAnswers = req?.user?.attemptedQuestions?.filter((q) => q?.lesson_uuid?.uuid === lesson?.uuid);

                const userProgress = lesson?.progress?.find(pr => pr.employeeId === userId);

                if (lesson.menu_items_model === "Dish") {
                    const dishes = await Dish.find({ isDeleted: false, restaurant_uuid: { $in: req.user.assigned_restaurants.map(r => r.uuid) } });
                    menuItems = dishes.map(dish => ({
                        ...dish.toObject(),
                        type: dish.type
                    }));

                } else if (lesson.menu_items_model === "GlobalWine") {
                    const wines = await GlobalWine.find({ isDeleted: false, restaurant_uuid: { $in: req.user.assigned_restaurants.map(r => r.uuid) } });
                    menuItems = wines.map(wine => ({
                        ...wine.toObject(),
                        type: "wine"
                    }));

                }
                const attempted = lesson.questions.filter(q =>
                    req.user.attemptedQuestions.some(aq =>
                        aq.lesson_uuid && aq.lesson_uuid.uuid === lesson.uuid && aq.questionId === q.uuid
                    )
                );

                const QnALength = lesson?.questions?.length === userAnswers?.length;



                return {
                    ...lesson,
                    attemptedQuestions: attempted,
                    menu: menuItems,
                    status: userProgress?.status === "completed" && QnALength ? "Completed" : "Start"
                };
            }));

            return res.status(200).json(lessonsWithStatus);
        }


        const isAssigned = req.user.assigned_restaurants.some(r => r.uuid == restaurant_uuid);
        const isOwner = restaurant.account_owner === req.user.uuid;
        const isSuperAdmin = req.user.role === "super_admin";
        if (!(isAssigned || isOwner || isSuperAdmin)) {
            return res.status(403).json({ message: "Not authorized for this restaurant" });
        }

        // Get lessons for specific restaurant
        const lessons = await Lesson.find({
            isDeleted: false,
            restaurant_uuid: restaurant_uuid,
            "questions.isDeleted": false,
        }).populate({
            path: "menu_items",
            match: { uuid: { $exists: true } }, // Ensures only valid references are populated
            localField: "menu_items",
            foreignField: "uuid",
        });

        const lessonsWithFilteredQuestions = lessons.map(lesson => {
            const lessonObj = lesson.toObject();
            lessonObj.questions = lessonObj.questions.filter(q => q.isDeleted === false);
            return lessonObj;
        });

        let menuItems;



        lessonsWithStatus = await Promise.all(lessonsWithFilteredQuestions.map(async (lesson) => {
            const userId = req.user.uuid;

            const userAnswers = req?.user?.attemptedQuestions?.filter((q) => q?.lesson_uuid?.uuid === lesson?.uuid);

            const userProgress = lesson?.progress?.find(pr => pr.employeeId === userId);

            if (lesson.menu_items_model === "Dish") {
                const dishes = await Dish.find({ isDeleted: false, restaurant_uuid: restaurant_uuid });
                menuItems = dishes.map(dish => ({
                    ...dish.toObject(),
                    type: dish.type
                }));
            } else if (lesson.menu_items_model === "GlobalWine") {
                const wines = await GlobalWine.find({ isDeleted: false, restaurant_uuid: restaurant_uuid });
                menuItems = wines.map(wine => ({
                    ...wine.toObject(),
                    type: "wine"
                }));

            }
            const attempted = lesson?.questions?.filter(q =>
                req.user.attemptedQuestions.some(aq =>
                    aq.lesson_uuid && aq?.lesson_uuid?.uuid === lesson?.uuid && aq?.questionId === q?.uuid
                )
            );


            const QnALength = lesson?.questions?.length === userAnswers?.length;

            return {
                ...lesson,
                attemptedQuestions: attempted,
                menu: menuItems,
                status: userProgress?.status === "completed" && QnALength ? "Completed" : "Start"
            };
        }));


        res.status(200).json(lessonsWithStatus);
    } catch (error) {
        console.log(error, "error");
        res.status(500).json({ message: "Server error", error: error.message });
    }
};


export const createLessonProgress = async (req, res) => {
    try {
        const { lesson_uuid } = req.params;
        const userId = req.user.uuid;

        // Find the lesson
        const lesson = await Lesson.findOne({ isDeleted: false, uuid: lesson_uuid });
        if (!lesson) {
            return res.status(404).json({ message: "Lesson not found" });
        }

        // Find the user
        const user = await User.findOne({ uuid: userId });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Check if the user is already enrolled in this lesson
        const restaurantProgress = user.lesson_progress.find(
            rp => rp.restaurant_uuid === lesson.restaurant_uuid
        );

        if (!restaurantProgress) {
            return res.status(400).json({ message: "No progress found for this restaurant" });
        }

        // Check if the lesson is already in progress
        const existingLessonProgress = restaurantProgress.lessons.find(
            lp => lp.lesson_id === lesson_uuid
        );

        if (existingLessonProgress) {
            return res.status(400).json({ message: "Lesson already in progress" });
        }

        // Create new lesson progress entry
        const now = new Date();
        const newLessonProgress = {
            lesson_id: lesson_uuid,
            status: "not_started",
            attempts: 0,
            score: 0,
            startTime: now,
            lastAccessed: now,
            attempts: []
        };

        restaurantProgress.lessons.push(newLessonProgress);

        // Save the user with updated lesson progress
        await user.save();

        // Log the creation of lesson progress
        await Log.create({
            uuid: uuidv4(),
            user_uuid: userId,
            action: "create_lesson_progress",
            details: { lesson_uuid, restaurant_uuid: lesson.restaurant_uuid },
            role: req.user.role,
            restaurant_uuid: lesson.restaurant_uuid,
            timestamp: now
        });

        res.status(201).json({
            message: "Lesson progress created successfully",
            progress: newLessonProgress
        });
    } catch (error) {
        console.error("Error creating lesson progress:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
}

// Update lesson progress
export const updateLessonProgress = async (req, res) => {
    try {
        const { lesson_uuid } = req.params;
        const { score, timeSpent, answers } = req.body;
        const userId = req.user.uuid;

        console.log(answers, "answers in updateLessonProgress");
        console.log(answers?.length, "answers length in updateLessonProgress");

        // Find the lesson
        const lesson = await Lesson.findOne({ isDeleted: false, uuid: lesson_uuid, });
        if (!lesson) {
            return res.status(404).json({ message: "Lesson not found" });
        }

        lesson.questions = lesson.questions.filter((q) => q.isDeleted === false);

        // Find the user
        const user = await User.findOne({ uuid: userId });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }
        const role = req.user.role;

        // Find or create restaurantProgress for this restaurant
        let restaurantProgress = user.lesson_progress.find(
            rp => rp.restaurant_uuid === lesson.restaurant_uuid
        );
        if (!restaurantProgress) {
            restaurantProgress = {
                restaurant_uuid: lesson.restaurant_uuid,
                lessons: [],
                next_lesson_due: null
            };
            user.lesson_progress.push(restaurantProgress);
        }

        // Find or create lessonProgress for this lesson
        let lessonProgress = restaurantProgress.lessons.find(
            lp => lp.lesson_id === lesson_uuid
        );
        if (!lessonProgress) {
            lessonProgress = {
                lesson_id: lesson_uuid,
                status: "not_started",
                attempts: [],
                score: 0,
                startTime: new Date(),
                lastAccessed: new Date()
            };
            restaurantProgress.lessons.push(lessonProgress);
        }

        // Update lessonProgress
        const now = new Date();
        const attempt = {
            timestamp: now,
            score,
            timeSpent,
            answers
        };
        lessonProgress.attempts.push(attempt);
        lessonProgress.lastAccessed = now;
        lessonProgress.score = score;
        const allQuestions = lesson.questions;

        // Check if lesson is completed (score >= 70%)

        const allAnswers = attempt?.answers?.filter((ans) => ans?.answer?.length !== 0);
        const equalQnA = allQuestions.length === allAnswers?.length;
        const isCompleted = score >= 70;
        const wasNotCompleted = lessonProgress.status !== 'completed';

        if (isCompleted && wasNotCompleted && equalQnA) {
            lessonProgress.status = 'completed';
            lessonProgress.completedAt = now;
        } else if (!isCompleted) {
            lessonProgress.status = 'in_progress';
        }

        // Mark the array as modified so Mongoose saves the changes
        user.markModified('lesson_progress');
        await user.save();

        // Update lesson progress
        const lessonProgressIndex = lesson.progress.findIndex(p => p.employeeId === userId);
        if (lessonProgressIndex === -1) {
            lesson.progress.push({
                employeeId: userId,
                status: isCompleted ? 'completed' : 'in_progress',
                score,
                startTime: lessonProgress.startTime || now,
                completionTime: isCompleted ? now : null,
                timeSpent,
                attempts: [{
                    timestamp: now,
                    score,
                    timeSpent,
                    answers
                }],
                lastAccessed: now,
                completedAt: isCompleted ? now : null
            });
        } else {
            lesson.progress[lessonProgressIndex].status = isCompleted ? 'completed' : 'in_progress';
            lesson.progress[lessonProgressIndex].score = score;
            lesson.progress[lessonProgressIndex].completionTime = isCompleted ? now : null;
            lesson.progress[lessonProgressIndex].timeSpent = timeSpent;
            lesson.progress[lessonProgressIndex].attempts.push({
                timestamp: now,
                score,
                timeSpent,
                answers
            });
            lesson.progress[lessonProgressIndex].lastAccessed = now;
            lesson.progress[lessonProgressIndex].completedAt = isCompleted ? now : null;
        }

        await lesson.save();

        if (isCompleted && wasNotCompleted && equalQnA) {
            lessonProgress.status = 'completed';
            lessonProgress.completedAt = now;

            // Check for badge awards
            await checkChapterCompletion(userId, lesson.category, lesson.unit, lesson.unit_name, lesson.chapter, lesson.chapter_name, attempt.score, lesson.restaurant_uuid, lesson.menu_items);
            await checkUnitCompletion(userId, lesson.category, lesson.unit, lesson.unit_name, attempt.score, lesson.restaurant_uuid, lesson.menu_items);

        }

        // Log the progress update
        await Log.create({
            uuid: uuidv4(),
            user_uuid: userId,
            action: "update_lesson_progress",
            details: {
                lesson_uuid,
                score,
                timeSpent,
                isCompleted
            },
            role: user.role,
            restaurant_uuid: lesson.restaurant_uuid,
            timestamp: now
        });
        const userProgress = lesson.progress.find(pr => pr.employeeId === userId);

        const accuracyInPercentage =
            (userProgress.attempts.filter((attempt) => attempt.score >= 70).length /
                userProgress.attempts.length) *
            100;


        const attempts = userProgress ? userProgress.attempts.length : 0;



        // Helper function for deep equality (handles arrays, objects, primitives)
        function deepEqual(a, b) {
            if (a === b) return true;
            if (Array.isArray(a) && Array.isArray(b)) {
                if (a.length !== b.length) return false;
                // Compare arrays regardless of order
                const sortedA = [...a].sort();
                const sortedB = [...b].sort();
                return sortedA.every((val, idx) => deepEqual(val, sortedB[idx]));
            }
            if (typeof a === 'object' && typeof b === 'object' && a && b) {
                const aKeys = Object.keys(a).sort();
                const bKeys = Object.keys(b).sort();
                if (aKeys.length !== bKeys.length) return false;
                return aKeys.every((key, idx) =>
                    key === bKeys[idx] && deepEqual(a[key], b[bKeys[idx]])
                );
            }
            return false;
        }

        // For incorrectAnswers calculation, only consider non-empty answers
        const incorrectAnswers = allQuestions.map((question, index) => {
            const userAnswer = Array.isArray(answers)
                ? answers.find(a => a.questionId === question.uuid && Array.isArray(a.answer) && a.answer.length > 0)
                : undefined;

            const correctAnswer = question.correct_answer_variable;



            if (!userAnswer && !deepEqual(userAnswer?.answer, correctAnswer)) {
                return {
                    question: question.question_text,
                    userAnswer: userAnswer?.answer,
                    correctAnswer
                };
            }

            return null;
        }).filter(Boolean);


        const unit = await Lesson.find({
            isDeleted: false,
            unit: lesson.unit,
            unit_name: lesson.unit_name,
            category: lesson.category,
            "questions.isDeleted": false
        });

        const completedChapters = unit.reduce((acc, lesson) => {
            const userProgress = lesson.progress.find(pr => pr.employeeId === userId);
            if (userProgress?.status === "completed") {
                acc.push({
                    ...lesson.toObject(),
                    status: userProgress.status
                });
            }
            return acc;
        }, []);


        console.log(isCompleted, equalQnA, "isCompleted and equalQnA");


        // Save attempted questions to user.attemptedQuestions
        if ((isCompleted && equalQnA) || !equalQnA) {
            attempt.answers
                .filter(userAnswer => Array.isArray(userAnswer.answer) && userAnswer.answer.length > 0)
                .forEach((userAnswer, idx) => {
                    const question = lesson.questions.find(q => q.uuid === userAnswer.questionId);
                    if (!question) return;
                    const questionId = question.uuid;
                    // Determine correctness
                    const isCorrect = deepEqual(userAnswer.answer, question.correct_answer_variable);
                    // Check if already exists
                    const existingAttempt = user.attemptedQuestions.find(aq => aq.questionId === questionId);
                    if (existingAttempt) {
                        existingAttempt.isCorrect = isCorrect;
                        existingAttempt.attemptedAt = now;
                    } else {
                        user.attemptedQuestions.push({
                            lesson_uuid: lesson.uuid,
                            questionId,
                            answer: userAnswer.answer,
                            isCorrect,
                            attemptedAt: now
                        });
                    }
                });
            user.markModified('attemptedQuestions');
            const userobj = await user.save();
        }

        res.status(200).json({
            message: "Lesson progress updated successfully",
            progress: lessonProgress,
            accuracy: accuracyInPercentage,
            attempts,
            incorrectAnswers: incorrectAnswers,
            allQuestions: allQuestions.length,
            completedChapters: completedChapters.length,
            allChapters: unit.length
        });




    } catch (error) {
        console.error("Error updating lesson progress:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Get restauarnt lessons progress
export const getRestaurantLessonProgress = async (req, res) => {
    try {
        const { restaurant_uuid } = req.params;

        const totalEmployees = await User.find({ assigned_restaurants: restaurant_uuid, role: "employee", active: true });
        const totalLessons = await Lesson.find({ restaurant_uuid: restaurant_uuid }).populate({
            path: "assignedEmployees",
            model: "User",
            match: { uuid: { $exists: true } },
            localField: "assignedEmployees",
            foreignField: "uuid",
            select: "first_name last_name uuid email active role",
        }).populate({
            path: "progress.employeeId",
            model: "User",
            match: { uuid: { $exists: true } },
            localField: "progress.employeeId",
            foreignField: "uuid",
            select: "uuid role",
        });

        const completedLessons = totalLessons.filter((lesson) => lesson.progress.some((progress) => progress?.employeeId?.role !== "super_admin" && progress.status === "completed")).length;

        const avgCompletionRatePerLesson =
            (completedLessons / totalLessons.length) * 100 || 0;

        const lessonsEngagementRateLastThirtyDays =
            (completedLessons / totalEmployees.length) * 100 || 0;

        const overDueEmployeesInLessons = [];
        const seenEmployeeUuids = new Set(
            overDueEmployeesInLessons.map((employee) => employee.uuid)
        );

        totalLessons.forEach(lesson => {
            const dueDate = lesson.DueDate;
            const now = new Date();
            const isOverdue = dueDate && now > dueDate;


            if (isOverdue) {
                lesson.assignedEmployees.forEach(employee => {
                    if (employee.active && employee.role !== "super_admin" && !seenEmployeeUuids.has(employee.uuid)) {
                        overDueEmployeesInLessons.push(employee);
                        seenEmployeeUuids.add(employee.uuid);
                    }
                });
            }
        });

        const topLessonLearners = [];
        const seenEmployeeUuids2 = new Set(topLessonLearners);
        totalLessons.forEach(lesson => {
            const topLearners = lesson.progress.filter((pr) => pr.score > 85);
            topLearners.forEach(learner => {
                if (learner.active && employee.role !== "super_admin" && !seenEmployeeUuids2.has(employee.uuid)) {
                    topLessonLearners.push(learner.employeeId);
                    seenEmployeeUuids2.add(employee.uuid);
                }
            });
        });

        res.status(200).json({
            avgCompletionRatePerLesson,
            lessonsEngagementRateLastThirtyDays,
            overDueEmployeesInLessons: overDueEmployeesInLessons,
            topLessonLearners: topLessonLearners,
            totalEmployees: totalEmployees.length,
            totalLessons: totalLessons.length,
            completedLessons
        });

    } catch (error) {
        console.log(error, "error");
        return res.status(500).json({ message: "Error getting restaurant lesson progress", error: error.message });
    }
};

export const assignLessonToEmployee = async (req, res) => {
    try {
        const { lessonId, employeeId } = req.body;

        // Find the lesson
        const lesson = await Lesson.findOne({ isDeleted: false, uuid: lessonId });
        if (!lesson) {
            return res.status(404).json({ message: "Lesson not found" });
        }

        // Find the employee
        const employee = await User.findOne({ uuid: employeeId });
        if (!employee) {
            return res.status(404).json({ message: "Employee not found" });
        }

        // Check if employee is already assigned to this lesson
        if (lesson.assignedEmployees.includes(employeeId)) {
            return res.status(400).json({ message: "Lesson already assigned to this employee" });
        }

        // Add employee to lesson's assigned employees
        lesson.assignedEmployees.push(employeeId);

        // Add lesson to employee's assigned lessons if not already there
        if (!employee.assignedLessons.includes(lessonId)) {
            employee.assignedLessons.push(lessonId);
        }

        // Initialize lesson progress for this employee
        let restaurantProgress = employee.lesson_progress.find(
            rp => rp.restaurant_uuid === lesson.restaurant_uuid
        );

        if (!restaurantProgress) {
            restaurantProgress = {
                restaurant_uuid: lesson.restaurant_uuid,
                lessons: [],
                next_lesson_due: null
            };
            employee.lesson_progress.push(restaurantProgress);
        }

        // Add initial lesson progress
        restaurantProgress.lessons.push({
            lesson_id: lessonId,
            status: "not_started",
            attempts: 0,
            score: 0
        });

        // Save both the lesson and employee
        await Promise.all([
            lesson.save(),
            employee.save()
        ]);

        // Log the assignment
        await Log.create({
            uuid: uuidv4(),
            user_uuid: req.user.uuid,
            action: "assign_lesson",
            details: {
                lesson_uuid: lessonId,
                employee_uuid: employeeId,
                restaurant_uuid: lesson.restaurant_uuid
            },
            role: req.user.role,
            restaurant_uuid: lesson.restaurant_uuid,
            timestamp: new Date()
        });

        return res.status(200).json({ message: "Lesson assigned successfully" });
    } catch (error) {
        console.error("Error assigning lesson:", error);
        return res.status(500).json({ message: "Error assigning lesson", error: error.message });
    }
};

export const getLessonProgressForManager = async (req, res) => {
    try {
        if (req.user.role !== "manager") {
            return res.status(403).json({ message: "Unauthorized" });
        }

        const progress = await LessonProgress.find({ managerId: req.user._id });
        return res.status(200).json({ progress });
    } catch (error) {
        return res.status(500).json({ message: "Error fetching progress", error });
    }
};
export const getUserProgress = async (req, res) => {

    try {
        const userId = req.user.uuid;
        const restaurant_uuids = req.user.assigned_restaurants.map((r) => r.uuid);

        // Find the user
        const user = await User.findOne({ uuid: userId });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const allLessons = await Lesson.find({
            isDeleted: false,
            $or: [
                { assignedEmployees: userId },
                { restaurant_uuid: { $in: restaurant_uuids } }
            ],
            questions: { $type: "array" },
            "questions": { $elemMatch: { isDeleted: false } }
        });

        const user_lesson_progress = allLessons.map(lesson =>
            lesson.progress.find(p => p.employeeId === userId && p.status !== "not_started")
        ).filter(Boolean);


        const overAllProgressInPercentage =
            (user_lesson_progress.length / allLessons.length) * 100 || 0;



        const completedLessons =
            allLessons.reduce((acc, lesson) => {
                const lessonProgress = lesson.progress.find((p) => p.employeeId === userId);

                if (lessonProgress && lessonProgress?.status === "completed") {
                    acc.push({
                        ...lesson.toObject(),
                        progress: lessonProgress
                    });
                }
                return acc;
            }, []) || [];

        const scoredLessons = allLessons.filter(lesson => {
            const progress = lesson.progress.find(p => p.employeeId === userId);
            return progress?.score != undefined;
        });

        const averageScoreInPercentage =
            scoredLessons.length > 0
                ? scoredLessons.reduce((acc, lesson) => {
                    const score = lesson.progress.find(p => p.employeeId === userId)?.score ?? 0;
                    return acc + score;
                }, 0) / scoredLessons.length
                : 0;


        const lessonsWithAttempts = allLessons.filter(lesson =>
            lesson.progress.find(p => p.employeeId === userId)?.attempts?.length
        );

        const averageAttempts =
            lessonsWithAttempts.length > 0
                ? lessonsWithAttempts.reduce((acc, lesson) => {
                    const attempts = lesson.progress.find(p => p.employeeId === userId)?.attempts?.length || 0;
                    return acc + attempts;
                }, 0) / lessonsWithAttempts.length
                : 0;

        const today = new Date();

        const dueLessons = allLessons.filter(lesson => {
            const dueDateInFuture = new Date(lesson.DueDate) > today;

            if (!dueDateInFuture) return false;

            // If no progress at all, the lesson is due
            if (lesson.progress.length === 0 && dueDateInFuture) return true;

            // If progress exists, check if it's not completed for this user
            const progress = lesson.progress.find(p =>
                p.employeeId === userId && p.status !== 'completed'
            );

            const inDays =
                Math.ceil((new Date(lesson.DueDate) - today) / (1000 * 60 * 60 * 24));


            return !!progress; // only return the lesson if this condition is true
        });

        const foodLessons = allLessons.filter((lesson) => lesson.category == "food");
        const wineLessons = allLessons.filter((lesson) => lesson.category == "wine");


        const foodCompletedLessons =
            foodLessons.reduce((acc, lesson) => {
                const lessonProgress = lesson.progress.find((p) => p.employeeId === userId);

                if (lessonProgress && lessonProgress?.status === "completed") {
                    acc.push({
                        ...lesson.toObject(),
                        progress: lessonProgress
                    });
                }
                return acc;
            }, []) || [];

        const foodScoredLessons = foodLessons.filter(lesson => {
            const progress = lesson.progress.find(p => p.employeeId === userId);
            return progress?.score != undefined;
        });
        const foodAverageScoreInPercentage =
            foodScoredLessons.length > 0
                ? foodScoredLessons.reduce((acc, lesson) => {
                    const score = lesson.progress.find(p => p.employeeId === userId)?.score ?? 0;
                    return acc + score;
                }, 0) / foodScoredLessons.length
                : 0;

        const foodLessonsWithAttempts = foodLessons.filter(lesson =>
            lesson.progress.find(p => p.employeeId === userId)?.attempts?.length
        );

        const foodAverageAttempts =
            foodLessonsWithAttempts.length > 0
                ? foodLessonsWithAttempts.reduce((acc, lesson) => {
                    const attempts = lesson.progress.find(p => p.employeeId === userId)?.attempts?.length || 0;
                    return acc + attempts;
                }, 0) / foodLessonsWithAttempts.length
                : 0;


        const foodDueLessons = foodLessons.filter(lesson => {
            const dueDateInFuture = new Date(lesson.DueDate) > today;

            if (!dueDateInFuture) return false;

            // If no progress at all, the lesson is due
            if (lesson.progress.length === 0 && dueDateInFuture) return true;

            // If progress exists, check if it's not completed for this user
            const progress = lesson.progress.find(p =>
                p.employeeId === userId && p.status !== 'completed'
            );

            const inDays =
                Math.ceil((new Date(lesson.DueDate) - today) / (1000 * 60 * 60 * 24));

            return !!progress; // only return the lesson if this condition is true
        });


        const wineCompletedLessons =
            wineLessons.reduce((acc, lesson) => {
                const lessonProgress = lesson.progress.find((p) => p.employeeId === userId);

                if (lessonProgress && lessonProgress?.status === "completed") {
                    acc.push({
                        ...lesson.toObject(),
                        progress: lessonProgress
                    });
                }
                return acc;
            }, []) || [];

        const wineScoredLessons = wineLessons.filter(lesson => {
            const progress = lesson.progress.find(p => p.employeeId === userId);
            return progress?.score != undefined;
        });

        const wineAverageScoreInPercentage =
            wineScoredLessons.length > 0
                ? wineScoredLessons.reduce((acc, lesson) => {
                    const score = lesson.progress.find(p => p.employeeId === userId)?.score ?? 0;
                    return acc + score;
                }, 0) / wineScoredLessons.length
                : 0;


        const wineLessonsWithAttempts = wineLessons.filter(lesson =>
            lesson.progress.find(p => p.employeeId === userId)?.attempts?.length
        );


        const wineAverageAttempts =
            wineLessonsWithAttempts.length > 0
                ? wineLessonsWithAttempts.reduce((acc, lesson) => {
                    const attempts = lesson.progress.find(p => p.employeeId === userId)?.attempts?.length || 0;
                    return acc + attempts;
                }, 0) / wineLessonsWithAttempts.length
                : 0;


        const wineDueLessons = wineLessons.filter(lesson => {
            const dueDateInFuture = new Date(lesson.DueDate) > today;

            if (!dueDateInFuture) return false;

            // If no progress at all, the lesson is due
            if (lesson.progress.length === 0 && dueDateInFuture) return true;

            // If progress exists, check if it's not completed for this user
            const progress = lesson.progress.find(p =>
                p.employeeId === userId && p.status !== 'completed'
            );

            const inDays =
                Math.ceil((new Date(lesson.DueDate) - today) / (1000 * 60 * 60 * 24));


            return !!progress; // only return the lesson if this condition is true
        });




        return res.status(200).json({
            allLessonsObject: allLessons,
            allLessons: allLessons.length,
            overAllProgress: parseFloat(overAllProgressInPercentage.toFixed(2)),
            completedLessons: completedLessons.length,
            averageScore: parseFloat(averageScoreInPercentage.toFixed(2)),
            averageAttempts: parseFloat(averageAttempts.toFixed(2)),
            dueLessons,
            food: {
                foodCompletedLessonsObjects: foodCompletedLessons,
                foodCompletedLessons: foodCompletedLessons.length,
                foodAverageScoreInPercentage: parseFloat(foodAverageScoreInPercentage.toFixed(2)),
                foodAverageAttempts: parseFloat(foodAverageAttempts.toFixed(2)),
                foodDueLessons
            },

            wine: {
                wineCompletedLessonsObjects: wineCompletedLessons, // This line is not necessary, just for clarity in the response
                wineCompletedLessons: wineCompletedLessons.length,
                wineAverageScoreInPercentage: parseFloat(wineAverageScoreInPercentage.toFixed(2)),
                wineAverageAttempts: parseFloat(wineAverageAttempts.toFixed(2)),
                wineDueLessons
            },
            completedLessonsByUser: completedLessons
        });
    } catch (error) {
        console.error("Error fetching user progress:", error);
        return res.status(500).json({ message: "Error fetching user progress", error: error.message });
    }
};

export const deleteLesson = async (req, res) => {
    try {
        if (!isAdminOrManager(req)) {
            return res.status(403).json({ message: "Unauthorized" });
        }

        const lesson = await Lesson.findOneAndDelete({ isDeleted: false, uuid: req.params.uuid });
        if (!lesson) {
            return res.status(404).json({ message: "Lesson not found" });
        }

        // await Log.create({ uuid: lesson.uuid, action: "delete_lesson", details: { uuid: lesson.uuid }, timestamp: new Date() });
        await Log.create({
            uuid: uuidv4(),
            action: "delete_lesson",
            details: { uuid: req.params.uuid },
            timestamp: new Date(),
            role: req.user?.role,  // Ensure this is available
            user_uuid: req.user?.uuid // Ensure this is available
        });
        return res.status(200).json({ message: "Lesson deleted successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

export const getLessonProgress = async (req, res) => {
    try {
        const { lessonUuid } = req.params;
        const lesson = await Lesson.findOne({ isDeleted: false, uuid: lessonUuid });
        if (!lesson) {
            return res.status(404).json({ message: "Lesson not found" });
        }

        return res.status(200).json({ progress: lesson.progress });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

export const getAllLessonProgress = async (req, res) => {

    try {
        const { user } = req;
        if (user?.role !== "super_admin" && user?.role !== "director" && user?.role !== "manager") {
            return res.status(403).json({ message: "Unauthorized to view all lesson progress" });
        }
        let getAllUsers;
        let lessons;

        const assigned_restaurants = user?.assigned_restaurants.map((r) => r.uuid);

        if (isSuperAdmin(req)) {
            getAllUsers = await User.find({ role: { $nin: ["super_admin"] } }).select("uuid first_name last_name email role assigned_restaurants active").populate({
                path: 'assigned_restaurants',
                model: "Restaurant",
                match: { uuid: { $exists: true } },
                localField: "assigned_restaurants",
                foreignField: "uuid",
                select: 'name uuid'
            });

            lessons = await Lesson.find({ isDeleted: false }).populate({
                path: 'assignedEmployees',
                model: "User",
                match: { uuid: { $exists: true } }, // Ensures only valid references are populated
                localField: "assignedEmployees",
                foreignField: "uuid", // Match on uuid instead of _id
                select: 'first_name last_name email uuid active'
            });
        } else if (user?.role === "director") {

            getAllUsers = await User.find({ role: { $nin: ["super_admin"] }, assigned_restaurants: { $in: assigned_restaurants } }).select("uuid first_name last_name email role assigned_restaurants active").populate({
                path: 'assigned_restaurants',
                model: "Restaurant",
                match: { uuid: { $exists: true } },
                localField: "assigned_restaurants",
                foreignField: "uuid",
                select: 'name uuid'
            });

            lessons = await Lesson.find({ isDeleted: false, restaurant_uuid: { $in: assigned_restaurants } }).populate({
                path: 'assignedEmployees',
                model: "User",
                match: { uuid: { $exists: true } }, // Ensures only valid references are populated
                localField: "assignedEmployees",
                foreignField: "uuid", // Match on uuid instead of _id
                select: 'first_name last_name email uuid active'
            });

        } else if (user?.role === "manager") {
            getAllUsers = await User.find({ role: { $nin: ["super_admin", "director", "manager"] }, assigned_restaurants: { $in: assigned_restaurants } }).select("uuid first_name last_name email role assigned_restaurants active").populate({
                path: 'assigned_restaurants',
                model: "Restaurant",
                match: { uuid: { $exists: true } },
                localField: "assigned_restaurants",
                foreignField: "uuid",
                select: 'name uuid'
            });

            lessons = await Lesson.find({ isDeleted: false, restaurant_uuid: { $in: assigned_restaurants } }).populate({
                path: 'assignedEmployees',
                model: "User",
                match: { uuid: { $exists: true } }, // Ensures only valid references are populated
                localField: "assignedEmployees",
                foreignField: "uuid", // Match on uuid instead of _id
                select: 'first_name last_name email uuid active'
            });
        }

        const activeEmployeesInLessons = new Set();
        const inActiveEmployeesInLessons = new Set();
        const overDueEmployeesInLessons = new Set();
        // Collect active and inactive employees in lessons
        getAllUsers.forEach(user => {
            const userId = user.uuid;
            if (user.active) {

                const activeEmployeeInLesson = lessons.some(lesson =>
                    lesson.assignedEmployees.some(employee => employee.uuid === userId)
                );
                if (activeEmployeeInLesson) {
                    activeEmployeesInLessons.add(userId);
                } else {
                    inActiveEmployeesInLessons.add(userId);
                }
            }
        });

        // Collect overdue employees in lessons
        lessons.forEach(lesson => {
            const dueDate = lesson.DueDate;
            if (dueDate) {
                const now = new Date();
                const isOverdue = now > dueDate;
                if (isOverdue) {
                    lesson.assignedEmployees.forEach(employee => {
                        if (employee.active) {
                            overDueEmployeesInLessons.add(employee.uuid);
                        }
                    });
                }
            }
        });

        const foodLessons = lessons.filter(lesson => (
            lesson.category === "food" &&
            lesson.assignedEmployees.some(employee => employee.active) // Filter lessons with active employees            
        ));

        const wineLessons = lessons.filter(lesson => (
            lesson.category === "wine" &&
            lesson.assignedEmployees.some(employee => employee.active) // Filter lessons with active employees
        ));

        const foodCompletionPercentage = foodLessons.length > 0 ? foodLessons.reduce((acc, lesson) => {
            const completedCount = lesson.progress.filter(p => p.status === 'completed').length;
            const totalCount = lesson.progress.length;
            return acc + (totalCount > 0 ? (completedCount / totalCount) * 100 : 0);
        }, 0) / foodLessons.length : foodLessons.length;


        const foodUnitsCompletionPercentage = {};
        const wineUnitsCompletionPercentage = {};

        // Step 1: Collect data per unit and chapter

        foodLessons.forEach(lesson => {
            const unitKey = `${lesson.unit} - ${lesson.unit_name}`;
            const chapterKey = lesson.chapter;

            if (!foodUnitsCompletionPercentage[unitKey]) {
                foodUnitsCompletionPercentage[unitKey] = {
                    chapterStats: {}
                };
            }

            if (!foodUnitsCompletionPercentage[unitKey].chapterStats[chapterKey]) {
                foodUnitsCompletionPercentage[unitKey].chapterStats[chapterKey] = {
                    completed: 0,
                    total: 0,
                };
            }

            const completedCount = lesson.progress.filter(p => p.status === 'completed').length;
            const totalCount = lesson.progress.length;

            foodUnitsCompletionPercentage[unitKey].chapterStats[chapterKey].completed += completedCount;
            foodUnitsCompletionPercentage[unitKey].chapterStats[chapterKey].total += totalCount;
        });

        // Final structure with completed and total chapters
        for (const unitKey in foodUnitsCompletionPercentage) {
            const chapterStats = foodUnitsCompletionPercentage[unitKey].chapterStats;
            let completedChapters = 0;
            let totalChapters = 0;

            for (const chapter in chapterStats) {
                const { completed, total } = chapterStats[chapter];
                if (total > 0 && completed === total) {
                    completedChapters++;
                }
                totalChapters++;
            }

            foodUnitsCompletionPercentage[unitKey] = {
                completedChapters,
                totalChapters
            };
        }

        const wineCompletionPercentage = wineLessons.length > 0 ? wineLessons?.reduce((acc, lesson) => {
            const completedCount = lesson?.progress?.filter(p => p.status === 'completed')?.length;
            const totalCount = lesson?.progress?.length;
            return acc + (totalCount > 0 ? (completedCount / totalCount) * 100 : 0);
        }, 0) / wineLessons.length : wineLessons.length;

        wineLessons.forEach(lesson => {
            const unitKey = `${lesson.unit} - ${lesson.unit_name}`;
            const chapterKey = lesson.chapter;

            if (!wineUnitsCompletionPercentage[unitKey]) {
                wineUnitsCompletionPercentage[unitKey] = {
                    chapterStats: {}
                };
            }

            if (!wineUnitsCompletionPercentage[unitKey].chapterStats[chapterKey]) {
                wineUnitsCompletionPercentage[unitKey].chapterStats[chapterKey] = {
                    completed: 0,
                    total: 0,
                };
            }

            const completedCount = lesson.progress.filter(p => p.status === 'completed').length;
            const totalCount = lesson.progress.length;

            wineUnitsCompletionPercentage[unitKey].chapterStats[chapterKey].completed += completedCount;
            wineUnitsCompletionPercentage[unitKey].chapterStats[chapterKey].total += totalCount;
        });

        // Final structure with completed and total chapters
        for (const unitKey in wineUnitsCompletionPercentage) {
            const chapterStats = wineUnitsCompletionPercentage[unitKey].chapterStats;
            let completedChapters = 0;
            let totalChapters = 0;

            for (const chapter in chapterStats) {
                const { completed, total } = chapterStats[chapter];
                if (total > 0 && completed === total) {
                    completedChapters++;
                }
                totalChapters++;
            }

            wineUnitsCompletionPercentage[unitKey] = {
                completedChapters,
                totalChapters
            };
        }

        let recentActivities;

        const tenDaysAgo = new Date();
        tenDaysAgo.setDate(tenDaysAgo.getDate() - 10);

        if (user?.role === "super_admin") {
            recentActivities = await Log.find({
                action: { $in: ["update_lesson_progress"] },
                timestamp: { $gte: tenDaysAgo }
            }).sort({ timestamp: -1 }).populate({
                path: 'user_uuid',
                model: "User",
                match: { uuid: { $exists: true } },
                localField: "user_uuid",
                foreignField: "uuid",
                select: 'first_name last_name'
            }).populate({
                path: 'details.lesson_uuid',
                model: "Lesson",
                match: { uuid: { $exists: true } },
                localField: "details.lesson_uuid",
                foreignField: "uuid",
            });
        } else if (user?.role === "director") {

            recentActivities = await Log.find({
                action: { $in: ["update_lesson_progress"] },
                role: { $nin: ["super_admin"] },
                restaurant_uuid: { $in: assigned_restaurants },
                timestamp: { $gte: tenDaysAgo }
            }).sort({ timestamp: -1 }).populate({
                path: 'user_uuid',
                model: "User",
                match: { uuid: { $exists: true } },
                localField: "user_uuid",
                foreignField: "uuid",
                select: 'first_name last_name'
            }).populate({
                path: 'details.lesson_uuid',
                model: "Lesson",
                match: { uuid: { $exists: true } },
                localField: "details.lesson_uuid",
                foreignField: "uuid",
            });
        } else if (user?.role === "manager") {
            recentActivities = await Log.find({
                action: { $in: ["update_lesson_progress"] },
                role: { $nin: ["super_admin", "director, employees"] },
                restaurant_uuid: { $in: assigned_restaurants },
                timestamp: { $gte: tenDaysAgo }
            }).sort({ timestamp: -1 }).populate({
                path: 'user_uuid',
                model: "User",
                match: { uuid: { $exists: true } },
                localField: "user_uuid",
                foreignField: "uuid",
                select: 'first_name last_name'
            }).populate({
                path: 'details.lesson_uuid',
                model: "Lesson",
                match: { uuid: { $exists: true } },
                localField: "details.lesson_uuid",
                foreignField: "uuid",
            });
        }

        res.status(200).json({
            activeEmployees: activeEmployeesInLessons.size,
            inActiveEmployees: inActiveEmployeesInLessons.size,
            overDueEmployees: overDueEmployeesInLessons.size,
            foodKnowledge: foodCompletionPercentage,
            foodUnits: foodUnitsCompletionPercentage,
            wineKnowledge: wineCompletionPercentage,
            wineUnits: wineUnitsCompletionPercentage,
            recentActivities,
        });
    } catch (error) {
        console.log("Error fetching all lesson progress:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

export const lessonUserDetails = async (req, res) => {
    try {
        const { user } = req;

        let getAllUsers;
        let lessons;
        const assigned_restaurants = user?.assigned_restaurants.map((r) => r.uuid);

        if (user?.role === "super_admin") {
            getAllUsers = await User.find({}).select("uuid first_name last_name email role assigned_restaurants active").populate({
                path: 'assigned_restaurants',
                model: "Restaurant",
                match: { uuid: { $exists: true } },
                localField: "assigned_restaurants",
                foreignField: "uuid",
                select: 'name uuid'
            });
            lessons = await Lesson.find({ isDeleted: false }).populate({
                path: 'assignedEmployees',
                model: "User",
                match: { uuid: { $exists: true } }, // Ensures only valid references are populated
                localField: "assignedEmployees",
                foreignField: "uuid", // Match on uuid instead of _id
            }).sort({ createdAt: -1 }).lean();
        } else if (user?.role === "director") {
            getAllUsers = await User.find({ role: ["employee", "manager"], assigned_restaurants: { $in: assigned_restaurants } }).select("uuid first_name last_name email role assigned_restaurants active").populate({
                path: 'assigned_restaurants',
                model: "Restaurant",
                match: { uuid: { $exists: true } },
                localField: "assigned_restaurants",
                foreignField: "uuid",
                select: 'name uuid'
            });
            lessons = await Lesson.find({ isDeleted: false, restaurant_uuid: { $in: assigned_restaurants } }).populate({
                path: 'assignedEmployees',
                model: "User",
                match: { uuid: { $exists: true } }, // Ensures only valid references are populated
                localField: "assignedEmployees",
                foreignField: "uuid", // Match on uuid instead of _id
            }).sort({ createdAt: -1 }).lean();
        } else if (user?.role === "manager") {
            getAllUsers = await User.find({ role: "employee", assigned_restaurants: { $in: assigned_restaurants } }).select("uuid first_name last_name email role assigned_restaurants active").populate({
                path: 'assigned_restaurants',
                model: "Restaurant",
                match: { uuid: { $exists: true } },
                localField: "assigned_restaurants",
                foreignField: "uuid",
                select: 'name uuid'
            });

            lessons = await Lesson.find({ isDeleted: false, restaurant_uuid: { $in: assigned_restaurants } }).populate({
                path: 'assignedEmployees',
                model: "User",
                match: { uuid: { $exists: true } }, // Ensures only valid references are populated
                localField: "assignedEmployees",
                foreignField: "uuid", // Match on uuid instead of _id
            }).sort({ createdAt: -1 }).lean();
        }


        const foodLessons = lessons.filter(lesson => (
            lesson.category === "food" &&
            lesson.assignedEmployees.some(employee => employee.active) // Filter lessons with active employees            
        ));

        const winelessons = lessons.filter(lesson => (
            lesson.category === "wine" &&
            lesson.assignedEmployees.some(employee => employee.active) // Filter lessons with active employees
        ));


        const usersWithDetails = getAllUsers?.map((user) => {
            const userId = user.uuid;
            const assigned_restaurants = user.assigned_restaurants.map(restaurant => ({
                uuid: restaurant.uuid,
                name: restaurant.name
            }));
            const myFoodLessons = foodLessons?.filter(lesson => lesson.assignedEmployees.some(employee => employee.uuid === userId));
            const myWineLessons = winelessons?.filter(lesson => lesson.assignedEmployees.some(employee => employee.uuid === userId));
            const myFoodKnowledege = myFoodLessons.reduce((acc, lesson) => {
                const completedCount = lesson?.progress?.filter(p => p.status === 'completed').length;
                const totalCount = lesson.progress?.length;
                return acc + (totalCount > 0 ? (completedCount / totalCount) * 100 : 0);
            }, 0) / myFoodLessons?.length || 0;
            const myWineKnowledege = myWineLessons?.reduce((acc, lesson) => {
                const completedCount = lesson?.progress?.filter(p => p.status === 'completed').length;
                const totalCount = lesson?.progress?.length;
                return acc + (totalCount > 0 ? (completedCount / totalCount) * 100 : 0);
            }, 0) / myWineLessons?.length || 0;

            const avarageLessonTraining = (myFoodKnowledege + myWineKnowledege) / 2;


            const allLessons = myFoodLessons?.concat(myWineLessons);

            const filteredSortedLessons = allLessons
                ?.map(lesson => {
                    // Find the most recently accessed progress object
                    const mostRecentProgress = lesson?.progress?.reduce((latest, p) => {
                        return new Date(p.lastAccessed) > new Date(latest.lastAccessed || 0) ? p : latest;
                    }, { lastAccessed: new Date(0), status: null });

                    return {
                        ...lesson,
                        lastAccessed: mostRecentProgress?.lastAccessed,
                        lastStatus: mostRecentProgress?.status
                    };
                })
                .filter(lesson => lesson?.lastStatus === 'in_progress' || lesson?.lastStatus === 'completed')
                .sort((a, b) => new Date(b.lastAccessed) - new Date(a.lastAccessed));

            const myLastLesson = filteredSortedLessons?.length > 0 ? filteredSortedLessons[0] : null;

            const now = new Date();
            const totalLessons = allLessons?.length;

            let notPassedDueDateCount = 0;

            allLessons.forEach(lesson => {
                if (new Date(lesson.DueDate) >= now) {
                    notPassedDueDateCount++;
                }
            });

            const trackStatus = notPassedDueDateCount > totalLessons / 2;

            const myLessonHistory = allLessons
                .map(lesson => {
                    const userProgress = lesson.progress?.find(
                        p => p.status === 'completed'
                    );

                    if (userProgress) {
                        delete lesson.progress;
                        return {
                            ...lesson,
                            progress: userProgress
                        };
                    }

                    return null;
                })
                .filter(Boolean);


            return {
                uuid: userId,
                first_name: user.first_name,
                last_name: user.last_name,
                restaurants: assigned_restaurants,
                foodKnowledge: myFoodKnowledege,
                wineKnowledge: myWineKnowledege,
                lastLesson: myLastLesson || null,
                status: trackStatus ? "On Track" : "Overdue",
                training: avarageLessonTraining,
                frequency: 1,
                lessonHistory: myLessonHistory,
            }
        });

        res.status(200).json({ usersWithDetails });

    } catch (error) {
        console.error("Error fetching lesson user details:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }

}

export const resetTrainingProgress = async (req, res) => {
    try {
        const { user } = req;
        const { resetUsers, catogery } = req.body;
        if (!isSuperAdmin(req) && !user.assigned_restaurants.length) {
            return res.status(403).json({ message: "Unauthorized to reset training progress" });
        }

        if (resetUsers === "All") {
            // Reset all lesson progress for all users
            const updateUserResult = await User.updateMany(
                {},
                { $set: { lesson_progress: [] } }
            );

            const updateResult = await Lesson.updateMany(
                { isDeleted: false, category: catogery },
                {
                    $set: {
                        "progress.$[elem].attempts": [],
                        "progress.$[elem].status": "not_started"
                    },

                },
                {
                    arrayFilters: [
                        { "elem.attempts": { $exists: true } } // Optional if you want to filter specific elements
                    ]
                }
            );


            // Log the reset action
            await Log.create({
                uuid: uuidv4(),
                user_uuid: [resetUsers],
                action: "reset_training_progress",
                details: { user_uuid: "All user training reset" },
                role: user.role,
                timestamp: new Date(),
            });
            return res.status(200).json({ message: "Training progress reset successfully for all users" });
        } else {


            // Reset all lesson progress for the user
            const userFilter = resetUsers ? { uuid: { $in: resetUsers } } : { assigned_restaurants: { $in: user.assigned_restaurants } };
            const updateUserResult = await User.updateMany(
                userFilter,
                { $set: { lesson_progress: [] } }
            );
            const updateResult = await Lesson.updateMany(
                {
                    isDeleted: false,
                    catogory: catogery,
                    "progress.employeeId": { $in: resetUsers }
                },
                { category: catogery },
                {
                    $set: {
                        "progress.$[elem].attempts": [],
                        "progress.$[elem].status": "not_started"
                    }
                },
                {
                    arrayFilters: [
                        { "elem.attempts": { $exists: true } } // Optional if you want to filter specific elements
                    ]
                }
            );


        }
        // Log the reset action
        await Log.create({
            uuid: uuidv4(),
            user_uuid: user.uuid,
            action: "reset_training_progress",
            details: { user_uuid: resetUsers },
            role: user.role,
            timestamp: new Date(),
        });
        return res.status(200).json({ message: "Training progress reset successfully" });
    } catch (error) {
        console.error("Error resetting training progress:", error);
        return res.status(500).json({ message: "Server error", error: error.message });
    }
}

// New function to get lessons by restaurant
export const getLessonsByRestaurant = async (req, res) => {
    try {
        const { restaurant_uuid } = req.params;

        // Check if user has permission to view lessons for this restaurant
        if (!isSuperAdmin(req) && !req.user.assigned_restaurants.includes(restaurant_uuid)) {
            return res.status(403).json({ message: "Unauthorized to view lessons for this restaurant" });
        }

        // Find lessons by restaurant_uuid
        const lessons = await Lesson.find({ isDeleted: false, restaurant_uuid });

        // Manually populate references using UUIDs
        const populatedLessons = await Promise.all(lessons.map(async (lesson) => {
            // Get menu items
            const menuItems = await Dish.find({ isDeleted: false, uuid: { $in: lesson.menu_items } });

            // Get created by user
            const createdByUser = await User.findOne({ uuid: lesson.createdBy }, "first_name last_name");

            // Get last modified by user
            const lastModifiedByUser = await User.findOne({ uuid: lesson.lastModifiedBy }, "first_name last_name");

            return {
                ...lesson.toObject(),
                menu_items: menuItems,
                createdBy: createdByUser,
                lastModifiedBy: lastModifiedByUser
            };
        }));

        return res.status(200).json({ lessons: populatedLessons });
    } catch (error) {
        console.error("Error fetching lessons by restaurant:", error);
        return res.status(500).json({ message: "Error fetching lessons", error: error.message });
    }
};

// New function to get employee progress by restaurant
export const getEmployeeProgressByRestaurant = async (req, res) => {
    try {
        const { restaurant_uuid } = req.params;

        // Check if user has permission to view progress for this restaurant
        if (!isSuperAdmin(req) && !req.user.assigned_restaurants.includes(restaurant_uuid)) {
            return res.status(403).json({ message: "Unauthorized to view progress for this restaurant" });
        }

        const lessons = await Lesson.find({ isDeleted: false, restaurant_uuid })
            .populate("assignedEmployees", "first_name last_name email")
            .select("uuid title progress assignedEmployees");

        return res.status(200).json({ lessons });
    } catch (error) {
        return res.status(500).json({ message: "Error fetching progress", error });
    }
};

// Get detailed progress report for a restaurant
export const getRestaurantProgressReport = async (req, res) => {

    try {
        const { restaurant_uuid } = req.params;

        // Check permissions
        if (!isSuperAdmin(req) && !req.user.assigned_restaurants.includes(restaurant_uuid)) {
            return res.status(403).json({ message: "Unauthorized to view progress for this restaurant" });
        }

        const lessons = await Lesson.find({ isDeleted: false, restaurant_uuid })
            .populate("progress.employeeId", "first_name last_name email")
            .select("uuid unit unit_name chapter chapter_name progress");

        // Aggregate progress data
        const report = {
            totalLessons: lessons.length,
            totalEmployees: new Set(lessons.flatMap(l => l.progress.map(p => p.employeeId.uuid))).size,
            completionStats: {
                total: 0,
                inProgress: 0,
                notStarted: 0
            },
            averageScores: {
                byUnit: {},
                byChapter: {},
                overall: 0
            },
            timeMetrics: {
                averageTimePerLesson: 0,
                averageTimePerUnit: {},
                averageTimePerChapter: {}
            },
            employeeProgress: {}
        };

        // Calculate statistics
        let totalScore = 0;
        let totalCompletedLessons = 0;
        let totalTimeSpent = 0;

        lessons.forEach(lesson => {
            lesson.progress.forEach(progress => {
                const employeeId = progress.employeeId.uuid;

                // Initialize employee progress if not exists
                if (!report.employeeProgress[employeeId]) {
                    report.employeeProgress[employeeId] = {
                        name: `${progress.employeeId.first_name} ${progress.employeeId.last_name}`,
                        completedLessons: 0,
                        inProgressLessons: 0,
                        totalScore: 0,
                        averageTimePerLesson: 0
                    };
                }

                // Update completion stats
                report.completionStats[progress.status]++;
                if (progress.status === "completed") {
                    report.employeeProgress[employeeId].completedLessons++;
                    report.employeeProgress[employeeId].totalScore += progress.score;
                    totalScore += progress.score;
                    totalCompletedLessons++;
                    totalTimeSpent += progress.timeSpent || 0;

                    // Update unit and chapter stats
                    if (!report.averageScores.byUnit[lesson.unit]) {
                        report.averageScores.byUnit[lesson.unit] = { total: 0, count: 0 };
                    }
                    report.averageScores.byUnit[lesson.unit].total += progress.score;
                    report.averageScores.byUnit[lesson.unit].count++;

                    if (!report.averageScores.byChapter[lesson.chapter]) {
                        report.averageScores.byChapter[lesson.chapter] = { total: 0, count: 0 };
                    }
                    report.averageScores.byChapter[lesson.chapter].total += progress.score;
                    report.averageScores.byChapter[lesson.chapter].count++;
                } else if (progress.status === "in_progress") {
                    report.employeeProgress[employeeId].inProgressLessons++;
                }
            });
        });

        // Calculate averages
        report.averageScores.overall = totalCompletedLessons > 0 ? totalScore / totalCompletedLessons : 0;
        report.timeMetrics.averageTimePerLesson = totalCompletedLessons > 0 ? totalTimeSpent / totalCompletedLessons : 0;

        // Calculate unit and chapter averages
        Object.keys(report.averageScores.byUnit).forEach(unit => {
            const unitStats = report.averageScores.byUnit[unit];
            report.averageScores.byUnit[unit] = unitStats.total / unitStats.count;
        });

        Object.keys(report.averageScores.byChapter).forEach(chapter => {
            const chapterStats = report.averageScores.byChapter[chapter];
            report.averageScores.byChapter[chapter] = chapterStats.total / chapterStats.count;
        });

        // Calculate employee averages
        Object.keys(report.employeeProgress).forEach(employeeId => {
            const employee = report.employeeProgress[employeeId];
            employee.averageScore = employee.completedLessons > 0 ?
                employee.totalScore / employee.completedLessons : 0;
        });

        return res.status(200).json(report);
    } catch (error) {
        return res.status(500).json({ message: "Error generating progress report", error });
    }
};

// Get aggregated progress report for directors and super admins
export const getAggregatedProgressReport = async (req, res) => {
    try {
        if (!isSuperAdmin(req) && req.user.role !== "director") {
            return res.status(403).json({ message: "Unauthorized to view aggregated reports" });
        }

        const restaurantUuids = isSuperAdmin(req) ?
            (await Restaurant.find()).map(r => r.uuid) :
            req.user.assigned_restaurants;

        const restaurants = await Restaurant.find({ uuid: { $in: restaurantUuids } });
        const report = {
            totalRestaurants: restaurants.length,
            totalEmployees: 0,
            overallStats: {
                totalLessons: 0,
                completedLessons: 0,
                averageScore: 0,
                averageTimePerLesson: 0
            },
            restaurantStats: {},
            unitProgress: {},
            chapterProgress: {}
        };

        // Get progress for each restaurant
        for (const restaurant of restaurants) {
            const restaurantReport = await getRestaurantProgressReport(
                { params: { restaurant_uuid: restaurant.uuid } },
                { json: () => { } }
            );

            report.restaurantStats[restaurant.uuid] = {
                name: restaurant.name,
                ...restaurantReport
            };

            report.totalEmployees += restaurantReport.totalEmployees;
            report.overallStats.totalLessons += restaurantReport.totalLessons;
            report.overallStats.completedLessons += restaurantReport.completionStats.total;
        }

        // Calculate overall averages
        if (report.overallStats.completedLessons > 0) {
            report.overallStats.averageScore =
                Object.values(report.restaurantStats)
                    .reduce((sum, stats) => sum + stats.averageScores.overall, 0) /
                restaurants.length;
        }

        return res.status(200).json(report);
    } catch (error) {
        console.log(error, "error")
        return res.status(500).json({ message: "Error generating aggregated report", error });
    }
};

// Get employee's detailed progress
export const getEmployeeDetailedProgress = async (req, res) => {
    try {
        const { employee_uuid } = req.params;

        // Check if user has permission to view this employee's progress
        if (!isSuperAdmin(req) &&
            req.user.role !== "director" &&
            (req.user.role !== "manager" || !req.user.assigned_restaurants.includes(req.body.restaurant_uuid)) &&
            req.user.uuid !== employee_uuid) {
            return res.status(403).json({ message: "Unauthorized to view this employee's progress" });
        }

        const lessons = await Lesson.find({ isDeleted: false, "progress.employeeId": employee_uuid })
            .populate("progress.employeeId", "first_name last_name email")
            .select("uuid unit unit_name chapter chapter_name progress");

        const progress = {
            employee: null,
            totalLessons: lessons.length,
            completedLessons: 0,
            inProgressLessons: 0,
            notStartedLessons: 0,
            averageScore: 0,
            averageTimePerLesson: 0,
            unitProgress: {},
            chapterProgress: {},
            detailedProgress: []
        };

        let totalScore = 0;
        let totalTimeSpent = 0;

        lessons.forEach(lesson => {
            const employeeProgress = lesson.progress.find(p => p.employeeId.uuid === employee_uuid);
            if (employeeProgress) {
                if (!progress.employee) {
                    progress.employee = employeeProgress.employeeId;
                }

                progress[`${employeeProgress.status}Lessons`]++;

                if (employeeProgress.status === "completed") {
                    totalScore += employeeProgress.score;
                    totalTimeSpent += employeeProgress.timeSpent || 0;

                    // Update unit progress
                    if (!progress.unitProgress[lesson.unit]) {
                        progress.unitProgress[lesson.unit] = {
                            name: lesson.unit_name,
                            completed: 0,
                            total: 0,
                            averageScore: 0,
                            averageTime: 0
                        };
                    }
                    progress.unitProgress[lesson.unit].completed++;
                    progress.unitProgress[lesson.unit].total++;
                    progress.unitProgress[lesson.unit].averageScore += employeeProgress.score;
                    progress.unitProgress[lesson.unit].averageTime += employeeProgress.timeSpent || 0;

                    // Update chapter progress
                    if (!progress.chapterProgress[lesson.chapter]) {
                        progress.chapterProgress[lesson.chapter] = {
                            name: lesson.chapter_name,
                            completed: 0,
                            total: 0,
                            averageScore: 0,
                            averageTime: 0
                        };
                    }
                    progress.chapterProgress[lesson.chapter].completed++;
                    progress.chapterProgress[lesson.chapter].total++;
                    progress.chapterProgress[lesson.chapter].averageScore += employeeProgress.score;
                    progress.chapterProgress[lesson.chapter].averageTime += employeeProgress.timeSpent || 0;
                }

                progress.detailedProgress.push({
                    lesson: {
                        uuid: lesson.uuid,
                        unit: lesson.unit,
                        unit_name: lesson.unit_name,
                        chapter: lesson.chapter,
                        chapter_name: lesson.chapter_name
                    },
                    status: employeeProgress.status,
                    score: employeeProgress.score,
                    timeSpent: employeeProgress.timeSpent,
                    completedAt: employeeProgress.completedAt,
                    attempts: employeeProgress.attempts
                });
            }
        });

        // Calculate averages
        progress.completedLessons = lessons.filter(l =>
            l.progress.find(p => p.employeeId.uuid === employee_uuid)?.status === "completed"
        ).length;

        if (progress.completedLessons > 0) {
            progress.averageScore = totalScore / progress.completedLessons;
            progress.averageTimePerLesson = totalTimeSpent / progress.completedLessons;
        }

        // Calculate unit and chapter averages
        Object.keys(progress.unitProgress).forEach(unit => {
            const unitStats = progress.unitProgress[unit];
            if (unitStats.completed > 0) {
                unitStats.averageScore /= unitStats.completed;
                unitStats.averageTime /= unitStats.completed;
            }
        });

        Object.keys(progress.chapterProgress).forEach(chapter => {
            const chapterStats = progress.chapterProgress[chapter];
            if (chapterStats.completed > 0) {
                chapterStats.averageScore /= chapterStats.completed;
                chapterStats.averageTime /= chapterStats.completed;
            }
        });

        return res.status(200).json(progress);
    } catch (error) {
        return res.status(500).json({ message: "Error fetching employee progress", error });
    }
};



// New function to get lesson updates for managers and directors
export const getLessonUpdates = async (req, res) => {
    try {
        if (!isAdminOrManager(req)) {
            return res.status(403).json({ message: "Unauthorized" });
        }

        const restaurantUuids = isSuperAdmin(req) ?
            (await Restaurant.find()).map(r => r.uuid) :
            req.user.assigned_restaurants;

        // Get all users with new updates in the assigned restaurants
        const users = await User.find({
            assigned_restaurants: { $in: restaurantUuids },
            "lesson_progress.hasNewUpdate": true
        }).populate("lesson_progress.lesson_id");

        // Format the updates
        const updates = users.flatMap(user =>
            user.lesson_progress
                .filter(lp => lp.hasNewUpdate)
                .map(lp => ({
                    employee: {
                        uuid: user.uuid,
                        name: `${user.first_name} ${user.last_name}`,
                        email: user.email
                    },
                    lesson: {
                        uuid: lp.lesson_id.uuid,
                        title: lp.lesson_id.unit_name,
                        chapter: lp.lesson_id.chapter_name
                    },
                    progress: {
                        status: lp.status,
                        score: lp.score,
                        completedAt: lp.last_completed,
                        hasNewUpdate: lp.hasNewUpdate,
                        lastViewedByManager: lp.lastViewedByManager,
                        lastViewedByDirector: lp.lastViewedByDirector
                    }
                }))
        );

        res.status(200).json({ updates });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// New function to clear update flags when viewed
export const clearLessonUpdateFlags = async (req, res) => {
    try {
        if (!isAdminOrManager(req)) {
            return res.status(403).json({ message: "Unauthorized" });
        }

        const { employeeUuid, lessonUuid } = req.params;

        const user = await User.findOne({ uuid: employeeUuid });
        if (!user) {
            return res.status(404).json({ message: "Employee not found" });
        }

        const lessonProgress = user.lesson_progress.find(lp => lp.lesson_id === lessonUuid);
        if (!lessonProgress) {
            return res.status(404).json({ message: "Lesson progress not found" });
        }

        // Update the appropriate last viewed timestamp based on role
        if (req.user.role === "manager") {
            lessonProgress.lastViewedByManager = new Date();
        } else if (req.user.role === "director") {
            lessonProgress.lastViewedByDirector = new Date();
        }

        // Clear the new update flag
        lessonProgress.hasNewUpdate = false;
        await user.save();

        res.status(200).json({ message: "Update flags cleared successfully" });
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

export const uploadLessonTemplate = async (req, res) => {
    let filePath; // Declare outside to access it in finally
    try {
        const json_template_file = req.file;

        if (!json_template_file) {
            return res.status(400).json({ message: "No file uploaded" });
        }

        filePath = json_template_file.path;

        const fileContent = await readFile(filePath, 'utf-8');
        const dataFile = JSON.parse(fileContent);

        const { unit, chapter, category } = dataFile;
        const existingLessonTemplate = await LessonTemplate.findOne({ unit, chapter, category });

        if (existingLessonTemplate) {
            return res.status(400).json({ message: "Lesson template already exists" });
        };

        const newLessonTemplate = new LessonTemplate(dataFile);
        await newLessonTemplate.save();

        res.status(201).json({ message: "Lesson template uploaded successfully", lessonTemplate: newLessonTemplate });
    } catch (error) {
        console.log(error)
        res.status(500).json({ message: "Server error", error: error.message });
    }
};
