const express = require('express');
const Message = require('../models/Message');
const auth = require('../middleware/auth');
const router = express.Router();

// Get all messages (paginated)
router.get('/', auth, async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = parseInt(req.query.limit) || 50;
    const skip = (page - 1) * limit;

    const messages = await Message.find()
      .sort({ createdAt: 1 })
      .skip(skip)
      .limit(limit)
      .populate('sender', 'username avatar')
      .populate('reactions.userId', 'username');

    const total = await Message.countDocuments();

    res.json({
      messages,
      total,
      page,
      pages: Math.ceil(total / limit),
    });
  } catch (err) {
    console.error('Get messages error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Send a message
router.post('/', auth, async (req, res) => {
  try {
    const { text, image } = req.body;

    if (!text && !image) {
      return res.status(400).json({ error: 'Message must contain text or an image' });
    }

    const message = new Message({
      sender: req.userId,
      text: text || '',
      image: image || '',
    });

    await message.save();
    await message.populate('sender', 'username avatar');

    res.status(201).json(message);
  } catch (err) {
    console.error('Send message error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Add reaction to a message
router.post('/:id/react', auth, async (req, res) => {
  try {
    const { emoji } = req.body;
    if (!emoji) {
      return res.status(400).json({ error: 'Emoji is required' });
    }

    const message = await Message.findById(req.params.id);
    if (!message) {
      return res.status(404).json({ error: 'Message not found' });
    }

    // Remove existing reaction from this user on this message
    message.reactions = message.reactions.filter(
      (r) => r.userId.toString() !== req.userId
    );

    // Add new reaction
    message.reactions.push({ emoji, userId: req.userId });
    await message.save();
    await message.populate('sender', 'username avatar');
    await message.populate('reactions.userId', 'username');

    res.json(message);
  } catch (err) {
    console.error('React error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

// Mark messages as seen
router.put('/seen', auth, async (req, res) => {
  try {
    await Message.updateMany(
      { sender: { $ne: req.userId }, seen: false },
      { seen: true }
    );
    res.json({ success: true });
  } catch (err) {
    console.error('Seen error:', err);
    res.status(500).json({ error: 'Server error' });
  }
});

module.exports = router;
