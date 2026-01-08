import { MediaType } from '../types';

// This function simulates the API call. 
// In a real scenario, you would use fetch() to call the user's configured BaseURL.
export const generateMedia = async (
  prompt: string, 
  settings: { apiKey: string; baseUrl: string; mediaType: MediaType }
): Promise<string> => {
  
  // Simulate network delay (2-5 seconds)
  const delay = Math.floor(Math.random() * 3000) + 2000;
  await new Promise((resolve) => setTimeout(resolve, delay));

  // If no API key is provided in Mock mode, we still succeed for demo purposes
  // In production code, you would validate the key.

  // Return a placeholder image or video based on type
  if (settings.mediaType === MediaType.VIDEO) {
    // Use a real MP4 for the video player controls to work (Chrome-friendly codec)
    // This is a sample video from a public CDN
    return "https://storage.googleapis.com/gtv-videos-bucket/sample/ForBiggerJoyrides.mp4";
  } else {
    // Random abstract image
    const seed = Math.floor(Math.random() * 1000);
    return `https://picsum.photos/seed/${seed}/1024/1024`;
  }
};