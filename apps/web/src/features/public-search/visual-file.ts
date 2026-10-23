const MAX_FILE_BYTES = 100 * 1024 * 1024;
const MAX_DIMENSION = 960;
const FRAME_QUALITY = 0.72;

const waitForEvent = <T extends HTMLMediaElement | HTMLImageElement>(
  element: T,
  successEvent: string,
  failureMessage: string,
  timeoutMs = 12000,
): Promise<T> => new Promise((resolve, reject) => {
  let timer = 0;
  const cleanup = () => {
    element.removeEventListener(successEvent, onSuccess);
    element.removeEventListener('error', onError);
    window.clearTimeout(timer);
  };
  const onSuccess = () => { cleanup(); resolve(element); };
  const onError = () => { cleanup(); reject(new Error(failureMessage)); };
  element.addEventListener(successEvent, onSuccess, { once: true });
  element.addEventListener('error', onError, { once: true });
  timer = window.setTimeout(() => {
    cleanup();
    reject(new Error('Media decoding timed out. Try a smaller file or a common MP4, WebM, JPEG, PNG, or WebP format.'));
  }, timeoutMs);
});

const makeFrame = (source: CanvasImageSource, width: number, height: number) => {
  if (!width || !height) throw new Error('This media has no readable image dimensions.');
  const scale = Math.min(1, MAX_DIMENSION / Math.max(width, height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(1, Math.round(width * scale));
  canvas.height = Math.max(1, Math.round(height * scale));
  const context = canvas.getContext('2d', { alpha: false });
  if (!context) throw new Error('Your browser could not prepare this media for analysis.');
  context.drawImage(source, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', FRAME_QUALITY);
};

const decodeImage = async (url: string): Promise<HTMLImageElement> => {
  const image = new Image();
  image.decoding = 'async';
  image.src = url;
  if (typeof image.decode === 'function') {
    try { await image.decode(); } catch {
      throw new Error('ADVERSE could not decode this image. Try JPEG, PNG, or WebP.');
    }
  } else if (!image.complete || !image.naturalWidth) {
    await waitForEvent(image, 'load', 'ADVERSE could not decode this image. Try JPEG, PNG, or WebP.');
  }
  if (!image.naturalWidth || !image.naturalHeight) {
    throw new Error('This image appears empty or unreadable. Try another image.');
  }
  return image;
};

const seekVideo = async (video: HTMLVideoElement, time: number) => {
  const target = Math.max(0, Math.min(time, Math.max(0, video.duration - 0.05)));
  if (Math.abs(video.currentTime - target) > 0.025) {
    const seeked = waitForEvent(video, 'seeked', 'ADVERSE could not decode a video frame. Try MP4 or WebM.');
    video.currentTime = target;
    await seeked;
  }
  if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
    await waitForEvent(video, 'loadeddata', 'ADVERSE could not read video frame data.');
  }
  if (!video.videoWidth || !video.videoHeight) {
    throw new Error('This video has no readable frames. Try another clip.');
  }
};

const decodeVideo = async (url: string): Promise<string[]> => {
  const video = document.createElement('video');
  video.preload = 'auto';
  video.muted = true;
  video.playsInline = true;
  video.src = url;
  try {
    await waitForEvent(video, 'loadedmetadata', 'ADVERSE could not open this video. Try MP4 or WebM.');
    if (!Number.isFinite(video.duration) || video.duration <= 0) {
      throw new Error('This video has no readable duration or contains no frames.');
    }
    if (video.readyState < HTMLMediaElement.HAVE_CURRENT_DATA) {
      await waitForEvent(video, 'loadeddata', 'ADVERSE could not decode the video. Try MP4 or WebM.');
    }
    const duration = video.duration;
    const positions = [...new Set([
      Math.min(duration * 0.15, Math.max(0, duration - 0.05)),
      Math.min(duration * 0.5, Math.max(0, duration - 0.05)),
      Math.min(duration * 0.85, Math.max(0, duration - 0.05)),
    ])];
    const frames: string[] = [];
    for (const position of positions) {
      await seekVideo(video, position);
      frames.push(makeFrame(video, video.videoWidth, video.videoHeight));
    }
    if (!frames.length) throw new Error('No readable video frames were extracted.');
    return frames;
  } finally {
    video.pause();
    video.removeAttribute('src');
    video.load();
  }
};

/**
 * Normalize browser-supported image uploads and sample several video frames.
 * The API receives only compressed JPEG data URLs, never the original file.
 */
export const compressVisualFile = async (file: File): Promise<string[]> => {
  if (!file || !file.size) throw new Error('Choose a non-empty image or video file first.');
  if (file.size > MAX_FILE_BYTES) throw new Error('This file is over 100 MB. Choose a smaller image or video clip.');
  const isImage = file.type.startsWith('image/');
  const isVideo = file.type.startsWith('video/');
  if (!isImage && !isVideo) {
    throw new Error('Unsupported file type. Choose a browser-readable image or video (JPEG, PNG, WebP, MP4, or WebM).');
  }
  const sourceUrl = URL.createObjectURL(file);
  try {
    if (isVideo) return await decodeVideo(sourceUrl);
    const image = await decodeImage(sourceUrl);
    return [makeFrame(image, image.naturalWidth, image.naturalHeight)];
  } finally {
    URL.revokeObjectURL(sourceUrl);
  }
};
