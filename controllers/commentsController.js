const Comment = require('../models/Comment'); // Import Comment model
const Video = require('../models/video');  // Import Video model (for updating comment count)

// Fetch all comments for a specific video
const getCommentsForVideo = async (req, res) => {
  const { videoId } = req.params;
  try {
    const comments = await Comment.find({ video_id: videoId }).populate('user_id', 'name'); // Populate user name
    res.status(200).json(comments);
  } catch (error) {
    res.status(500).json({ message: "Error fetching comments", error });
  }
};

// Submit a new comment
const submitComment = async (req, res) => {
  const { text, videoId, user_id, name, date } = req.body;

  // Validate required fields
  if (!text || !videoId || !user_id || !name) {
    return res.status(400).json({ message: "Missing required fields" });
  }

  try {
    const newComment = new Comment({
      text,
      video_id: videoId,
      user_id,
      name,
      date: date || new Date(), // Use current date if not provided
    });

    await newComment.save();

    // Optionally, increment the comment count for the video (if needed)
    await Video.findByIdAndUpdate(videoId, { $inc: { commentCount: 1 } });

    console.log("New comment saved:", newComment); // Log the saved comment for debugging
    res.status(201).json({ message: "Comment added successfully", comment: newComment });
  } catch (error) {
    console.error("Error adding comment:", error); // Log the error for debugging
    res.status(500).json({ 
      message: "Error adding comment", 
      error: error.message || error 
    });
  }
};

module.exports = {
  getCommentsForVideo,
  submitComment,
};
