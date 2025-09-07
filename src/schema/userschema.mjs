import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const UserSchema = new mongoose.Schema(
  {
    uuid: { type: String, default: uuidv4, unique: true, index: true },
    first_name: { type: String, required: true, maxlength: 100, trim: true },
    last_name: { type: String, required: true, maxlength: 100, trim: true },
    email: {
      type: String,
      required: true,
      unique: true,
      trim: true,
      lowercase: true,
      match: [/^\S+@\S+\.\S+$/, "Invalid email format"],
      index: true,
    },
    password: { type: String, minlength: 8 },
    image_url: { type: String, trim: true, default: null },
    role: {
      type: String,
      enum: ["super_admin", "director", "manager", "employee"],
      required: true,
      index: true,
    },
    assigned_restaurants: [{ type: String, ref: "Restaurant" }],

    permissions: [
      {
        type: String,
        enum: [
          "manage_restaurants",
          "assign_managers",
          "manage_dishes",
          "manage_employees",
          "view_reports", // New permission for managers
          "manage_wine", // Added missing permission
        ],
      },
    ],

    lessons_required: {
      wine: { type: Boolean, default: false },
      food: { type: Boolean, default: false },
    },
    assignedLessons: { type: [String], default: [] },

    lesson_progress: [
      {
        restaurant_uuid: { type: String, ref: "Restaurant", required: true },
        lessons: [
          {
            lesson_id: { type: String, ref: "Lesson" },
            status: {
              type: String,
              enum: ["completed", "in_progress", "not_started"],
            },
            last_completed: { type: Date },
            attempts: { type: Array, default: [] }, // Array of attempts with timestamps and scores
            score: { type: Number, min: 0, max: 100, default: 0 },
            hasNewUpdate: { type: Boolean, default: false },
            lastViewedByManager: { type: Date },
            lastViewedByDirector: { type: Date },
          }
        ],
        next_lesson_due: { type: Date, default: null }
      }
    ],
    attemptedQuestions: [
      {
        lesson_uuid: { type: String, ref: "Lesson", required: true },
        menu_item: { type: String },
        answer: { type: [String], required: true },
        questionId: { type: String, ref: "Question" },
        isCorrect: { type: Boolean },
        isDeleted: { type: Boolean, default: false },
        attemptedAt: { type: Date, default: Date.now },
      },
    ],
    badges: [
      {
        badge_id: { type: String, required: true },
        badge_name: { type: String, required: true },
        badge_image: { type: String, required: true },
        category: { type: String, required: true }, // "food" or "wine"
        unit: { type: Number, required: true },
        unit_name: { type: String },
        chapter: { type: Number },
        chapter_name: { type: String },
        earned_at: { type: Date, default: Date.now },
        score: { type: Number, min: 0, max: 100 }
      }
    ],
    current_subscription: {
      status: { type: Boolean, default: false },
      plan: { type: String, enum: ["Free trial", "Single Location", "Multi Location"], default: "Free trial" },
      start_date: { type: Date, },
      end_date: { type: Date },
      payment_method: { type: String, },
      transaction_id: { type: String },
      // receipt_url: { type: String },
      // invoice_url: { type: String },
      // subscription_id: { type: String },
      sub_employee: { type: Boolean, default: false },
      amount: { type: Number },
      locations: { type: Number, default: 1 },
      currency: { type: String, default: "USD" },

    },
    subscription_history: [
      {
        status: { type: Boolean, },
        plan: { type: String, enum: ["free-trial", "single-location", "multi-location"] },
        start_date: { type: Date, },
        end_date: { type: Date },
        payment_method: { type: String, enum: ["credit_card", "paypal"] },
        transaction_id: { type: String },
        amount: { type: Number },
        currency: { type: String, },
      }
    ],
    active: { type: Boolean, default: true },
    last_login: { type: Date, default: null },
    lesson_frequency: { type: Number, default: 3 },
  },
  { timestamps: true }
);

UserSchema.index({ assigned_restaurants: 1 });

const User = mongoose.model("User", UserSchema);
export { User };
