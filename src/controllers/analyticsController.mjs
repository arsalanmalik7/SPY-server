import { Lesson } from "../schema/lessonschema.mjs";
import { User } from "../schema/userschema.mjs";
import { Restaurant } from "../schema/restaurantschema.mjs";
import { v4 as uuidv4 } from "uuid";

// Utility function to check admin/super_admin roles
const isSuperAdmin = (req) => req.user && (req.user.role === "admin" || req.user.role === "super_admin");
const isAdminOrManager = (req) => req.user && ["admin", "super_admin", "manager", "director"].includes(req.user.role);

// Get lesson performance analytics for a restaurant
export const getRestaurantLessonAnalytics = async (req, res) => {
    try {
        const { restaurant_uuid } = req.params;

        // Check permissions
        if (!isSuperAdmin(req) && !req.user.assigned_restaurants.includes(restaurant_uuid)) {
            return res.status(403).json({ message: "Unauthorized to view analytics for this restaurant" });
        }

        const lessons = await Lesson.find({ isDeleted: false, restaurant_uuid })
            .populate("progress.employeeId", "first_name last_name email")
            .select("uuid unit unit_name chapter chapter_name difficulty progress");

        const analytics = {
            overallStats: {
                totalLessons: lessons.length,
                totalEmployees: new Set(lessons.flatMap(l => l.progress.map(p => p.employeeId.uuid))).size,
                completionRate: 0,
                averageTimePerLesson: 0,
                averageScore: 0
            },
            byUnit: {},
            byChapter: {},
            byDifficulty: {
                beginner: { total: 0, completed: 0, averageTime: 0, averageScore: 0 },
                intermediate: { total: 0, completed: 0, averageTime: 0, averageScore: 0 },
                advanced: { total: 0, completed: 0, averageTime: 0, averageScore: 0 }
            },
            challengingLessons: [],
            employeePerformance: {}
        };

        let totalCompletedLessons = 0;
        let totalTimeSpent = 0;
        let totalScore = 0;

        // Process each lesson
        lessons.forEach(lesson => {
            // Update difficulty stats
            analytics.byDifficulty[lesson.difficulty].total++;

            // Process unit stats
            if (!analytics.byUnit[lesson.unit]) {
                analytics.byUnit[lesson.unit] = {
                    name: lesson.unit_name,
                    totalLessons: 0,
                    completedLessons: 0,
                    averageTime: 0,
                    averageScore: 0,
                    totalTime: 0,
                    totalScore: 0
                };
            }
            analytics.byUnit[lesson.unit].totalLessons++;

            // Process chapter stats
            if (!analytics.byChapter[lesson.chapter]) {
                analytics.byChapter[lesson.chapter] = {
                    name: lesson.chapter_name,
                    totalLessons: 0,
                    completedLessons: 0,
                    averageTime: 0,
                    averageScore: 0,
                    totalTime: 0,
                    totalScore: 0
                };
            }
            analytics.byChapter[lesson.chapter].totalLessons++;

            // Process employee progress
            lesson.progress.forEach(progress => {
                const employeeId = progress.employeeId.uuid;

                // Initialize employee stats if not exists
                if (!analytics.employeePerformance[employeeId]) {
                    analytics.employeePerformance[employeeId] = {
                        name: `${progress.employeeId.first_name} ${progress.employeeId.last_name}`,
                        email: progress.employeeId.email,
                        completedLessons: 0,
                        totalTime: 0,
                        totalScore: 0,
                        averageTime: 0,
                        averageScore: 0,
                        byDifficulty: {
                            beginner: { completed: 0, averageTime: 0, averageScore: 0 },
                            intermediate: { completed: 0, averageTime: 0, averageScore: 0 },
                            advanced: { completed: 0, averageTime: 0, averageScore: 0 }
                        }
                    };
                }

                if (progress.status === "completed") {
                    // Update overall stats
                    totalCompletedLessons++;
                    totalTimeSpent += progress.timeSpent || 0;
                    totalScore += progress.score;

                    // Update unit stats
                    analytics.byUnit[lesson.unit].completedLessons++;
                    analytics.byUnit[lesson.unit].totalTime += progress.timeSpent || 0;
                    analytics.byUnit[lesson.unit].totalScore += progress.score;

                    // Update chapter stats
                    analytics.byChapter[lesson.chapter].completedLessons++;
                    analytics.byChapter[lesson.chapter].totalTime += progress.timeSpent || 0;
                    analytics.byChapter[lesson.chapter].totalScore += progress.score;

                    // Update difficulty stats
                    analytics.byDifficulty[lesson.difficulty].completed++;
                    analytics.byDifficulty[lesson.difficulty].averageTime += progress.timeSpent || 0;
                    analytics.byDifficulty[lesson.difficulty].averageScore += progress.score;

                    // Update employee stats
                    analytics.employeePerformance[employeeId].completedLessons++;
                    analytics.employeePerformance[employeeId].totalTime += progress.timeSpent || 0;
                    analytics.employeePerformance[employeeId].totalScore += progress.score;
                    analytics.employeePerformance[employeeId].byDifficulty[lesson.difficulty].completed++;
                    analytics.employeePerformance[employeeId].byDifficulty[lesson.difficulty].averageTime += progress.timeSpent || 0;
                    analytics.employeePerformance[employeeId].byDifficulty[lesson.difficulty].averageScore += progress.score;
                }
            });

            // Check if lesson is challenging (high average time or multiple attempts)
            const completedProgress = lesson.progress.filter(p => p.status === "completed");
            if (completedProgress.length > 0) {
                const avgTime = completedProgress.reduce((sum, p) => sum + (p.timeSpent || 0), 0) / completedProgress.length;
                const avgAttempts = completedProgress.reduce((sum, p) => sum + p.attempts.length, 0) / completedProgress.length;

                if (avgTime > 3600 || avgAttempts > 2) { // More than 1 hour or more than 2 attempts
                    analytics.challengingLessons.push({
                        uuid: lesson.uuid,
                        title: lesson.unit_name,
                        chapter: lesson.chapter_name,
                        difficulty: lesson.difficulty,
                        averageTime: avgTime,
                        averageAttempts: avgAttempts,
                        completionRate: completedProgress.length / lesson.progress.length
                    });
                }
            }
        });

        // Calculate averages
        const totalLessons = lessons.length * Object.keys(analytics.employeePerformance).length;
        analytics.overallStats.completionRate = totalCompletedLessons / totalLessons;
        analytics.overallStats.averageTimePerLesson = totalCompletedLessons > 0 ? totalTimeSpent / totalCompletedLessons : 0;
        analytics.overallStats.averageScore = totalCompletedLessons > 0 ? totalScore / totalCompletedLessons : 0;

        // Calculate unit averages
        Object.keys(analytics.byUnit).forEach(unit => {
            const unitStats = analytics.byUnit[unit];
            if (unitStats.completedLessons > 0) {
                unitStats.averageTime = unitStats.totalTime / unitStats.completedLessons;
                unitStats.averageScore = unitStats.totalScore / unitStats.completedLessons;
            }
        });

        // Calculate chapter averages
        Object.keys(analytics.byChapter).forEach(chapter => {
            const chapterStats = analytics.byChapter[chapter];
            if (chapterStats.completedLessons > 0) {
                chapterStats.averageTime = chapterStats.totalTime / chapterStats.completedLessons;
                chapterStats.averageScore = chapterStats.totalScore / chapterStats.completedLessons;
            }
        });

        // Calculate difficulty averages
        Object.keys(analytics.byDifficulty).forEach(difficulty => {
            const difficultyStats = analytics.byDifficulty[difficulty];
            if (difficultyStats.completed > 0) {
                difficultyStats.averageTime /= difficultyStats.completed;
                difficultyStats.averageScore /= difficultyStats.completed;
            }
        });

        // Calculate employee averages
        Object.keys(analytics.employeePerformance).forEach(employeeId => {
            const employee = analytics.employeePerformance[employeeId];
            if (employee.completedLessons > 0) {
                employee.averageTime = employee.totalTime / employee.completedLessons;
                employee.averageScore = employee.totalScore / employee.completedLessons;

                // Calculate difficulty-specific averages
                Object.keys(employee.byDifficulty).forEach(difficulty => {
                    const difficultyStats = employee.byDifficulty[difficulty];
                    if (difficultyStats.completed > 0) {
                        difficultyStats.averageTime /= difficultyStats.completed;
                        difficultyStats.averageScore /= difficultyStats.completed;
                    }
                });
            }
        });

        // Sort challenging lessons by completion rate
        analytics.challengingLessons.sort((a, b) => a.completionRate - b.completionRate);

        res.status(200).json(analytics);
    } catch (error) {
        res.status(500).json({ message: "Error generating analytics", error: error.message });
    }
};

