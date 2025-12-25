const GroupMessage = require('../models/GroupMessage');
const Meeting = require('../models/Meeting');
const mongoose = require('mongoose');

module.exports = (io, socket) => {
  // ✅ JOIN GROUP
  socket.on('join-group', (data) => {
    const { groupId, userId } = data;
    const roomName = `group-${groupId}`;

    socket.join(roomName);
    io.to(roomName).emit('user-joined-group', {
      userId,
      timestamp: new Date(),
    });

    console.log(`User ${userId} joined group ${groupId}`);
  });

  // ✅ SEND GROUP MESSAGE
  socket.on('group-message', async (data) => {
    try {
      const { groupId, senderId, text, senderName, senderPhoto } = data;
      const roomName = `group-${groupId}`;

      // Save to database
      const message = new GroupMessage({
        _id: new mongoose.Types.ObjectId(),
        groupId,
        senderId,
        text,
      });

      await message.save();

      // Broadcast to group
      io.to(roomName).emit('group-message-received', {
        _id: message._id,
        groupId,
        senderId,
        senderName,
        senderPhoto,
        text,
        createdAt: new Date(),
      });
    } catch (error) {
      console.error('Error saving group message:', error);
    }
  });

  // ✅ START GROUP MEETING
  socket.on('start-group-meeting', async (data) => {
    try {
      const { groupId, userId, roomId } = data;
      const meetingRoomName = `meeting-${roomId}`;

      // Create meeting record
      const meeting = new Meeting({
        _id: new mongoose.Types.ObjectId(),
        roomId,
        groupId,
        initiatorId: userId,
        participants: [{ userId, joinedAt: new Date() }],
      });

      await meeting.save();

      socket.join(meetingRoomName);

      // Notify group members
      io.to(`group-${groupId}`).emit('group-meeting-started', {
        roomId,
        initiatorId: userId,
        initiatorName: data.userName,
        timestamp: new Date(),
      });

      console.log(`Meeting started in group ${groupId}`);
    } catch (error) {
      console.error('Error starting meeting:', error);
    }
  });

  // ✅ JOIN GROUP MEETING
  socket.on('join-group-meeting', async (data) => {
    try {
      const { roomId, userId } = data;
      const meetingRoomName = `meeting-${roomId}`;

      socket.join(meetingRoomName);

      // Update participant list
      await Meeting.findOneAndUpdate(
        { roomId },
        {
          $push: {
            'participants': {
              userId,
              joinedAt: new Date(),
            },
          },
        }
      );

      io.to(meetingRoomName).emit('participant-joined', {
        userId,
        userName: data.userName,
        timestamp: new Date(),
      });

      console.log(`User ${userId} joined meeting ${roomId}`);
    } catch (error) {
      console.error('Error joining meeting:', error);
    }
  });

  // ✅ LEAVE GROUP MEETING
  socket.on('leave-group-meeting', async (data) => {
    try {
      const { roomId, userId } = data;
      const meetingRoomName = `meeting-${roomId}`;

      await Meeting.findOneAndUpdate(
        { roomId, 'participants.userId': userId },
        {
          $set: { 'participants.$.leftAt': new Date() },
        }
      );

      io.to(meetingRoomName).emit('participant-left', {
        userId,
        timestamp: new Date(),
      });

      socket.leave(meetingRoomName);
    } catch (error) {
      console.error('Error leaving meeting:', error);
    }
  });

  // ✅ END GROUP MEETING
  socket.on('end-group-meeting', async (data) => {
    try {
      const { roomId } = data;
      const meetingRoomName = `meeting-${roomId}`;

      const now = new Date();
      const meeting = await Meeting.findOne({ roomId });

      if (meeting) {
        meeting.endTime = now;
        meeting.status = 'ended';
        meeting.duration = Math.floor(
          (meeting.endTime - meeting.startTime) / 60000
        );
        await meeting.save();
      }

      io.to(meetingRoomName).emit('group-meeting-ended', {
        roomId,
        timestamp: now,
      });

      io.socketsLeave(meetingRoomName);
    } catch (error) {
      console.error('Error ending meeting:', error);
    }
  });

  // ✅ LEAVE GROUP
  socket.on('leave-group', (data) => {
    const { groupId, userId } = data;
    const roomName = `group-${groupId}`;

    socket.leave(roomName);
    io.to(roomName).emit('user-left-group', {
      userId,
      timestamp: new Date(),
    });
  });
};
