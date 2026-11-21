
const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  // Resident who submitted the report
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },

  category: {
    type: String,
    required: true,
    trim: true,
  },

  description: {
    type: String,
    required: true,
    trim: true,
    minlength: 10,
  },

  location: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
  },

  // Original phone URI (kept for older reports)
  photoUri: {
    type: String,
    default: null,
  },

  // Permanently stored report photograph
  photo: {
    filename: {
      type: String,
      default: null,
    },
    url: {
      type: String,
      default: null,
    },
    mimeType: {
      type: String,
      default: null,
    },
    size: {
      type: Number,
      default: null,
    },
  },

  analysis: {
    status: {
      type: String,
      enum: ['pending', 'processing', 'completed', 'failed', 'not_applicable'],
      default: 'pending',
    },

    priority: {
      type: String,
      default: null,
    },

    // Complete assessment returned by the Python AI service
    assessment: {
      type: mongoose.Schema.Types.Mixed,
      default: null,
    },

    provider: {
      type: String,
      default: null,
    },

    model: {
      type: String,
      default: null,
    },

    assessedAt: {
      type: Date,
      default: null,
    },

    error: {
      type: String,
      default: null,
    },

    possibleDuplicates: {
      type: [mongoose.Schema.Types.Mixed],
      default: [],
    },
  },

  submissionStatus: {
    type: String,
    default: 'received',
  },

  // Administrator rejection details
  rejectionReason: {
    type: String,
    default: null,
    trim: true,
  },

  rejectedBy: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    default: null,
  },

  rejectedAt: {
    type: Date,
    default: null,
  },

    // Final decision made by the municipal administrator
  adminDecision: {
    priority: {
      type: String,
      enum: ['low', 'medium', 'high'],
      default: null,
    },

    decision: {
      type: String,
      enum: ['accepted', 'overridden'],
      default: null,
    },

    reason: {
      type: String,
      default: null,
      trim: true,
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: 'User',
      default: null,
    },

    reviewedAt: {
      type: Date,
      default: null,
    },
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model('Report', reportSchema);
