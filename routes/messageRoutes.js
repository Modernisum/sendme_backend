const express = require('express');
const authMiddleware = require('../middleware/authMiddleware');
const Message = require('../models/Message');
const router = express.Router();

// Get messages between two users
router.get('/:userId', authMiddleware, async (req, res) => {
  try {
    const messages = await Message.find({
      $or: [
        { senderId: req.userId, receiverId: req.params.userId },
        { senderId: req.params.userId, receiverId: req.userId }
      ]
    }).sort({ timestamp: 1 });

    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// Save message to DB (optional - Socket.io handles real-time)
router.post('/', authMiddleware, async (req, res) => {
  try {
    const { receiverId, message } = req.body;

    const newMessage = new Message({
      senderId: req.userId,
      receiverId,
      message,
      timestamp: new Date(),
      read: false
    });

    await newMessage.save();
    res.json(newMessage);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
