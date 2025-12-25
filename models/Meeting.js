const mongoose = require('mongoose');

const meetingSchema = new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  roomId: { type: String, unique: true, required: true },
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group' },
  initiatorId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  participants: [{ 
    userId: mongoose.Schema.Types.ObjectId,
    joinedAt: Date,
    leftAt: Date
  }],
  startTime: { type: Date, default: Date.now },
  endTime: Date,
  duration: Number, // minutes
  status: { type: String, enum: ['active', 'ended'], default: 'active' },
});

module.exports = mongoose.model('Meeting', meetingSchema);
