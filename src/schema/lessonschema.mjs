import mongoose from 'mongoose';
import { v4 as uuidv4 } from 'uuid';

const QuestionSchema = new mongoose.Schema({
  uuid: { type: String, default: uuidv4, unique: true, index: true },
  menu_item: { type: String, required: true, ref: "menu_items_model" },
  question_text: { type: String, required: true, maxlength: 500, trim: true },
  question_number: { type: Number, required: true },
  question_type: { type: String, enum: ["single_select", "multiple_choice", "text", "true_false", "fill_in_the_blank", "short_answer"], required: true },
  options_variable: { type: [String], default: [] },
  correct_answer_variable: { type: [String], default: [] },
  user_answer: { type: [String], default: [] },
  placeholders: { type: Object, default: {} },
  difficulty: { type: String, enum: ["easy", "medium", "hard"], required: true },
  hint: { type: String, maxlength: 300, trim: true },
  isDeleted: { type: Boolean, default: false },
  repeat_for: {
    source: { type: String, trim: true, required: false },
    key_variable: { type: String, trim: true, required: false }
  }
});

const LessonSchema = new mongoose.Schema(
  {
    uuid: { type: String, default: uuidv4, unique: true, index: true },
    category: { type: String, required: true, trim: true }, // Category field (e.g., "food", "wine")
    unit: { type: Number, required: true, min: 1 },
    unit_name: { type: String, required: true, maxlength: 200, trim: true },
    chapter: { type: Number, required: true, min: 1 },
    chapter_name: { type: String, required: true, maxlength: 200, trim: true },
    restaurant_uuid: { type: String, ref: "Restaurant", required: true }, // Restaurant this lesson belongs to
    menu_items: [{ type: String, refPath: "menu_items_model" }], // References to menu items this lesson covers
    menu_items_model: {
      type: String,
      enum: ['Dish', 'GlobalWine']
    },
    difficulty: { type: String, enum: ["beginner", "intermediate", "advanced"], required: true },
    content: {
      type: Map,
      of: String,
      default: new Map()
    },
    questions: [QuestionSchema],
    repeated_questions: [{ type: String, ref: "Question" }],
    glossary: {
      type: String,
    },
    assignedEmployees: [{ type: String, ref: "User" }],
    progress: [
      {
        employeeId: { type: String, ref: "User" },
        status: { type: String, enum: ["not_started", "in_progress", "completed"], default: "not_started" },
        score: { type: Number, min: 0, max: 100 },
        startTime: { type: Date },
        completionTime: { type: Date },
        timeSpent: { type: Number }, // Time spent in seconds
        attempts: [{
          timestamp: { type: Date, default: Date.now },
          score: { type: Number, min: 0, max: 100 },
          timeSpent: { type: Number, default: 0 },
          answers: [{
            questionId: { type: String, ref: "Question" },
            answer: { type: [String], default: [] },
            isCorrect: { type: Boolean }
          }]
        }],
        lastAccessed: { type: Date },
        completedAt: { type: Date },
        createdAt: { type: Date, default: Date.now },
      }
    ],
    DueDate: {
      type: Date,
      default: () => {
        const tomorrow = new Date();
        tomorrow.setDate(tomorrow.getDate() + 1);
        return tomorrow;
      }
    },
    createdBy: { type: String, ref: "User", required: true }, // Who created the lesson
    lastModifiedBy: { type: String, ref: "User" }, // Who last modified the lesson
    isActive: { type: Boolean, default: true },
    isDeleted: { type: Boolean, default: false },
  },
  { timestamps: true }
);

LessonSchema.index({ restaurant_uuid: 1, category: 1 });
LessonSchema.index({ unit: 1, chapter: 1 });
LessonSchema.index({ "progress.employeeId": 1 });

const Lesson = mongoose.model("Lesson", LessonSchema);
export { Lesson };
