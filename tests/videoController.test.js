const request = require('supertest');
const express = require('express');
const videoRoutes = require('../routes/videos');
const app = express();

app.use(express.json());
app.use('/api/videos', videoRoutes);

describe('Video API Endpoints', () => {
  let createdVideoShortCode = null;

  it('should upload a new video and generate a shortCode', async () => {
    const response = await request(app)
      .post('/api/videos/upload')
      .send({
        title: 'Test Video',
        description: 'Test Description',
        link: 'http://example.com/video.mp4',
        genres: ['Test'],
        runtime: '3:00',
        cast: ['Actor 1'],
        thumbnail: 'http://example.com/thumb.jpg',
      });
    expect(response.statusCode).toBe(201);
    expect(response.body.video).toHaveProperty('shortCode');
    createdVideoShortCode = response.body.video.shortCode;
  });

  it('should fetch video by shortCode', async () => {
    const response = await request(app).get(`/api/videos/short/${createdVideoShortCode}`);
    expect(response.statusCode).toBe(200);
    expect(response.body).toHaveProperty('shortCode', createdVideoShortCode);
  });

  it('should return 404 for non-existent shortCode', async () => {
    const response = await request(app).get('/api/videos/short/invalidcode');
    expect(response.statusCode).toBe(404);
  });
});
