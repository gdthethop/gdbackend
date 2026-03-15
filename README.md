# GdPlayer Backend API

> **Version:** 1.3.1
> **Status:** Stable / Production Ready

## 🎯 Main Goal

The **GdPlayer Backend** is the powerhouse behind the applications streaming capabilities. Its primary goal is to provide a robust, scalable, and secure API that mimics the core functionalities of major platforms like YouTube and Netflix. It handles complex tasks such as secure authentication, high-performance video streaming, multi-part file uploads, and specific user interactions.

## 🚀 Key Features

### 🔐 Advanced Authentication & Security
- **JWT Authentication:** Secure stateless session management.
- **2FA & Email Verification:** Two-factor authentication support.
- **Secure Password Resets:** Email-based password recovery flows.
- **Role-Based Access:** Differential access for users, creators, and admins.

### 📹 Video Management & Streaming
- **Direct-to-S3 Uploads:** Efficient multipart uploads for large video files directly to AWS S3.
- **Thumbnail Generation:** Automated thumbnail processing.
- **HLS / Adaptive Streaming:** Support for modern streaming protocols.
- **Playlist Management:** Create, update, and manage private/public playlists.

### 💾 Data & Social
- **MongoDB Integration:** Efficient schema design for Users, Videos, Comments, and Playlists.
- **Social Graph:** Subscriptions, Likes, Dislikes, and Comment threads.
- **Notifications System:** Real-time user alerts and updates.
- **History & Analytics:** Tracking user watch history and basic analytics.

## 🛠️ Tech Stack

- **Runtime:** Node.js
- **Framework:** Express.js
- **Database:** MongoDB (Mongoose)
- **Object Storage:** AWS S3 (handling video & image assets)
- **Deployment:** Vercel / Render / Docker ready

## 🔧 Installation & Setup

1. **Install Dependencies:**
   ```bash
   npm install
   ```

2. **Environment Configuration:**
   Create a `.env` file with the following keys:
   - `MONGO_URI`
   - `JWT_SECRET`
   - `AWS_ACCESS_KEY_ID` & `AWS_SECRET_ACCESS_KEY`
   - `AWS_BUCKET_NAME_VIDEOS` & `AWS_BUCKET_NAME_THUMBNAILS`
   - `EMAIL_USER` & `EMAIL_PASS` (for email notifications)

3. **Run Development Server:**
   ```bash
   npm start
   ```

## 📝 API Documentation

(Detailed endpoint documentation can be added here or generated via Swagger)

---
*Built with ❤️ by the GdPlayer Team*
