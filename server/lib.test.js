import { test } from 'node:test';
import assert from 'node:assert/strict';
import { isYoutubeUrl, pickFormats, parseProgress } from './lib.js';

test('parseProgress', () => {
  assert.deepEqual(parseProgress('[download]  45.3% of    8.00MiB at    2.10MiB/s ETA 00:03'), {
    stage: 'download', percent: 45.3, speed: '2.10MiB/s', eta: '00:03',
  });
  assert.deepEqual(parseProgress('[download] 100% of    8.00MiB in 00:00:02 at 3.5MiB/s'), {
    stage: 'download', percent: 100, speed: '3.5MiB/s', eta: undefined,
  });
  assert.equal(parseProgress('[download] Destination: /tmp/x.f399.mp4').stage, 'part');
  assert.equal(parseProgress('[Merger] Merging formats into "x.mp4"').stage, 'merging');
  assert.equal(parseProgress('[ExtractAudio] Destination: x.mp3').stage, 'converting');
  assert.equal(parseProgress('[youtube] dQw4w9WgXcQ: Downloading webpage'), null);
});

test('isYoutubeUrl', () => {
  assert.ok(isYoutubeUrl('https://youtu.be/dQw4w9WgXcQ'));
  assert.ok(isYoutubeUrl('https://www.youtube.com/watch?v=dQw4w9WgXcQ'));
  assert.ok(isYoutubeUrl('https://music.youtube.com/watch?v=x'));
  assert.ok(!isYoutubeUrl('https://evil.com/youtube.com'));
  assert.ok(!isYoutubeUrl('https://youtube.com.evil.com/'));
  assert.ok(!isYoutubeUrl('--exec=rm'));
  assert.ok(!isYoutubeUrl('file:///etc/passwd'));
});

test('pickFormats', () => {
  const formats = pickFormats({
    formats: [
      { height: 360, vcodec: 'avc1', filesize: 10 },
      { height: 360, vcodec: 'vp9', filesize: 20 },
      { height: 1080, vcodec: 'avc1', filesize_approx: 99 },
      { vcodec: 'none', acodec: 'opus' },
      { height: 720, vcodec: 'none' },
    ],
  });
  assert.deepEqual(formats.map((f) => f.label), ['1080p', '360p', 'MP3']);
  assert.equal(formats[0].size, 99);
  assert.equal(formats[1].size, 20);
});
