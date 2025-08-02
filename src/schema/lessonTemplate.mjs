import mongoose from 'mongoose';

const CorrectAnswerVariableSchema = new mongoose.Schema({
    source: { type: String, required: true }
}, { _id: false });

const RepeatForSchema = new mongoose.Schema({
    source: { type: String,  },
    key_variable: { type: String,  }
}, { _id: false });

const QuestionSchema = new mongoose.Schema({
    question_text: { type: String, required: true },
    question_type: { type: String, required: true },
    options_variable: { type: mongoose.Schema.Types.Mixed, required: true },
    correct_answer_variable: { type: mongoose.Schema.Types.Mixed, required: true },
    placeholders: { type: Object, default: {} },
    repeat_for: { type: RepeatForSchema},
    difficulty: { type: String, required: true },
    hint: { type: String }
}, { _id: false });

const ContentSchema = new mongoose.Schema({
    main_text: { type: String},
    section_1_title: { type: String},
    section_1_content: { type: String},
    section_2_title: { type: String},
    section_2_content: { type: String},
    section_3_title: { type: String},
    section_3_content: { type: String}
}, { _id: false });

const LessonTemplateSchema = new mongoose.Schema({
    unit: { type: Number, required: true },
    unit_name: { type: String, required: true },
    chapter: { type: Number, required: true },
    chapter_name: { type: String, required: true },
    category: { type: String, required: true },
    difficulty: { type: String },
    content: { type: ContentSchema },
    createdBy: { type: String },
    lastModifiedBy: { type: String },
    menu_items: [{ type: String }], // Array of UUIDs (menu item IDs)
    questions: [QuestionSchema], // Array of question objects

    // Optional: If you want to add tracking fields later
    // progress: { type: Array, default: [] },
    // status: { type: String, enum: ['not_started', 'in_progress', 'completed'], default: 'not_started' }

}, { timestamps: true }); // Adds createdAt and updatedAt automatically

export const LessonTemplate = mongoose.model('LessonTemplate', LessonTemplateSchema);
