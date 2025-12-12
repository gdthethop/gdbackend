const Comment = require('../models/Comment'); // Import Comment model
const Video = require('../models/video');  // Import Video model (for updating comment count)
const mongoose = require('mongoose');
const { createNotification } = require('./notificationController');

// Fetch all comments for a specific video
// Fetch all comments for a specific video
const getCommentsForVideo = async (req, res) => {
  let { videoId } = req.params;
  console.log(`[getCommentsForVideo] Fetching comments for: ${videoId}`);

  try {
    let resolvedVideoId = videoId;

    // Check if valid ObjectId
    if (!mongoose.Types.ObjectId.isValid(videoId)) {
      console.log(`[getCommentsForVideo] '${videoId}' is not a valid ObjectId, searching by shortCode...`);
      const video = await Video.findOne({ shortCode: videoId }).select('_id');

      if (!video) {
        console.warn(`[getCommentsForVideo] Video not found for identifier: ${videoId}`);
        return res.status(404).json({ message: "Video not found" });
      }
      resolvedVideoId = video._id;
      console.log(`[getCommentsForVideo] Resolved shortCode to _id: ${resolvedVideoId}`);
    }

    // Fetch comments
    const comments = await Comment.find({ video_id: resolvedVideoId })
      .populate('user_id', 'name profileIcon')
      .sort({ date: -1 }); // Sort by newest first

    console.log(`[getCommentsForVideo] Found ${comments.length} comments.`);
    res.status(200).json(comments);

  } catch (error) {
    console.error("[getCommentsForVideo] Critical Error:", error);
    res.status(500).json({
      message: "Error fetching comments",
      error: error.message,
      // Include stack trace only if needed/safe (usually strictly dev)
      details: error.toString()
    });
  }
};

// Submit a new comment
const submitComment = async (req, res) => {
  let { text, videoId, user_id, name, date, parentId } = req.body;

  // Validate required fields
  if (!text || !videoId || !user_id || !name) {

    return res.status(400).json({
      message: "Missing required fields",
      details: { text: !!text, videoId: !!videoId, user_id: !!user_id, name: !!name }
    });
  }

  try {
    // Resolve videoId if it's a shortCode
    if (!mongoose.Types.ObjectId.isValid(videoId)) {
      const video = await Video.findOne({ shortCode: videoId });
      if (!video) {
        return res.status(404).json({ message: "Video not found" });
      }
      videoId = video._id;
    }

    const newComment = new Comment({
      text,
      video_id: videoId,
      user_id,
      name,
      date: date || new Date(), // Use current date if not provided
      parentId: parentId || null
    });

    await newComment.save();

    // Optionally, increment the comment count for the video (if needed)
    const video = await Video.findByIdAndUpdate(videoId, { $inc: { commentCount: 1 } }).populate('userId');

    // Notifications
    let parentComment = null;
    // 1. If replying to a comment, notify parent comment user
    if (parentId) {
      parentComment = await Comment.findById(parentId);
      if (parentComment && parentComment.user_id.toString() !== user_id.toString()) {
        await createNotification(
          parentComment.user_id,
          'comment',
          `${name} replied to your comment: "${text.substring(0, 30)}..."`,
          `/video/${video.shortCode}`
        );
      }
    }
    // 2. Notify Video Owner (if not self-comment)
    // Note: video.userId is the uploader
    if (video && video.userId && video.userId._id.toString() !== user_id.toString()) {
      // Avoid double notification if replying to owner's comment?
      // Logic: If I reply to Owner, Owner gets "Reply" notification. Should they also get "Comment on Video"? Maybe.
      // For now, let's just notify video owner if it's a top-level comment OR if we want to be chatty.
      // Let's only notify Video Owner for top-level comments or if they are NOT the parent comment owner.

      const isParentOwner = parentId && parentComment && parentComment.user_id.toString() === video.userId._id.toString();
      if (!isParentOwner) {
        await createNotification(
          video.userId._id,
          'comment',
          `${name} commented on your video "${video.title}"`,
          `/video/${video.shortCode}`
        );
      }
    }


    res.status(201).json({ message: "Comment added successfully", comment: newComment });
  } catch (error) {
    console.error("Error adding comment:", error); // Log the error for debugging
    res.status(500).json({
      message: "Error adding comment",
      error: error.message || error
    });
  }
};

const likeComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    // req.user from protect middleware
    const userId = req.user._id;

    const comment = await Comment.findById(commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    // Remove from dislikes if present
    if (comment.dislikes.includes(userId)) {
      comment.dislikes.pull(userId);
    }

    // Toggle like
    if (comment.likes.includes(userId)) {
      comment.likes.pull(userId); // Unlike
    } else {
      comment.likes.push(userId); // Like
    }

    await comment.save();
    res.status(200).json(comment);
  } catch (error) {
    res.status(500).json({ message: "Error liking comment", error: error.message });
  }
};

const dislikeComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user._id;

    const comment = await Comment.findById(commentId);
    if (!comment) return res.status(404).json({ message: "Comment not found" });

    // Remove from likes if present
    if (comment.likes.includes(userId)) {
      comment.likes.pull(userId);
    }

    // Toggle dislike
    if (comment.dislikes.includes(userId)) {
      comment.dislikes.pull(userId); // Undislike
    } else {
      comment.dislikes.push(userId); // Dislike
    }

    await comment.save();
    res.status(200).json(comment);
  } catch (error) {
    res.status(500).json({ message: "Error disliking comment", error: error.message });
  }
};

module.exports = {
  getCommentsForVideo,
  submitComment,
  likeComment,
  dislikeComment
};
