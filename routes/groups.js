const express = require('express');
const router = express.Router();
const auth = require('../middleware/auth');
const Group = require('../models/Group');
const GroupMessage = require('../models/GroupMessage');
const mongoose = require('mongoose');

// ✅ CREATE GROUP
router.post('/create', auth, async (req, res) => {
  try {
    const { name, description, image } = req.body;
    const userId = req.userId;

    const group = new Group({
      _id: new mongoose.Types.ObjectId(),
      name,
      description,
      image,
      createdBy: userId,
      members: [userId],
      admins: [userId],
    });

    await group.save();
    res.status(201).json(group);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ✅ GET ALL GROUPS FOR USER
router.get('/my-groups', auth, async (req, res) => {
  try {
    const groups = await Group.find({ members: req.userId })
      .populate('members', 'name profilePhoto')
      .populate('createdBy', 'name');

    res.json(groups);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ✅ GET GROUP DETAILS
router.get('/:groupId', auth, async (req, res) => {
  try {
    const group = await Group.findById(req.params.groupId)
      .populate('members', 'name profilePhoto email')
      .populate('admins', 'name');

    if (!group) return res.status(404).json({ message: 'Group not found' });
    res.json(group);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ✅ ADD MEMBER TO GROUP
router.post('/:groupId/add-member', auth, async (req, res) => {
  try {
    const { userId } = req.body;
    const group = await Group.findById(req.params.groupId);

    if (!group) return res.status(404).json({ message: 'Group not found' });

    // ✅ Only admin can add members
    if (!group.admins.includes(req.userId)) {
      return res.status(403).json({ message: 'Only admins can add members' });
    }

    if (!group.members.includes(userId)) {
      group.members.push(userId);
      await group.save();
    }

    res.json(group);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ✅ REMOVE MEMBER FROM GROUP
router.post('/:groupId/remove-member', auth, async (req, res) => {
  try {
    const { userId } = req.body;
    const group = await Group.findById(req.params.groupId);

    if (!group) return res.status(404).json({ message: 'Group not found' });

    // ✅ Only admin can remove members (or user can remove themselves)
    if (!group.admins.includes(req.userId) && req.userId !== userId) {
      return res.status(403).json({ message: 'Unauthorized' });
    }

    group.members = group.members.filter(
      (m) => m.toString() !== userId.toString()
    );
    await group.save();

    res.json(group);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

// ✅ GET GROUP MESSAGES
router.get('/:groupId/messages', auth, async (req, res) => {
  try {
    const messages = await GroupMessage.find({ groupId: req.params.groupId })
      .populate('senderId', 'name profilePhoto')
      .sort({ createdAt: 1 })
      .limit(100);

    res.json(messages);
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
});

module.exports = router;
