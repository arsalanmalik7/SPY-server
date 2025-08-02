import express from "express";
import { authMiddleware, checkPermission } from "../middleware/auth.mjs";
import upload from "../config/multerConfig.mjs";
import {
    createLesson, getAllLessons, getLessonById, updateLesson,
    getEmployeeLessons, updateLessonProgress, assignLessonToEmployee,
    deleteLesson, getLessonProgress, getLessonProgressForManager,
    getLessonsByRestaurant, getEmployeeProgressByRestaurant,
    getRestaurantProgressReport, getAggregatedProgressReport,
    getEmployeeDetailedProgress, getLessonUpdates, clearLessonUpdateFlags, getAllLessonProgress,
    lessonUserDetails, createLessonProgress, resetTrainingProgress, getUserProgress, uploadLessonTemplate,
    getRestaurantLessonProgress
} from "../controllers/lessonController.mjs";

const router = express.Router();

// Lesson Management
router.post("/create", authMiddleware, checkPermission("manage_lessons"), createLesson);
router.post("/uploadLessonTemplate", authMiddleware, upload.single("json_template_file"), uploadLessonTemplate);
router.get("/", authMiddleware, getAllLessons);
router.get("/progress", authMiddleware, checkPermission("view_progress"), getAllLessonProgress);
router.get("/lessonUsers", authMiddleware, checkPermission("view_progress"), lessonUserDetails);
router.get("/userProgress", authMiddleware, getUserProgress);
router.get("/:uuid", authMiddleware, getLessonById);
router.get("/progress/:restaurant_uuid", authMiddleware, checkPermission("view_progress"), getRestaurantLessonProgress);
router.post("/:lesson_uuid/createProgress", authMiddleware, checkPermission("view_progress"), createLessonProgress);
router.post("/resetProgress", authMiddleware, checkPermission("view_progress"), resetTrainingProgress);
router.put("/:uuid", authMiddleware, checkPermission("manage_lessons"), updateLesson);
router.delete("/:uuid", authMiddleware, checkPermission("manage_lessons"), deleteLesson);

// Restaurant-specific Lesson Management
router.get("/restaurant/:restaurant_uuid", authMiddleware, getLessonsByRestaurant);
router.get("/restaurant/:restaurant_uuid/progress", authMiddleware, checkPermission("view_progress"), getEmployeeProgressByRestaurant);
router.get("/restaurant/:restaurant_uuid/report", authMiddleware, checkPermission("view_progress"), getRestaurantProgressReport);

// Progress Tracking
router.put("/:lesson_uuid/progress", authMiddleware, updateLessonProgress);
router.get("/progress/:lessonUuid", authMiddleware, checkPermission("view_progress"), getLessonProgress);
router.get("/employee/:employee_uuid/progress", authMiddleware, getEmployeeDetailedProgress);
router.get("/report/aggregated", authMiddleware, checkPermission("view_progress"), getAggregatedProgressReport);

// View Assigned Lessons
router.get("/employee/lessons/:restaurant_uuid", authMiddleware, getEmployeeLessons);

// Assign Lesson to Employee (Only for Directors & Managers)
router.post(
    "/assign-to-employee",
    authMiddleware,
    checkPermission("assign_lessons"), // Only directors & managers
    assignLessonToEmployee
);

// Lesson Updates
router.get("/updates", authMiddleware, checkPermission("view_progress"), getLessonUpdates);
router.put("/updates/:employeeUuid/:lessonUuid/clear", authMiddleware, checkPermission("view_progress"), clearLessonUpdateFlags);

export default router;
