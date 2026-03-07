const mongoose = require('mongoose');

const reactionSchema = new mongoose.Schema({
  emoji: { type: String, required: true },
  userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
}, { _id: false });

const messageSchema = new mongoose.Schema({
  sender: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true,
  },
  text: {
    type: String,
    default: '',
  },
  image: {
    type: String,
    default: '',
  },
  reactions: [reactionSchema],
  seen: {
    type: Boolean,
    default: false,
  },
}, { timestamps: true });

// Index for efficient querying
messageSchema.index({ createdAt: -1 });

module.exports = mongoose.model('Message', messageSchema);
