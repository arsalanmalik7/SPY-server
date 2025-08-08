import { User } from "../schema/userschema.mjs";
import { Menu } from "../schema/menuschema.mjs";
import { GlobalWine } from "../schema/wineschema.mjs";
import { Lesson } from "../schema/lessonschema.mjs";
import { Dish } from "../schema/dishschema.mjs";
import jwt from "jsonwebtoken";
import dotenv from "dotenv";
import bcrypt from "bcrypt";
import fs from "fs";
import nodemailer from "nodemailer";
import { v4 as uuidv4 } from "uuid";  // Import UUID
import { Restaurant } from "../schema/restaurantschema.mjs";
import { Log } from "../schema/logschema.mjs";

dotenv.config();

const SALT_ROUNDS = 10;

// Nodemailer Transporter with Mailtrap
const transporter = nodemailer.createTransport({
    service: "Gmail",
    auth: {
        user: process.env.MAILTRAP_USER, // Your Mailtrap username
        pass: process.env.MAILTRAP_PASS, // Your Mailtrap password
    },
});

// Middleware to check user role
const checkPermissions = (reqUser, targetUser) => {
    if (reqUser.role === "super_admin") return true;
    if (reqUser.role === "director" && targetUser.role !== "super_admin") return true;
    return false;
};

