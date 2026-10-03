const HOSTS = new Set(['youtube.com', 'www.youtube.com', 'm.youtube.com', 'music.youtube.com', 'youtu.be']);

export function isYoutubeUrl(url) {
  try {
    const u = new URL(url);
    return (u.protocol === 'https:' || u.protocol === 'http:') && HOSTS.has(u.hostname);
  } catch {
    return false;
  }
}

// One entry per distinct video height (best size estimate at that height) + MP3.
export function pickFormats(info) {
  const byHeight = new Map();
  for (const f of info.formats ?? []) {
    if (!f.height || f.vcodec === 'none') continue;
    const size = f.filesize ?? f.filesize_approx ?? 0;
    byHeight.set(f.height, Math.max(byHeight.get(f.height) ?? 0, size));
  }
  const video = [...byHeight]
    .sort((a, b) => b[0] - a[0])
    .map(([height, size]) => ({ type: 'video', height, label: `${height}p`, size: size || null }));
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
