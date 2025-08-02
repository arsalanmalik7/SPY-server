import express from "express";
import { authMiddleware, checkPermission } from "../middleware/auth.mjs";
import upload from "../config/multerConfig.mjs";
import {
    registerUser, loginUser, updateUser, getUser, getAllUsers,
    requestPasswordReset, resetPassword, logoutUser,
    assignManagerToRestaurant, getManagerRestaurants, deactivateUser,
    getDirectorRestaurants, updateLessonProgress,
    assignDirectorToRestaurant, getLogs, getEmployeeRestaurantProgress,
    allData, editProfile, searchData, changePassword, changeEmail, getProfile,
    viewEmployees
} from "../controllers/authController.mjs";

const router = express.Router();

router.post("/register", registerUser);
router.post("/login", loginUser);
router.put("/update/:userId", authMiddleware, checkPermission("manage_users"), updateUser);
router.put("/edit-profile", authMiddleware, upload.single("profilePhoto"), editProfile);
router.get("/user/:userId", authMiddleware, checkPermission("manage_users"), getUser);
router.get("/users", authMiddleware, checkPermission("manage_users"), getAllUsers);
router.post("/request-reset", requestPasswordReset);
router.post("/reset-password", resetPassword);
router.put("/change-password", authMiddleware, changePassword);
router.put("/change-email", authMiddleware, changeEmail);
router.post("/logout", authMiddleware, logoutUser);
router.get("/all-data", authMiddleware, checkPermission("manage_users"), allData);
router.get("/searchData", authMiddleware, searchData);
router.get("/profile", authMiddleware, getProfile);
router.get("/view-employees/:restaurant_uuid", authMiddleware, viewEmployees);

// Assign a Manager to a Restaurant
router.post("/assign-manager", authMiddleware, checkPermission("manage_restaurants"), assignManagerToRestaurant);

// Get Restaurants Assigned to a Manager
router.get("/manager/:managerId/restaurants", authMiddleware, checkPermission("manage_restaurants"), getManagerRestaurants);

// Get Restaurants Assigned to a Director
router.get("/director/:directorId/restaurants", authMiddleware, checkPermission("manage_restaurants"), getDirectorRestaurants);

// Assign a Director to a Restaurant
router.post("/assign-director", authMiddleware, checkPermission("manage_restaurants"), assignDirectorToRestaurant);

// Deactivate User
router.put("/user/:userId/deactivate", authMiddleware, checkPermission("manage_users"), deactivateUser);

// Update Lesson Progress
router.put("/:userId/lesson/:lessonId/progress", authMiddleware, updateLessonProgress);

// Get Employee's Restaurant Progress
router.get("/:userId/restaurant/:restaurant_uuid/progress", authMiddleware, getEmployeeRestaurantProgress);

router.get("/logs", authMiddleware, getLogs);

export default router;