// Get company-wide learning analytics (Super Admin only)
export const getCompanyAnalytics = async (req, res) => {
    try {
        if (!isSuperAdmin(req)) {
            return res.status(403).json({ message: "Unauthorized to view company analytics" });
        }

        const restaurants = await Restaurant.find();
        const analytics = {
            totalRestaurants: restaurants.length,
            totalEmployees: 0,
            overallStats: {
                totalLessons: 0,
                completedLessons: 0,
                averageCompletionRate: 0,
                averageTimePerLesson: 0,
                averageScore: 0
            },
            restaurantStats: {},
            unitProgress: {},
            chapterProgress: {},
            difficultyDistribution: {
                beginner: { total: 0, completed: 0, averageTime: 0, averageScore: 0 },
                intermediate: { total: 0, completed: 0, averageTime: 0, averageScore: 0 },
                advanced: { total: 0, completed: 0, averageTime: 0, averageScore: 0 }
            }
        };

        // Get analytics for each restaurant
        for (const restaurant of restaurants) {
            const restaurantAnalytics = await getRestaurantLessonAnalytics(
                { params: { restaurant_uuid: restaurant.uuid } },
                { json: () => { } }
            );

            analytics.restaurantStats[restaurant.uuid] = {
                name: restaurant.name,
                ...restaurantAnalytics.overallStats
            };

            // Aggregate overall stats
            analytics.totalEmployees += restaurantAnalytics.overallStats.totalEmployees;
            analytics.overallStats.totalLessons += restaurantAnalytics.overallStats.totalLessons;
            analytics.overallStats.completedLessons += restaurantAnalytics.overallStats.completedLessons;
            analytics.overallStats.averageTimePerLesson += restaurantAnalytics.overallStats.averageTimePerLesson;
            analytics.overallStats.averageScore += restaurantAnalytics.overallStats.averageScore;

            // Aggregate difficulty stats
            Object.keys(analytics.difficultyDistribution).forEach(difficulty => {
                analytics.difficultyDistribution[difficulty].total +=
                    restaurantAnalytics.byDifficulty[difficulty].total;
                analytics.difficultyDistribution[difficulty].completed +=
                    restaurantAnalytics.byDifficulty[difficulty].completed;
                analytics.difficultyDistribution[difficulty].averageTime +=
                    restaurantAnalytics.byDifficulty[difficulty].averageTime;
                analytics.difficultyDistribution[difficulty].averageScore +=
                    restaurantAnalytics.byDifficulty[difficulty].averageScore;
            });
        }

        // Calculate company-wide averages
        if (restaurants.length > 0) {
            analytics.overallStats.averageCompletionRate =
                analytics.overallStats.completedLessons / analytics.overallStats.totalLessons;
            analytics.overallStats.averageTimePerLesson /= restaurants.length;
            analytics.overallStats.averageScore /= restaurants.length;
        }

        // Calculate difficulty averages
        Object.keys(analytics.difficultyDistribution).forEach(difficulty => {
            const difficultyStats = analytics.difficultyDistribution[difficulty];
            if (difficultyStats.completed > 0) {
                difficultyStats.averageTime /= difficultyStats.completed;
                difficultyStats.averageScore /= difficultyStats.completed;
            }
        });

        res.status(200).json(analytics);
    } catch (error) {
        res.status(500).json({ message: "Error generating company analytics", error: error.message });
    }
}; 