// Register User API
export const registerUser = async (req, res) => {
    try {
        const { first_name, last_name, email, password, role, current_subscription, lesson_progress, next_lesson_due, restaurant_uuid } = req.body;

        // Check if user exists
        const userExists = await User.findOne({ email });
        if (userExists) {
            await Log.create({
                uuid: uuidv4(),
                user_uuid: userExists.uuid,
                action: "user_registration_faile",
                details: { email, reason: "User already exists" },
                role: role,
                restaurant_uuid: restaurant_uuid || null, // Add restaurant_uuid if needed
                timestamp: new Date(),
            });
            return res.status(400).json({ message: "User already exists" });
        }

        // Hash password
        let hashedPassword;
        let randomPassword;
        if (password) {
            hashedPassword = await bcrypt.hash(password, SALT_ROUNDS);

        } else {
            const characters = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%&*';
            function generateString(length) {
                let result = '';
                const charactersLength = characters.length;
                for (let i = 0; i < length; i++) {
                    result += characters.charAt(Math.floor(Math.random() * charactersLength));
                }

                return result;
            }
            console.log(generateString(8));
            randomPassword = generateString(8);
            hashedPassword = await bcrypt.hash(randomPassword, SALT_ROUNDS);

        }
        // Ensure lesson_progress includes score
        const updatedLessonProgress = lesson_progress?.map(lp => ({
            ...lp,
            score: lp.score || 0,
        })) || [];

        // Create new user with UUID
        const newUser = new User({
            uuid: uuidv4(),
            first_name,
            last_name,
            email,
            password: hashedPassword,
            role,
            lesson_progress: updatedLessonProgress,
            next_lesson_due,
            assigned_restaurants: restaurant_uuid ? [restaurant_uuid] : [], // Assign restaurant if provided
            current_subscription: current_subscription && current_subscription,
        });

        await newUser.save();

        if (restaurant_uuid) {
            const restaurant = await Restaurant.findOne({ uuid: restaurant_uuid });
            if (restaurant) {
                restaurant.employees.push(newUser.uuid);
                await restaurant.save();
            }
        }

        // Log successful registration
        await Log.create({
            uuid: uuidv4(),
            user_uuid: newUser.uuid,
            action: "user_registered",
            details: { email, role },
            role: role,
            restaurant_uuid: restaurant_uuid || null, // Add restaurant_uuid if needed
            timestamp: new Date(),
        });
        if (!password) {



            const resetToken = jwt.sign(
                { uuid: newUser.uuid },
                process.env.JWT_SECRET,
                { expiresIn: "24h" }
            );

            let resetURL;
            if (process.env.NODE_ENV === "development") {
                resetURL = `http://localhost:3000/reset-password?token=${resetToken}`;
            } else {
                resetURL = `https://beauty.instantsolutionslab.site/reset-password?token=${resetToken}`;
            }

            await transporter.sendMail({
                from: process.env.SMTP_USER,
                to: newUser.email,
                subject: "Welcome to Speak Your Menu! Activate Your Account",
                html: `
                <div style="font-family:Arial,sans-serif;font-size:15px;">
                    <p>Hi ${newUser.first_name} ${newUser.last_name},</p>
                    <p>You have been invited to join Speak Your Menu. Please click the link below to set your password and activate your account:</p>
                    <a href="${resetURL}">${resetURL}</a>
                    <p>This link will expire in 24 hours for your security.</p>
                    <p>If you did not expect this invitation, please ignore this email.</p>
                    <p>Best regards,<br/>The Speak Your Menu Team</p>
                </div>
            `
            });
        }
        res.status(201).json({ message: "User registered successfully", user: newUser });
    } catch (error) {
        console.error("Registration Error:", error);
        await Log.create({
            uuid: uuidv4(),
            user_uuid: null,
            action: "user_registration_failed",
            details: { error: error.message },
            role: "unknown",
            restaurant_uuid: null, // No restaurant associated
            timestamp: new Date(),
        });

        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Login User API with Refresh Token
export const loginUser = async (req, res) => {
    try {
        const { email, password } = req.body;
        const user = await User.findOne({ email }).populate({
            path: "assignedLessons",
            model: "Lesson",
            match: { uuid: { $exists: true } }, // Ensures only valid references are populated
            localField: "assignedLessons",
            foreignField: "uuid",
            select: "unit unit_name chapter chapter_name uuid"
        });

        const restaurant_uuids = user?.assigned_restaurants;

        if (!user) {
            await Log.create({
                uuid: uuidv4(),
                user_uuid: null,
                action: "login_failed",
                details: { email, reason: "Invalid credentials" },
                role: "employee", // Default to employee role for failed logins
                restaurant_uuid: null, // No restaurant associated
                timestamp: new Date(),
            });
            return res.status(400).json({ message: "Invalid credentials" });
        }

        // Check if the user is deactivated
        if (!user.active) {
            await Log.create({
                uuid: uuidv4(),
                user_uuid: user.uuid,
                action: "login_failed",
                details: { email, reason: "Account deactivated" },
                role: user.role,
                restaurant_uuid: user.assigned_restaurants[0] || null, // Add restaurant_uuid if needed
                timestamp: new Date(),
            });
            return res.status(403).json({ message: "Your account has been deactivated. Please contact support." });
        }

        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) {
            await Log.create({
                uuid: uuidv4(),
                user_uuid: user.uuid,
                action: "login_failed",
                details: { email, reason: "Invalid password" },
                role: user.role,
                restaurant_uuid: user.assigned_restaurants[0] || null, // Add restaurant_uuid if needed
                timestamp: new Date(),
            });
            return res.status(400).json({ message: "Invalid credentials" });
        }

        // Generate Access Token (Short-lived)
        const accessToken = jwt.sign(
            { uuid: user.uuid, role: user.role },
            process.env.JWT_SECRET,
            { expiresIn: "1d" }
        );

        // Generate Refresh Token (Longer expiry)
        const refreshToken = jwt.sign(
            { uuid: user.uuid },
            process.env.REFRESH_SECRET,
            { expiresIn: "7d" }
        );

        // Store refresh token in the user model (or in a database)
        user.refreshToken = refreshToken;
        user.last_login = new Date();
        await user.save();

        const userObject = user.toObject();
        delete userObject.password; // Remove password from the response
        delete userObject.refreshToken; // Remove refresh token from the response
        delete userObject.__v; // Remove version key from the response


        if (restaurant_uuids.length !== 0) {
            const restaurants = await Restaurant.find({ uuid: { $in: restaurant_uuids } });

            userObject.assigned_restaurants = restaurants

        } else {
            userObject.assigned_restaurants = []
        }



        // Log successful login
        await Log.create({
            uuid: uuidv4(),
            user_uuid: user.uuid,
            action: "login",
            details: { email, role: user.role },
            role: user.role,
            restaurant_uuid: user.assigned_restaurants[0] || null, // Add restaurant_uuid if needed
            timestamp: new Date(),
        });




        res.json({ message: "Login successful", accessToken, refreshToken, user: userObject });
    } catch (error) {
        console.log(error, "error");
        await Log.create({
            uuid: uuidv4(),
            user_uuid: null,
            action: "login_failed",
            details: { error: error.message },
            role: "employee", // Default to employee role for failed logins
            restaurant_uuid: null, // No restaurant associated
            timestamp: new Date(),
        });

        res.status(500).json({ message: "Server error", error: error.message });
    }
};


// Update User API
export const updateUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const { first_name, last_name, email, assigned_restaurants, lesson_progress, role, next_lesson_due, newPassword, active, } = req.body;

        const token = req.headers.authorization?.split(" ")[1];

        if (!token) return res.status(401).json({ message: "Unauthorized" });

        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        const reqUser = await User.findOne({ uuid: decoded.uuid });

        if (!reqUser) return res.status(401).json({ message: "Invalid token" });

        const targetUser = await User.findOne({ uuid: userId });
        if (!targetUser) return res.status(404).json({ message: "User not found" });

        if (!checkPermissions(reqUser, targetUser)) {
            return res.status(403).json({ message: "You do not have permission to update this user" });
        }

        let roleChanged = false;
        let oldRole = targetUser.role;
        let wasActive = targetUser.active;

        if (first_name) targetUser.first_name = first_name;
        if (last_name) targetUser.last_name = last_name;
        if (email) targetUser.email = email;
        if (typeof active === "boolean") targetUser.active = active;


        if (assigned_restaurants) targetUser.assigned_restaurants = assigned_restaurants;
        if (lesson_progress?.length > 0) {
            targetUser.lesson_progress = lesson_progress.map(lp => ({
                ...lp,
                score: lp.score || 0,
            }));
        }
        if (reqUser.role === "super_admin") {
            if (role) {
                roleChanged = targetUser.role !== role;
                targetUser.role = role;
            }
            if (newPassword) {
                const salt = await bcrypt.genSalt(10);
                const hashedPassword = await bcrypt.hash(newPassword, salt);
                targetUser.password = hashedPassword;
            }
        }

        if (next_lesson_due) targetUser.next_lesson_due = next_lesson_due;

        await targetUser.save();

        // Log role change
        if (roleChanged) {
            await Log.create({
                uuid: uuidv4(),
                user_uuid: reqUser.uuid,
                action: "role_changed",
                details: {
                    target_user: targetUser.uuid,
                    old_role: oldRole,
                    new_role: role
                },
                role: reqUser.role,
                restaurant_uuid: targetUser.assigned_restaurants[0] || null, // Add restaurant_uuid if needed
                timestamp: new Date(),
            });

            // Send role change notification email
            await transporter.sendMail({
                from: process.env.SMTP_USER,
                to: targetUser.email,
                subject: "Your Account Permissions Have Changed",
                html: `
                    <div style="font-family:Arial,sans-serif;font-size:15px;">
                        <p>Hi ${targetUser.first_name} ${targetUser.last_name},</p>
                        <p>Your role or permissions in Speak Your Menu have been updated. You now have the following access: <b>${role}</b>.</p>
                        <p>If you have any questions, please contact your administrator.</p>
                        <p>Best regards,<br/>The Speak Your Menu Team</p>
                    </div>
                `
            });
        }

        // Send deactivation email if account was active and is now deactivated
        if (typeof active === "boolean" && wasActive && active === false) {
            await transporter.sendMail({
                from: process.env.SMTP_USER,
                to: targetUser.email,
                subject: "Your Account Has Been Deactivated",
                html: `
                    <div style="font-family:Arial,sans-serif;font-size:15px;">
                        <p>Hi ${targetUser.first_name} ${targetUser.last_name},</p>
                        <p>Your account for Speak Your Menu has been deactivated or removed. If you believe this is a mistake, please contact your administrator.</p>
                        <p>Best regards,<br/>The Speak Your Menu Team</p>
                    </div>
                `
            });
        }

        res.json({ message: "User updated successfully", user: targetUser });
    } catch (error) {
        console.log("error: ", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Get User API
export const getUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findOne({ uuid: userId }).select("-password");
        if (!user) return res.status(404).json({ message: "User not found" });

        res.json(user);
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Get All Users API
export const getAllUsers = async (req, res) => {
    try {
        const { user } = req;
        let users;
        if (user?.role === "super_admin") {
            users = await User.find({ role: { $nin: "super_admin" } }).select("-password").sort({ createdAt: -1 })
                .populate({
                    path: "assigned_restaurants",
                    model: "Restaurant",
                    match: { uuid: { $exists: true } },
                    localField: "assigned_restaurants",
                    foreignField: "uuid",
                    select: "uuid name"
                });
        } else if (user?.role === "director") {
            const assignedRestaurantUUIDs = user.assigned_restaurants.map(r => r.uuid);
            // Also get restaurants where user is account_owner
            const ownerRestaurants = await Restaurant.find({ account_owner: user.uuid });
            const ownerRestaurantUUIDs = ownerRestaurants.map(r => r.uuid);
            const allRestaurantUUIDs = Array.from(new Set([...assignedRestaurantUUIDs, ...ownerRestaurantUUIDs]));
            users = await User.find({
                assigned_restaurants: { $in: allRestaurantUUIDs },
                role: { $nin: ["director", "super_admin"] }
            }).select("-password").sort({ createdAt: -1 })
                .populate({
                    path: "assigned_restaurants",
                    model: "Restaurant",
                    match: { uuid: { $exists: true } },
                    localField: "assigned_restaurants",
                    foreignField: "uuid",
                    select: "uuid name"
                });

        } else if (user?.role === "manager") {
            const assignedRestaurantUUIDs = user.assigned_restaurants.map(r => r.uuid);
            // Also get restaurants where user is account_owner
            const ownerRestaurants = await Restaurant.find({ account_owner: user.uuid });
            const ownerRestaurantUUIDs = ownerRestaurants.map(r => r.uuid);
            const allRestaurantUUIDs = Array.from(new Set([...assignedRestaurantUUIDs, ...ownerRestaurantUUIDs]));
            users = await User.find({
                assigned_restaurants: { $in: allRestaurantUUIDs },
                role: { $nin: ["manager", "super_admin", "director"] }
            }).select("-password").sort({ createdAt: -1 })
                .populate({
                    path: "assigned_restaurants",
                    model: "Restaurant",
                    match: { uuid: { $exists: true } },
                    localField: "assigned_restaurants",
                    foreignField: "uuid",
                    select: "uuid name"
                });

        }

        res.status(200).json(users);
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Request Password Reset
export const requestPasswordReset = async (req, res) => {
    try {
        const { email } = req.body;
        const user = await User.findOne({ email });

        if (!user) return res.status(404).json({ message: "User not found" });

        // Generate JWT token valid for 15 mins
        const resetToken = jwt.sign(
            { uuid: user.uuid },
            process.env.JWT_SECRET,
            { expiresIn: "1h" }
        );

        // Send Email
        let resetURL;
        if (process.env.NODE_ENV === "development") {
            resetURL = `http://localhost:3000/reset-password?token=${resetToken}`;
        } else {
            resetURL = `https://beauty.instantsolutionslab.site/reset-password?token=${resetToken}`
        }
        await transporter.sendMail({
            from: process.env.SMTP_USER,
            to: email,
            subject: "Password Reset Request",
            html: `
                <div style="font-family:Arial,sans-serif;font-size:15px;">
                    <p>Hi ${user.first_name} ${user.last_name},</p>
                    <p>We received a request to reset your password for your Speak Your Menu account. Click the link below to set a new password:</p>
                   <a href="${resetURL}">${resetURL}</a>
                    <p>This link will expire in 1 hour and can only be used once.</p>
                    <p>If you did not request a password reset, please ignore this email.</p>
                    <p>Best regards,<br/>The Speak Your Menu Team</p>
                </div>
            `
        });

        res.json({ message: "Password reset link sent to your email." });

    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Reset Password
export const resetPassword = async (req, res) => {
    try {
        const { token, newPassword } = req.body;
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        const user = await User.findOne({ uuid: decoded.uuid });

        if (!user) {
            return res.status(400).json({ message: "User not found" });
        }

        // Hash new password
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, SALT_ROUNDS);
        user.password = hashedPassword;
        await user.save();

        res.json({ message: "Password updated successfully" });

    } catch (error) {
        if (error.name === "TokenExpiredError") {
            return res.status(400).json({ message: "Token expired" });
        }
        res.status(500).json({ message: "Internal servr error", error: error.message });
    }
};

export const getProfile = async (req, res) => {
    try {
        const user = await User.findOne({ uuid: req?.user?.uuid }).select("-password").populate({
            path: "assigned_restaurants",
            model: "Restaurant",
            match: { uuid: { $exists: true } },
            select: "uuid name",
            localField: "assigned_restaurants",
            foreignField: "uuid",
        });
        if (!user) return res.status(404).json({ message: "User not found" });
        res.status(200).json(user);
    } catch (error) {
        console.log(error, "error");
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

export const changePassword = async (req, res) => {
    try {

        const { currentPassword, newPassword } = req.body;
        if (!currentPassword || !newPassword) return res.status(400).json({ message: "Old and new passwords are required" });
        const user = await User.findOne({ uuid: req?.user?.uuid });
        if (!user) return res.status(404).json({ message: "User not found" });
        const isMatch = await bcrypt.compare(currentPassword, user.password);
        if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });
        const salt = await bcrypt.genSalt(10);
        const hashedPassword = await bcrypt.hash(newPassword, salt);
        user.password = hashedPassword;
        await user.save();
        res.json({ message: "Password updated successfully", user });

    } catch (error) {
        console.log("error: ", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

export const changeEmail = async (req, res) => {
    try {
        const { newEmail, password } = req.body;
        const currentEmail = req.user.email;
        if (!currentEmail || !newEmail || !password) return res.status(400).json({ message: "Current email, new email and password are required" });
        const user = await User.findOne({ email: currentEmail });
        if (!user) return res.status(404).json({ message: "User not found" });
        const isMatch = await bcrypt.compare(password, user.password);
        if (!isMatch) return res.status(400).json({ message: "Invalid credentials" });
        const emailExists = await User.findOne({ email: newEmail });
        if (emailExists) return res.status(400).json({ message: "Email already exists" });
        user.email = newEmail;
        await user.save();

        res.json({ message: "Email updated successfully", user });

    } catch (error) {
        console.log("error: ", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
}

// Refresh Token API
export const refreshToken = async (req, res) => {
    try {
        const { token } = req.body;

        if (!token) return res.status(401).json({ message: "Refresh token required" });

        // Verify the Refresh Token
        jwt.verify(token, process.env.REFRESH_SECRET, async (err, decoded) => {
            if (err) return res.status(403).json({ message: "Invalid refresh token" });

            const user = await User.findOne({ uuid: decoded.uuid });

            if (!user || user.refreshToken !== token) {
                return res.status(403).json({ message: "Invalid refresh token" });
            }

            // Generate New Access Token
            const newAccessToken = jwt.sign(
                { uuid: user.uuid, role: user.role },
                process.env.JWT_SECRET,
                { expiresIn: "15m" }
            );

            res.json({ accessToken: newAccessToken });
        });

    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Logout User API (Invalidates Refresh Token)
export const logoutUser = async (req, res) => {
    try {
        const { token } = req.body;

        const user = await User.findOne({ refreshToken: token });

        if (!user) {
            await Log.create({
                uuid: uuidv4(),
                user_uuid: null,
                action: "logout_failed",
                details: { reason: "Invalid refresh token" },
                role: "unknown",
                timestamp: new Date(),
            });

            return res.status(400).json({ message: "Invalid refresh token" });
        }

        // Remove refresh token from DB
        user.refreshToken = null;
        await user.save();

        // Log successful logout
        await Log.create({
            uuid: uuidv4(),
            user_uuid: user.uuid,
            action: "logout",
            details: { email: user.email },
            role: user.role,
            timestamp: new Date(),
        });

        res.json({ message: "Logged out successfully" });
    } catch (error) {
        await Log.create({
            uuid: uuidv4(),
            user_uuid: null,
            action: "logout_failed",
            details: { error: error.message },
            role: "unknown",
            timestamp: new Date(),
        });

        res.status(500).json({ message: "Server error", error: error.message });
    }
};

export const editProfile = async (req, res) => {
    try {
        const userId = req.user.uuid;
        const profilePhotoPath = req?.file?.path;
        const { first_name, last_name, email } = req.body;

        const user = await User.findOne({ uuid: userId }).populate({
            path: "assigned_restaurants",
            model: "Restaurant",
            match: { uuid: { $exists: true } },
            localField: "assigned_restaurants",
            foreignField: "uuid",
        });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        const profilePhotoUrl = `/${profilePhotoPath?.replace(/\\/g, '/')}`

        let profileChanged = false;
        let oldEmail = user.email;
        let oldFirstName = user.first_name;
        let oldLastName = user.last_name;

        if (first_name && first_name !== user.first_name) {
            user.first_name = first_name;
            profileChanged = true;
        }
        if (last_name && last_name !== user.last_name) {
            user.last_name = last_name;
            profileChanged = true;
        }
        if (email && email !== user.email) {
            user.email = email;
            profileChanged = true;
        }

        // Update profile photo URL
        const oldProfilePhotoUrl = user.image_url;
        if (oldProfilePhotoUrl && profilePhotoPath && oldProfilePhotoUrl !== profilePhotoUrl) {
            const oldProfilePhotoPath = oldProfilePhotoUrl.replace(/^\//, '');
            fs.unlink(oldProfilePhotoPath, (err) => {
                if (err) console.error("Error deleting old profile photo: ", err);
            });
            user.image_url = profilePhotoUrl;
        } else if (profilePhotoPath && !oldProfilePhotoUrl) {
            user.image_url = profilePhotoUrl;

        }

        await user.save();

        // Send notification email only if profile was changed
        if (profileChanged) {
            const emailRecipients = [];
            if (email && email !== oldEmail) {
                // If email changed, notify both old and new emails
                if (oldEmail) emailRecipients.push(oldEmail);
                emailRecipients.push(email);
            } else {
                emailRecipients.push(user.email);
            }
            for (const recipient of emailRecipients) {
                await transporter.sendMail({
                    from: process.env.SMTP_USER,
                    to: recipient,
                    subject: "Your Account Details Have Been Updated",
                    html: `
                        <div style="font-family:Arial,sans-serif;font-size:15px;">
                            <p>Hi ${user.first_name} ${user.last_name},</p>
                            <p>Your account details have been updated. If you changed your email address, you will receive a confirmation at both your old and new email addresses.</p>
                            <p>If you did not make this change, please contact support immediately.</p>
                            <p>Best regards,<br/>The Speak Your Menu Team</p>
                        </div>
                    `
                });
            }
        }

        res.json({ message: "Profile updated successfully", user });


    } catch (error) {
        console.log("error: ", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
}

// Assign Manager API
export const assignManagerToRestaurant = async (req, res) => {
    try {
        const { directorId, managerId, restaurantId } = req.body;

        const director = await User.findOne({ uuid: directorId });
        if (!director || director.role !== "director") {
            await Log.create({
                uuid: uuidv4(),
                action: "assign_manager_failed",
                details: { directorId, reason: "Not a director" },
                restaurant_uuid: restaurantId, // Add restaurant_uuid
                timestamp: new Date()
            });
            return res.status(403).json({ error: "Only directors can assign managers" });
        }

        const manager = await User.findOne({ uuid: managerId });
        if (!manager || manager.role !== "manager") {
            await Log.create({
                uuid: uuidv4(),
                action: "assign_manager_failed",
                details: { managerId, reason: "Manager not found" },
                restaurant_uuid: restaurantId, // Add restaurant_uuid
                timestamp: new Date()
            });
            return res.status(404).json({ error: "Manager not found" });
        }

        manager.assigned_restaurants.push(restaurantId);
        await manager.save();
        await Restaurant.findOneAndUpdate({ uuid: restaurantId }, { $addToSet: { managers: managerId } });

        await Log.create({
            uuid: uuidv4(),
            action: "assign_manager_success",
            details: { managerId, restaurantId },
            restaurant_uuid: restaurantId, // Add restaurant_uuid
            timestamp: new Date()
        });

        return res.status(200).json({ message: "Manager assigned successfully" });
    } catch (error) {
        await Log.create({
            uuid: uuidv4(),
            action: "assign_manager_error",
            details: { error: error.message },
            restaurant_uuid: restaurantId || null, // Add restaurant_uuid if available
            timestamp: new Date()
        });
        return res.status(500).json({ error: "Server error" });
    }
};

// Get Manager Restaurants API
export const getManagerRestaurants = async (req, res) => {
    try {
        const { managerId } = req.params;

        if (!managerId) {
            return res.status(400).json({ error: "Manager ID is required" });
        }

        // Find manager by UUID
        const manager = await User.findOne({ uuid: managerId });

        if (!manager || manager.role !== "manager") {
            return res.status(404).json({ error: "Manager not found" });
        }

        // Find restaurants manually by UUIDs
        const restaurants = await Restaurant.find({ uuid: { $in: manager.assigned_restaurants } })
            .select("uuid name address subscription_status")
            .lean();

        return res.status(200).json(restaurants);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Server error" });
    }
};

export const deactivateUser = async (req, res) => {
    try {
        const { userId } = req.params;
        const user = await User.findOne({ uuid: userId });

        if (!user) {
            await Log.create({
                uuid: uuidv4(),
                action: "deactivate_user_failed",
                details: { userId, reason: "User not found" },
                restaurant_uuid: user.assigned_restaurants[0] || null, // Add restaurant_uuid if needed
                timestamp: new Date()
            });
            return res.status(404).json({ message: "User not found" });
        }

        user.active = false;
        user.refreshToken = null;
        await user.save();

        await Log.create({
            uuid: uuidv4(),
            action: "deactivate_user_success",
            details: { userId },
            restaurant_uuid: user.assigned_restaurants[0] || null, // Add restaurant_uuid if needed
            timestamp: new Date()
        });

        res.json({ message: "User deactivated successfully" });
    } catch (error) {
        await Log.create({
            uuid: uuidv4(),
            action: "deactivate_user_error",
            details: { error: error.message },
            restaurant_uuid: null, // No restaurant associated
            timestamp: new Date()
        });
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

export const assignDirectorToRestaurant = async (req, res) => {
    try {
        const { directorId, restaurantId } = req.body;

        const director = await User.findOne({ uuid: directorId });
        if (!director || director.role !== "director") {
            await Log.create({
                uuid: uuidv4(),
                action: "assign_director_failed",
                details: { directorId, reason: "Not a director" },
                restaurant_uuid: restaurantId, // Add restaurant_uuid
                timestamp: new Date()
            });
            return res.status(403).json({ error: "Only directors can be assigned to restaurants" });
        }

        const restaurant = await Restaurant.findOne({ uuid: restaurantId });
        if (!restaurant) {
            await Log.create({
                uuid: uuidv4(),
                action: "assign_director_failed",
                details: { restaurantId, reason: "Restaurant not found" },
                restaurant_uuid: restaurantId, // Add restaurant_uuid
                timestamp: new Date()
            });
            return res.status(404).json({ error: "Restaurant not found" });
        }

        if (!restaurant.directors.includes(directorId)) restaurant.directors.push(directorId);
        if (!director.assigned_restaurants.includes(restaurantId)) director.assigned_restaurants.push(restaurantId);

        await restaurant.save();
        await director.save();

        await Log.create({
            uuid: uuidv4(),
            action: "assign_director_success",
            details: { directorId, restaurantId },
            restaurant_uuid: restaurantId, // Add restaurant_uuid
            timestamp: new Date()
        });

        return res.status(200).json({ message: "Director assigned successfully" });
    } catch (error) {
        await Log.create({
            uuid: uuidv4(),
            action: "assign_director_error",
            details: { error: error.message },
            restaurant_uuid: restaurantId || null, // Add restaurant_uuid if available
            timestamp: new Date()
        });
        return res.status(500).json({ error: "Server error" });
    }
};

export const getDirectorRestaurants = async (req, res) => {
    try {
        const { directorId } = req.params;

        // Verify the director exists and has the correct role
        const director = await User.findOne({ uuid: directorId });
        if (!director || director.role !== "director") {
            return res.status(403).json({ error: "Only directors can access this" });
        }

        // Fetch restaurants assigned to this director
        const restaurants = await Restaurant.find({ director: directorId });

        return res.json(restaurants);
    } catch (error) {
        console.error(error);
        return res.status(500).json({ error: "Server error" });
    }
};

export const updateLessonProgress = async (req, res) => {
    try {
        const { userId } = req.params;
        const { lessonId, progress, restaurant_uuid } = req.body;

        const user = await User.findOne({ uuid: userId });

        if (!user || user.role !== "employee") {
            await Log.create({
                uuid: uuidv4(),
                action: "update_progress_failed",
                details: { userId, reason: "Not an employee" },
                restaurant_uuid: restaurant_uuid,
                timestamp: new Date()
            });
            return res.status(403).json({ message: "Only employees can update progress" });
        }

        // Verify user has access to this restaurant
        if (!user.assigned_restaurants.includes(restaurant_uuid)) {
            await Log.create({
                uuid: uuidv4(),
                action: "update_progress_failed",
                details: { userId, reason: "Not assigned to restaurant" },
                restaurant_uuid: restaurant_uuid,
                timestamp: new Date()
            });
            return res.status(403).json({ message: "Not authorized for this restaurant" });
        }

        // Find or create restaurant progress entry
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

        // Update or add lesson progress
        const lessonIndex = restaurantProgress.lessons.findIndex(
            l => l.lesson_id === lessonId
        );

        if (lessonIndex >= 0) {
            restaurantProgress.lessons[lessonIndex] = {
                ...restaurantProgress.lessons[lessonIndex],
                ...progress,
                last_completed: progress.status === "completed" ? new Date() : restaurantProgress.lessons[lessonIndex].last_completed
            };
        } else {
            restaurantProgress.lessons.push({
                lesson_id: lessonId,
                ...progress,
                last_completed: progress.status === "completed" ? new Date() : null
            });
        }

        await user.save();

        await Log.create({
            uuid: uuidv4(),
            action: "update_progress_success",
            details: { userId, lessonId, progress, restaurant_uuid },
            restaurant_uuid: restaurant_uuid,
            timestamp: new Date()
        });

        res.json({ message: "Lesson progress updated" });
    } catch (error) {
        await Log.create({
            uuid: uuidv4(),
            action: "update_progress_error",
            details: { error: error.message },
            restaurant_uuid: null,
            timestamp: new Date()
        });
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

// Add new function to get employee's lesson progress for a specific restaurant
export const getEmployeeRestaurantProgress = async (req, res) => {
    try {
        const { userId, restaurant_uuid } = req.params;
        const user = await User.findOne({ uuid: userId });

        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Verify user has access to this restaurant
        if (!user.assigned_restaurants.includes(restaurant_uuid) && req.user.role !== "super_admin") {
            return res.status(403).json({ message: "Not authorized for this restaurant" });
        }

        // Get progress for specific restaurant
        const restaurantProgress = user.lesson_progress.find(
            rp => rp.restaurant_uuid === restaurant_uuid
        );

        if (!restaurantProgress) {
            return res.json({
                restaurant_uuid: restaurant_uuid,
                lessons: [],
                next_lesson_due: null
            });
        }

        res.json(restaurantProgress);
    } catch (error) {
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

export const getLogs = async (req, res) => {
    try {
        const user = req.user;
        let logs;

        if (user.role === "super_admin") {
            // Super Admins can see all logs
            // 1. Get all logs
            logs = await Log.find().sort({ timestamp: -1 });

            const emailSet = new Set();
            for (let log of logs) {
                if (log.details && log.details.email) {
                    emailSet.add(log.details.email);
                }
            }
            const emails = Array.from(emailSet);


            const users = await User.find({ email: { $in: emails } }, 'email first_name last_name');
            const emailToUser = {};
            for (let user of users) {
                emailToUser[user.email] = user;
            }

            for (let log of logs) {
                if (log.details && log.details.email) {
                    const userDoc = emailToUser[log.details.email];
                    if (userDoc) {
                        log.details.name = `${userDoc.first_name} ${userDoc.last_name}`;
                    }
                }
            }


        } else if (user.role === "director") {
            // Directors can see logs for their assigned restaurants, excluding admin and super_admin logs
            const assignedRestaurants = await Restaurant.find({ uuid: { $in: user.assigned_restaurants?.map(r => r.uuid) } });
            const ownerRestaurants = await Restaurant.find({ account_owner: req.user.uuid });
            // Merge and remove duplicates by uuid
            const allRestaurantsMap = new Map();
            assignedRestaurants.concat(ownerRestaurants).forEach(r => {
                allRestaurantsMap.set(r.uuid, r);
            });
            const restaurants = Array.from(allRestaurantsMap.values()).sort((a, b) => b.createdAt - a.createdAt);
            const restaurantUUIDs = restaurants.map(r => r.uuid);
            logs = await Log.find({
                restaurant_uuid: { $in: restaurantUUIDs },
                "details.role": { $nin: ["super_admin", "admin"] }
            }).sort({ timestamp: -1 });
            const emailSet = new Set();
            console.log("logs: ", logs);
            for (let log of logs) {
                if (log.details && log.details.email) {
                    emailSet.add(log.details.email);
                }
            }
            const emails = Array.from(emailSet);
            const users = await User.find({ email: { $in: emails } }, 'email first_name last_name');
            const emailToUser = {};
            for (let user of users) {
                emailToUser[user.email] = user;
            }
            for (let log of logs) {
                if (log.details && log.details.email) {
                    const userDoc = emailToUser[log.details.email];
                    if (userDoc) {
                        log.details.name = `${userDoc.first_name} ${userDoc.last_name}`;
                    }
                }
            }

        } else if (user.role === "manager") {
            // Managers can only see logs for their specific restaurant, and only manager/employee logs
            const assignedRestaurants = await Restaurant.find({ uuid: { $in: user.assigned_restaurants?.map(r => r.uuid) } });
            const ownerRestaurants = await Restaurant.find({ account_owner: req.user.uuid });
            // Merge and remove duplicates by uuid
            const allRestaurantsMap = new Map();
            assignedRestaurants.concat(ownerRestaurants).forEach(r => {
                allRestaurantsMap.set(r.uuid, r);
            });
            const restaurants = Array.from(allRestaurantsMap.values()).sort((a, b) => b.createdAt - a.createdAt);
            const restaurantUUIDs = restaurants.map(r => r.uuid);


            logs = await Log.find({
                restaurant_uuid: { $in: restaurantUUIDs },
                "details.role": { $in: ["manager", "employee"] }
            }).sort({ timestamp: -1 });
            const emailSet = new Set();
            for (let log of logs) {
                if (log.details && log.details.email) {
                    emailSet.add(log.details.email);
                }
            }
            const emails = Array.from(emailSet);
            const users = await User.find({ email: { $in: emails } }, 'email first_name last_name');
            const emailToUser = {};
            for (let user of users) {
                emailToUser[user.email] = user;
            }
            for (let log of logs) {
                if (log.details && log.details.email) {
                    const userDoc = emailToUser[log.details.email];
                    if (userDoc) {
                        log.details.name = `${userDoc.first_name} ${userDoc.last_name}`;
                    }
                }
            }
        } else {
            return res.status(403).json({ message: "Unauthorized to access logs." });
        }

        res.json({ logs });
    } catch (error) {
        console.error("Error fetching logs:", error);
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

export const allData = async (req, res) => {
    try {
        const { user } = req;
        const role = user?.role;



        let totalEmployees;
        let totalManagers;
        let totalMenuItem;
        let wineList;
        let menuUpdates;
        let allLessons;



        totalEmployees = role === "super_admin" ? await User.countDocuments({ role: "employee" }) : await User.countDocuments({ role: "employee", assigned_restaurants: { $in: user.assigned_restaurants.map((r) => r.uuid) } });
        totalManagers = role === "super_admin" ? await User.countDocuments({ role: "manager" }) : await User.countDocuments({ role: "manager", assigned_restaurants: { $in: user.assigned_restaurants.map((r) => r.uuid) } });
        totalMenuItem = role === "super_admin" ? await Dish.countDocuments() : await Dish.countDocuments({ restaurant_uuid: user.assigned_restaurants[0]?.uuid }) || 0;;
        wineList = role === "super_admin" ? await GlobalWine.countDocuments() : await GlobalWine.countDocuments({ restaurant_uuid: user.assigned_restaurants[0]?.uuid }) || 0;;

        menuUpdates = role === "super_admin" ? await Menu.find({
            is_active: true
        }).sort({ updatedAt: -1 }) : await Menu.find({
            is_active: true,
            restaurant_uuid: user.assigned_restaurants[0]?.uuid
        }).sort({ updatedAt: -1 }) || 0;


        allLessons = role === "super_admin" ? await Lesson.find({ isDeleted: false }) : await Lesson.find({
            isDeleted: false, restaurant_uuid: user.assigned_restaurants[0]?.uuid
        }) || 0;

        const today = new Date();

        let totalProgress = 0;
        let completedProgress = 0;
        let missedProgress = 0;

        let missedUsersSet = new Set();

        allLessons.forEach(lesson => {
            lesson?.progress?.forEach(p => {
                totalProgress++;

                if (p?.status === 'completed') {
                    completedProgress++;
                } else if (new Date(lesson?.DueDate) < today) {
                    // Lesson is overdue and not completed
                    missedProgress++;
                    missedUsersSet.add(p?.employeeId); // Collect unique user IDs who missed trainings
                }
            });
        });

        // Training Completion Rate (%)
        const trainingRate = totalProgress === 0 ? 0 : (completedProgress / totalProgress) * 100;

        // Missed Training Rate (%)
        const missedTrainingRate = totalProgress === 0 ? 0 : (missedProgress / totalProgress) * 100;

        // Unique user count who missed at least one training
        const missedUsersCount = missedUsersSet.size;

        const latestMenu = role === "super_admin" ? await Menu.findOne({ is_active: true })
            .sort({ updatedAt: -1 }) : await Menu.findOne({
                is_active: true,
                restaurant_uuid: user.assigned_restaurants[0]?.uuid
            })
                .sort({ updatedAt: -1 });
        let daysPassed;
        if (latestMenu) {
            const updatedAt = new Date(latestMenu.updatedAt);
            const today = new Date();

            // Calculate difference in milliseconds
            const diffInMs = today - updatedAt;

            // Convert to days
            daysPassed = Math.floor(diffInMs / (1000 * 60 * 60 * 24));
        } else {
            console.log('No menu found.');
        }



        return res.status(200).json({
            totalEmployees,
            totalManagers,
            totalMenuItem,
            wineList,
            trainingRate,
            missedTrainingRate,
            missedUsersCount,
            menuUpdates: menuUpdates.length,
            lastMenuUpdateInDays: daysPassed,
        });


    } catch (error) {
        console.log(error, "error");
        res.status(500).json({ message: "Server error", error: error.message });
    }
}

export const searchData = async (req, res) => {
    try {
        const { user } = req;
        const role = user?.role;

        const menus = role === "super_admin" ? await Menu.find().select("name uuid") : await Menu.find({
            restaurant_uuid: user.assigned_restaurants[0]?.uuid
        }).select("name uuid") || 0;
        const managers = role === "super_admin" ? await User.find({ role: "manager" }).select("first_name last_name uuid") : await User.find({
            role: "manager",
            assigned_restaurants: { $in: user.assigned_restaurants.map((r) => r.uuid) }
        }).select("first_name last_name uuid") || 0;
        const directors = role === "super_admin" ? await User.find({ role: "director" }).select("first_name last_name uuid") : await User.find({
            role: "director",
            assigned_restaurants: { $in: user.assigned_restaurants.map((r) => r.uuid) }
        });
        const employees = role === "super_admin" ? await User.find({ role: "employee" }).select("first_name last_name uuid") : await User.find({
            role: "employee",
            assigned_restaurants: { $in: user.assigned_restaurants.map((r) => r.uuid) }
        }).select("first_name last_name uuid") || 0;

        return res.status(200).json({
            menus,
            managers,
            directors,
            employees
        });
    } catch (error) {
        console.log(error, "error");
        res.status(500).json({ message: "Server error", error: error.message });
    }
};

export const viewEmployees = async (req, res) => {
    try {
        const { restaurant_uuid } = req.params;


        const employees = await User.find({ role: "employee", assigned_restaurants: restaurant_uuid });

        const allLessons = await Lesson.find({
            isDeleted: false,
            restaurant_uuid: restaurant_uuid
        }) || [];


        const totalEmployees = employees.length;
        const activeEmployees = employees?.filter(employee => employee.active === true).length;
        const inactiveEmployees = employees?.filter(employee => employee.active === false).length;

       
        const completedTrainingByEmployees = [];
        const inProgresTrainingByEmployees = [];
        const notStartedTrainingByEmployees = [];

        for (const employee of employees) {
            // Get all lessons assigned to this employee
            const employeeLessons = allLessons.filter(lesson =>
                lesson.assignedEmployees?.includes(employee.uuid)
            );
        
            if (employeeLessons.length === 0) continue; // Skip if no lessons assigned
        
            // Get progress for each lesson for this employee
            const progressStatuses = employeeLessons.map(lesson => {
                const progress = lesson.progress.find(p => p.employeeId === employee.uuid);
                return progress ? progress.status : 'not_started';
            });
        
            if (progressStatuses.every(status => status === 'completed')) {
                completedTrainingByEmployees.push(employee);
            } else if (progressStatuses.every(status => status === 'not_started')) {
                notStartedTrainingByEmployees.push(employee);
            } else if (progressStatuses.some(status => status === 'in_progress')) {
                inProgresTrainingByEmployees.push(employee);
            }
        }


        const mostActiveEmployeesInLastThirtyDays = employees?.filter(employee => {
            const thirtyDaysAgo = new Date();
            thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);

            return employee.lesson_progress.some(progress => {
                const progressDate = new Date(progress.updatedAt);
                return progressDate > thirtyDaysAgo;
            });
        });

        const lessonOverDueEmployees = allLessons.filter(lesson => {
            const today = new Date();
            return lesson.progress.some(progress => {
                const progressDate = new Date(lesson.DueDate);
                return lesson.DueDate && progress.status !== 'completed' && progressDate < today;
            });
        })



        return res.status(200).json({
            totalEmployees,
            activeEmployees,
            inactiveEmployees,
            completedTrainingByEmployees: completedTrainingByEmployees.length,
            inProgresTrainingByEmployees: inProgresTrainingByEmployees.length,
            notStartedTrainingByEmployees: notStartedTrainingByEmployees.length,
            mostActiveEmployeesInLastThirtyDays,
            lessonOverDueEmployees
        });
    } catch (error) {
        console.log(error, "error");
        res.status(500).json({ message: "Server error", error: error.message });
    }
};
