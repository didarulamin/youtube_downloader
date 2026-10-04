// Base domains; subdomains (www., m., vm., web., music.) are allowed too.
const DOMAINS = ['youtube.com', 'youtu.be', 'facebook.com', 'fb.watch', 'instagram.com', 'tiktok.com'];

export function isSupportedUrl(url) {
  try {
    const u = new URL(url);
    return (
      (u.protocol === 'https:' || u.protocol === 'http:') &&
      DOMAINS.some((d) => u.hostname === d || u.hostname.endsWith(`.${d}`))
    );
  } catch {
    return false;
  }
}

// One entry per distinct resolution (best size estimate) + MP3. Resolution is the
// shorter side, like yt-dlp's `res` sort, so portrait 720x1280 (TikTok) is 720p.
export function pickFormats(info) {
  const byRes = new Map();
  for (const f of info.formats ?? []) {
    if (!f.height || f.vcodec === 'none') continue;
    const res = Math.min(f.width ?? f.height, f.height);
    const size = f.filesize ?? f.filesize_approx ?? 0;
    byRes.set(res, Math.max(byRes.get(res) ?? 0, size));
  }
  const video = [...byRes]
    .sort((a, b) => b[0] - a[0])
    .map(([height, size]) => ({ type: 'video', height, label: `${height}p`, size: size || null }));
  // Some sites (Facebook) don't report resolutions; offer yt-dlp's best pick instead.
  if (!video.length) video.push({ type: 'best', label: 'Best quality' });
  return [...video, { type: 'mp3', label: 'MP3' }];
}

// Turns one line of `yt-dlp --newline` output into a progress event, or null.
export function parseProgress(line) {
  const m = line.match(/^\[download\]\s+([\d.]+)%(?:.*?\bat\s+(\S+))?(?:.*?\bETA\s+(\S+))?/);
  if (m) return { stage: 'download', percent: Number(m[1]), speed: m[2], eta: m[3] };
  if (line.startsWith('[download] Destination:')) return { stage: 'part' };
  if (line.startsWith('[Merger]')) return { stage: 'merging' };
  if (line.startsWith('[ExtractAudio]')) return { stage: 'converting' };
  return null;
}
