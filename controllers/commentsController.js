const Comment = require('../models/Comment');
const Video   = require('../models/video');
const mongoose = require('mongoose');
const { createNotification } = require('./notificationController');

/**
 * GET /api/comments/:videoId/comments
 * Fetches all comments for a video, sorted newest-first.
 * Accepts either a MongoDB ObjectId or a shortCode as the videoId parameter.
 */
const getCommentsForVideo = async (req, res) => {
  let { videoId } = req.params;
  console.log(`[getCommentsForVideo] Fetching comments for: ${videoId}`);

  try {
    let resolvedVideoId = videoId;

    // If not a valid ObjectId, treat it as a shortCode and resolve to _id
    if (!mongoose.Types.ObjectId.isValid(videoId)) {
      console.log(`[getCommentsForVideo] '${videoId}' is not a valid ObjectId, searching by shortCode...`);
      const video = await Video.findOne({ shortCode: videoId }).select('_id');
      if (!video) {
        console.warn(`[getCommentsForVideo] Video not found for identifier: ${videoId}`);
        return res.status(404).json({ message: 'Video not found' });
      }
      resolvedVideoId = video._id;
      console.log(`[getCommentsForVideo] Resolved shortCode to _id: ${resolvedVideoId}`);
    }

    const comments = await Comment.find({ video_id: resolvedVideoId })
      .populate('user_id', 'name profileIcon')
      .sort({ date: -1 });

    console.log(`[getCommentsForVideo] Found ${comments.length} comments.`);
    res.status(200).json(comments);

  } catch (error) {
    console.error('[getCommentsForVideo] Critical Error:', error);
    res.status(500).json({ message: 'Error fetching comments', error: error.message });
  }
};

/**
 * POST /api/comments/:videoId/comments
 * Submits a new comment (or reply) on a video.
 * Sends notifications to:
 *   - The parent comment author (if this is a reply)
 *   - The video owner (for top-level comments, or replies not targeting the owner)
 * Body: { text, videoId, user_id, name, date?, parentId? }
 */
const submitComment = async (req, res) => {
  let { text, videoId, user_id, name, date, parentId } = req.body;

  if (!text || !videoId || !user_id || !name) {
    return res.status(400).json({
      message: 'Missing required fields',
      details: { text: !!text, videoId: !!videoId, user_id: !!user_id, name: !!name },
    });
  }

  try {
    // Resolve shortCode to ObjectId if needed
    if (!mongoose.Types.ObjectId.isValid(videoId)) {
      const video = await Video.findOne({ shortCode: videoId });
      if (!video) return res.status(404).json({ message: 'Video not found' });
      videoId = video._id;
    }

    const newComment = new Comment({
      text,
      video_id: videoId,
      user_id,
      name,
      date:     date || new Date(),
      parentId: parentId || null,
    });
    await newComment.save();

    // Increment comment count on the video and populate the owner for notifications
    const video = await Video.findByIdAndUpdate(videoId, { $inc: { commentCount: 1 } }).populate('userId');

    // Notify parent comment author (if this is a reply and not self-replying)
    let parentComment = null;
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

    // Notify video owner for top-level comments, or replies that don't target the owner
    if (video && video.userId && video.userId._id.toString() !== user_id.toString()) {
      const isReplyToOwner = parentId && parentComment && parentComment.user_id.toString() === video.userId._id.toString();
      if (!isReplyToOwner) {
        await createNotification(
          video.userId._id,
          'comment',
          `${name} commented on your video "${video.title}"`,
          `/video/${video.shortCode}`
        );
      }
    }

    res.status(201).json({ message: 'Comment added successfully', comment: newComment });
  } catch (error) {
    console.error('Error adding comment:', error);
    res.status(500).json({ message: 'Error adding comment', error: error.message });
  }
};

/**
 * PUT /api/comments/:commentId/like  [protected]
 * Toggles a like on a comment. Automatically removes a dislike if one exists.
 */
const likeComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user._id;

    const comment = await Comment.findById(commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    if (comment.dislikes.includes(userId)) comment.dislikes.pull(userId); // Remove conflicting dislike
    if (comment.likes.includes(userId)) {
      comment.likes.pull(userId);  // Unlike
    } else {
      comment.likes.push(userId);  // Like
    }

    await comment.save();
    res.status(200).json(comment);
  } catch (error) {
    res.status(500).json({ message: 'Error liking comment', error: error.message });
  }
};

/**
 * PUT /api/comments/:commentId/dislike  [protected]
 * Toggles a dislike on a comment. Automatically removes a like if one exists.
 */
const dislikeComment = async (req, res) => {
  try {
    const { commentId } = req.params;
    const userId = req.user._id;

    const comment = await Comment.findById(commentId);
    if (!comment) return res.status(404).json({ message: 'Comment not found' });

    if (comment.likes.includes(userId)) comment.likes.pull(userId); // Remove conflicting like
    if (comment.dislikes.includes(userId)) {
      comment.dislikes.pull(userId); // Undislike
    } else {
      comment.dislikes.push(userId); // Dislike
    }

    await comment.save();
    res.status(200).json(comment);
  } catch (error) {
    res.status(500).json({ message: 'Error disliking comment', error: error.message });
  }
};

module.exports = { getCommentsForVideo, submitComment, likeComment, dislikeComment };
