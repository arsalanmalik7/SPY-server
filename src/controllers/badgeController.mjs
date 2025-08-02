import { v4 as uuidv4 } from 'uuid';
import { User } from '../schema/userschema.mjs';
import { Log } from '../schema/logschema.mjs';

// Helper function to check if a user is a super admin
const isSuperAdmin = (req) => {
    return req.user && req.user.role === 'super_admin';
};

// Get all available badges in the system
export const getAllBadges = async (req, res) => {
    try {
        if (!isSuperAdmin(req)) {
            return res.status(403).json({ message: "Unauthorized to view all badges" });
        }

        const badges = {
            food: {
                unit1: {
                    name: "Food Unit 1 Master",
                    chapters: {
                        1: { name: "Food Chapter 1 Expert", image: "Food_U1C1.png" },
                        2: { name: "Food Chapter 2 Expert", image: "Food_U1C2.png" },
                        3: { name: "Food Chapter 3 Expert", image: "Food_U1C3.png" },
                        4: { name: "Food Chapter 4 Expert", image: "Food_U1C4.png" },
                        5: { name: "Food Chapter 5 Expert", image: "Food_U1C5.png" }
                    },
                    unit_badge: { name: "Food Unit 1 Complete", image: "Food_Unit_1.png" }
                },
                unit2: {
                    name: "Food Unit 2 Master",
                    chapters: {
                        1: { name: "Food Chapter 1 Expert", image: "Food_U2C1.png" },
                        2: { name: "Food Chapter 2 Expert", image: "Food_U2C2.png" },
                        3: { name: "Food Chapter 3 Expert", image: "Food_U2C3.png" }
                    },
                    unit_badge: { name: "Food Unit 2 Complete", image: "Food_Unit_2.png" }
                }
            },
            wine: {
                unit1: {
                    name: "Wine Unit 1 Master",
                    chapters: {
                        1: { name: "Wine Chapter 1 Expert", image: "Wine_U1C1.png" },
                        2: { name: "Wine Chapter 2 Expert", image: "Wine_U1C2.png" },
                        3: { name: "Wine Chapter 3 Expert", image: "Wine_U1C3.png" },
                        4: { name: "Wine Chapter 4 Expert", image: "Wine_U1C4.png" }
                    },
                    unit_badge: { name: "Wine Unit 1 Complete", image: "Wine_Unit_1.png" }
                },
                unit2: {
                    name: "Wine Unit 2 Master",
                    chapters: {
                        1: { name: "Wine Chapter 1 Expert", image: "Wine_U2C1.png" },
                        2: { name: "Wine Chapter 2 Expert", image: "Wine_U2C2.png" },
                        3: { name: "Wine Chapter 3 Expert", image: "Wine_U2C3.png" },
                        4: { name: "Wine Chapter 4 Expert", image: "Wine_U2C4.png" }
                    },
                    unit_badge: { name: "Wine Unit 2 Complete", image: "Wine_Unit_2.png" }
                }
            }
        };

        res.status(200).json(badges);
    } catch (error) {
        res.status(500).json({ message: "Error fetching badges", error: error.message });
    }
};

// Get user's badges
export const getUserBadges = async (req, res) => {
    try {
        const { userId } = req.params;

        // Check if user has permission to view these badges
        if (!isSuperAdmin(req) && req.user.uuid !== userId) {
            return res.status(403).json({ message: "Unauthorized to view these badges" });
        }

        const user = await User.findOne({ uuid: userId });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        res.status(200).json(user.badges);
    } catch (error) {
        res.status(500).json({ message: "Error fetching user badges", error: error.message });
    }
};

// Assign a badge to a user
export const assignBadge = async (req, res) => {
    try {
        if (!isSuperAdmin(req)) {
            return res.status(403).json({ message: "Unauthorized to assign badges" });
        }

        const { userId } = req.params;
        const { badge_id, badge_name, category, unit, chapter, score } = req.body;

        const user = await User.findOne({ uuid: userId });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Check if user already has this badge
        const existingBadge = user.badges.find(b => b.badge_id === badge_id);
        if (existingBadge) {
            return res.status(400).json({ message: "User already has this badge" });
        }

        const assignBadgeImage = (category, unit, chapter) => {
            if (category === "food") {
                return `/public/Food_U${unit}C${chapter}.png`;
            } else if (category === "wine") {
                return `/public/Wine_U${unit}C${chapter}.png`;
            }
            return null;
        }
        const badgeImage = assignBadgeImage(category, unit, chapter);


        // Add new badge
        user.badges.push({
            badge_id,
            badge_image: badgeImage,
            badge_name,
            category,
            unit,
            chapter,
            score,
            earned_at: new Date()
        });

        await user.save();

        // Log badge assignment
        await Log.create({
            uuid: uuidv4(),
            user_uuid: userId,
            action: "badge_assigned",
            details: {
                badge_id,
                badge_name,
                category,
                unit,
                chapter,
                score
            },
            role: req.user.role,
            restaurant_uuid: user.assigned_restaurants[0],
            timestamp: new Date()
        });

        res.status(200).json({ message: "Badge assigned successfully", badge: user.badges[user.badges.length - 1] });
    } catch (error) {
        res.status(500).json({ message: "Error assigning badge", error: error.message });
    }
};

