import jwt from "jsonwebtoken";
import { User } from "../schema/userschema.mjs";
import { Log } from "../schema/logschema.mjs";

export const authMiddleware = async (req, res, next) => {
  try {
    // console.log("Headers:", req.headers);

    const token = req.headers.authorization?.split(" ")[1];
    // console.log("Extracted Token:", token);

    if (!token) {
      return res.status(401).json({ message: "Unauthorized: No token provided" });
    }

    // Verify the token
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (!decoded.uuid) {
      return res.status(401).json({ message: "Invalid token: Missing user ID" });
    }

    // Find user by UUID
    
    const user = await User.findOne({ uuid: decoded.uuid })
      .select("-password")
      .populate({
        path: "assigned_restaurants",
        model: "Restaurant",
        match: { uuid: { $exists: true } }, // Ensures only valid references are populated
        localField: "assigned_restaurants",
        foreignField: "uuid", // Match on uuid instead of _id
      })
      .populate({
        path: "attemptedQuestions.lesson_uuid",
        model: "Lesson",
        match: { uuid: { $exists: true } },
        localField: "attemptedQuestions.lesson_uuid",
        foreignField: "uuid"
      });

    // console.log("User Found:", user);

    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }

    if (!user.active) {
      return res.status(403).json({ message: "Forbidden: Your account has been deactivated. Please contact support." });
    }

    req.user = user;
    next();
  } catch (error) {
    console.error("Auth Error:", error.message);
    return res.status(401).json({ message: "Invalid token", error: error.message });
  }
};

// Role-based permission system
export const checkPermission = (permission) => (req, res, next) => {
  try {
    const { role, permissions, assigned_restaurants } = req.user;
    const restaurantUUID = req.params.uuid || req.body.restaurantUUID;


    // Strictly Block Employees from Non-View Actions
    if (role === "employee" && permission !== "view_lessons") {
      return res.status(403).json({ message: "Forbidden: Employees cannot modify data" });
    }

    // Super Admin - Full Access
    if (role === "super_admin") return next();

    // Director of Operations - Can manage multiple restaurants
    if (role === "director") {
      // if (restaurantUUID) {
      //   const assignedUUIDs = assigned_restaurants.map(r => r.uuid);
      //   if (!assignedUUIDs.includes(restaurantUUID)) {
      //     return res.status(403).json({ message: "Forbidden: You cannot manage this restaurant" });
      //   }
      // }
      if (["assign_lessons", "manage_restaurants", "manage_users", "manage_employees", "manage_users", "manage_dishes", "manage_wines", "view_progress"].includes(permission)) {
        return next();
      }
    }

    // Manager - Can only manage their assigned restaurant
    if (role === "manager") {
      // if (!restaurantUUID || !assigned_restaurants.some(r => r.uuid === restaurantUUID)) {
      //   return res.status(403).json({ message: "Forbidden: You are not assigned to this restaurant" });
      // }
      if (["assign_lessons", "manage_menu", "manage_restaurants", "manage_employees", "view_reports", "manage_users", "manage_dishes", "manage_wines", "view_progress"].includes(permission)) {
        return next();
      }
    }

    // General Permission Check
    if (permissions?.includes(permission)) {
      return next();
    }

    return res.status(403).json({ message: "Forbidden: Insufficient permissions" });

  } catch (error) {
    console.error("Permission Error:", error.message);
    return res.status(500).json({ message: "Internal Server Error" });
  }
};

export const logAction = async (req, res, next) => {
  try {
    const user = req.user; // Assuming authentication middleware sets this
    if (!user) return next();

    const logEntry = new Log({
      uuid: uuidv4(),
      user_uuid: user.uuid,
      action: req.action, // Set action in route handlers
      details: req.body || {},
      role: user.role,
      restaurant_uuid: user.assigned_restaurants?.[0] || null,
    });

    await logEntry.save();
  } catch (error) {
    console.error("Log error:", error);
  }
  next();
};