const mongoose = require('mongoose');

const groupMessageSchema = new mongoose.Schema({
  _id: mongoose.Schema.Types.ObjectId,
  groupId: { type: mongoose.Schema.Types.ObjectId, ref: 'Group', required: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
  text: String,
  image: String,
  video: String,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model('GroupMessage', groupMessageSchema);
