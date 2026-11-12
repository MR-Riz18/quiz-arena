const mongoose = require('mongoose');

const questionSchema = new mongoose.Schema(
  {
    text: { type: String, required: [true, 'Question text is required'], trim: true },
    options: {
      type: [String],
      required: true,
      validate: {
        validator: (v) => Array.isArray(v) && v.length === 4 && v.every((s) => typeof s === 'string' && s.trim().length > 0),
        message: 'A question must have exactly 4 non-empty options',
      },
    },
    correctIndex: { type: Number, required: true, min: 0, max: 3 },
    explanation: { type: String, default: '' },
    category: { type: mongoose.Schema.Types.ObjectId, ref: 'Category', required: true },
    difficulty: { type: String, enum: ['easy', 'medium', 'hard'], default: 'medium' },
    tags: { type: [String], default: [] },
    isActive: { type: Boolean, default: true },
  },
  { timestamps: true }
);

questionSchema.index({ category: 1, difficulty: 1, isActive: 1 });

// Public shape — the server NEVER sends correctIndex/explanation before a
// question ends (see match engine). Use this for all pre-reveal payloads.
questionSchema.methods.toPublicJSON = function () {
  const o = this.toObject();
  return {
    id: o._id.toString(),
    text: o.text,
    options: o.options,
    difficulty: o.difficulty,
    category: o.category,
  };
};

module.exports = mongoose.model('Question', questionSchema);
