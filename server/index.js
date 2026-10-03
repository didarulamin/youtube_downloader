import express from 'express';
import youtubedl from 'youtube-dl-exec';
import { mkdtemp, readdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { randomUUID } from 'node:crypto';
import { createInterface } from 'node:readline';
import { isYoutubeUrl, pickFormats, parseProgress } from './lib.js';

const app = express();
const PORT = process.env.PORT || 3000;
const dist = path.join(path.dirname(fileURLToPath(import.meta.url)), '../client/dist');

const errMsg = (e) => (e.stderr || e.message || 'Unknown error').trim().split('\n').pop();

// yt-dlp needs a JS runtime for YouTube; reuse the Node running this server.
const BASE_FLAGS = { noPlaylist: true, noWarnings: true, jsRuntimes: `node:${process.execPath}` };

app.get('/api/info', async (req, res) => {
  const { url } = req.query;
  if (!isYoutubeUrl(url)) return res.status(400).json({ error: 'Invalid YouTube URL' });
  try {
    const info = await youtubedl(url, { ...BASE_FLAGS, dumpSingleJson: true });
    res.json({
      id: info.id,
      title: info.title,
      thumbnail: info.thumbnail,
      duration: info.duration,
      uploader: info.uploader,
      formats: pickFormats(info),
    });
  } catch (e) {
    res.status(500).json({ error: errMsg(e) });
  }
});

// Prepared files waiting to be fetched: id -> { dir, file }.
const ready = new Map();
const FILE_TTL = 10 * 60 * 1000;

// TTL timers don't survive restarts, so clear files left by a previous run.
for (const d of await readdir(tmpdir())) {
  if (d.startsWith('ytdl-')) await rm(path.join(tmpdir(), d), { recursive: true, force: true });
}

// ponytail: no concurrency/rate limit; add a queue before exposing publicly.
// Step 1: SSE stream of yt-dlp progress; ends with { stage: 'done', id }.
app.get('/api/prepare', async (req, res) => {
  const { url, type } = req.query;
  const height = Number(req.query.height);
  if (!isYoutubeUrl(url)) return res.status(400).json({ error: 'Invalid YouTube URL' });
  if (type !== 'mp3' && !(Number.isInteger(height) && height > 0)) {
    return res.status(400).json({ error: 'Invalid height' });
  }

  res.set({ 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache', Connection: 'keep-alive' });
  res.flushHeaders();
  // Proxies (Cloudflare: 100s) drop idle responses; keep the stream alive.
  const ping = setInterval(() => res.write(': ping\n\n'), 15000);
  const send = (data) => res.write(`data: ${JSON.stringify(data)}\n\n`);
  const tag = `[${type === 'mp3' ? 'mp3' : `${height}p`} ${url}]`;

  // yt-dlp can't merge/convert to stdout, so download to a temp dir then send.
  const dir = await mkdtemp(path.join(tmpdir(), 'ytdl-'));
  const cleanup = () => rm(dir, { recursive: true, force: true });
  const proc = youtubedl.exec(url, {
    newline: true,
    ...BASE_FLAGS,
    output: path.join(dir, '%(title)s.%(ext)s'),
    ...(type === 'mp3'
      ? { extractAudio: true, audioFormat: 'mp3' }
      : { format: 'bv*+ba/b', formatSort: `res:${height},vcodec:h264,acodec:m4a`, mergeOutputFormat: 'mp4' }),
  });

  let done = false;
  res.on('close', () => {
    clearInterval(ping);
    if (!done) {
      console.log(tag, 'client disconnected, aborting');
      proc.kill();
    }
  });

  let part = 0;
  let lastLogged = -1;
  console.log(tag, 'preparing');
  createInterface({ input: proc.stdout }).on('line', (line) => {
    const p = parseProgress(line);
    if (!p) return;
    if (p.stage === 'part') return void part++;
    if (p.stage === 'download') {
      p.part = part;
      const step = Math.floor(p.percent / 10);
      if (step === lastLogged) return void send(p);
      lastLogged = step;
    } else {
      lastLogged = -1;
    }
    console.log(tag, line);
    send(p);
  });

  try {
    await proc;
    const [file] = await readdir(dir);
    const id = randomUUID();
    ready.set(id, { dir, file });
    // Delete if the client never fetches it.
    setTimeout(() => ready.delete(id) && cleanup(), FILE_TTL).unref();
    console.log(tag, 'ready:', file);
    send({ stage: 'done', id });
  } catch (e) {
    await cleanup();
    if (!res.destroyed) {
      console.error(tag, 'failed:', errMsg(e));
      send({ stage: 'error', error: errMsg(e) });
    }
  }
  done = true;
  res.end();
});

// Step 2: hand over the prepared file once, then delete it.
app.get('/api/file/:id', (req, res) => {
  const job = ready.get(req.params.id);
  if (!job) return res.status(404).json({ error: 'File expired or not found' });
  ready.delete(req.params.id);
  res.download(path.join(job.dir, job.file), job.file, () => rm(job.dir, { recursive: true, force: true }));
});

app.use(express.static(dist));

const HOST = process.env.HOST; // unset = all interfaces
app.listen(PORT, HOST, () => console.log(`Server on http://${HOST || 'localhost'}:${PORT}`));