// Remove a badge from a user
export const removeBadge = async (req, res) => {
    try {
        if (!isSuperAdmin(req)) {
            return res.status(403).json({ message: "Unauthorized to remove badges" });
        }

        const { userId, badgeId } = req.params;

        const user = await User.findOne({ uuid: userId });
        if (!user) {
            return res.status(404).json({ message: "User not found" });
        }

        // Find and remove the badge
        const badgeIndex = user.badges.findIndex(b => b.badge_id === badgeId);
        if (badgeIndex === -1) {
            return res.status(404).json({ message: "Badge not found" });
        }

        const removedBadge = user.badges[badgeIndex];
        user.badges.splice(badgeIndex, 1);
        await user.save();

        // Log badge removal
        await Log.create({
            uuid: uuidv4(),
            user_uuid: userId,
            action: "badge_removed",
            details: {
                badge_id: badgeId,
                badge_name: removedBadge.badge_name,
                category: removedBadge.category,
                unit: removedBadge.unit,
                chapter: removedBadge.chapter
            },
            role: req.user.role,
            restaurant_uuid: user.assigned_restaurants[0],
            timestamp: new Date()
        });

        res.status(200).json({ message: "Badge removed successfully" });
    } catch (error) {
        res.status(500).json({ message: "Error removing badge", error: error.message });
    }
};

// Get badge analytics
export const getBadgeAnalytics = async (req, res) => {
    try {
        if (!isSuperAdmin(req)) {
            return res.status(403).json({ message: "Unauthorized to view badge analytics" });
        }

        const users = await User.find({}, 'badges');

        const analytics = {
            totalBadges: 0,
            badgesByCategory: {
                food: { total: 0, byUnit: {}, byChapter: {} },
                wine: { total: 0, byUnit: {}, byChapter: {} }
            },
            mostCommonBadges: [],
            leastCommonBadges: [],
            averageTimeToEarn: {
                byUnit: {},
                byChapter: {}
            },
            recentEarnings: []
        };

        // Process each user's badges
        users.forEach(user => {
            user.badges.forEach(badge => {
                analytics.totalBadges++;

                // Update category stats
                analytics.badgesByCategory[badge.category].total++;

                // Update unit stats
                if (!analytics.badgesByCategory[badge.category].byUnit[badge.unit]) {
                    analytics.badgesByCategory[badge.category].byUnit[badge.unit] = 0;
                }
                analytics.badgesByCategory[badge.category].byUnit[badge.unit]++;

                // Update chapter stats if applicable
                if (badge.chapter) {
                    if (!analytics.badgesByCategory[badge.category].byChapter[badge.chapter]) {
                        analytics.badgesByCategory[badge.category].byChapter[badge.chapter] = 0;
                    }
                    analytics.badgesByCategory[badge.category].byChapter[badge.chapter]++;
                }

                // Track recent earnings
                analytics.recentEarnings.push({
                    badge_id: badge.badge_id,
                    badge_name: badge.badge_name,
                    earned_at: badge.earned_at
                });
            });
        });

        // Sort recent earnings by date
        analytics.recentEarnings.sort((a, b) => b.earned_at - a.earned_at);
        analytics.recentEarnings = analytics.recentEarnings.slice(0, 10); // Keep only the 10 most recent

        // Calculate most and least common badges
        const badgeCounts = {};
        users.forEach(user => {
            user.badges.forEach(badge => {
                if (!badgeCounts[badge.badge_id]) {
                    badgeCounts[badge.badge_id] = {
                        count: 0,
                        name: badge.badge_name
                    };
                }
                badgeCounts[badge.badge_id].count++;
            });
        });

        const sortedBadges = Object.entries(badgeCounts)
            .map(([id, data]) => ({ id, ...data }))
            .sort((a, b) => b.count - a.count);

        analytics.mostCommonBadges = sortedBadges.slice(0, 5);
        analytics.leastCommonBadges = sortedBadges.slice(-5).reverse();

        res.status(200).json(analytics);
    } catch (error) {
        res.status(500).json({ message: "Error generating badge analytics", error: error.message });
    }
}; 