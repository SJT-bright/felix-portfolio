import assert from "node:assert/strict";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import test from "node:test";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const ffprobe = process.env.FFPROBE_PATH || "ffprobe";
const ffmpeg = process.env.FFMPEG_PATH || "ffmpeg";

async function readAudioStreams(relativePath) {
  const absolutePath = fileURLToPath(new URL(relativePath, import.meta.url));
  let stdout;
  try {
    ({ stdout } = await execFileAsync(ffprobe, [
      "-v", "error",
      "-select_streams", "a",
      "-show_entries", "stream=index,codec_type,codec_name,sample_rate,channels,channel_layout:stream_disposition=default:stream_tags=name",
      "-of", "json",
      absolutePath,
    ]));
  } catch (error) {
    assert.fail(`ffprobe could not inspect ${relativePath}: ${error.message}`);
  }
  return JSON.parse(stdout).streams ?? [];
}

async function readDefaultTrackMeanVolume(relativePath) {
  const absolutePath = fileURLToPath(new URL(relativePath, import.meta.url));
  let stderr;
  try {
    ({ stderr } = await execFileAsync(ffmpeg, [
      "-hide_banner",
      "-nostats",
      "-i", absolutePath,
      "-map", "0:a:0",
      "-af", "volumedetect",
      "-f", "null",
      "-",
    ], { maxBuffer: 2_000_000 }));
  } catch (error) {
    stderr = error.stderr;
    if (!stderr) assert.fail(`ffmpeg could not measure ${relativePath}: ${error.message}`);
  }
  const match = String(stderr).match(/mean_volume:\s*(-?\d+(?:\.\d+)?)\s*dB/i);
  assert.ok(match, `ffmpeg did not report mean volume for ${relativePath}`);
  return Number(match[1]);
}

function assertAudibleStereoAac(stream, label) {
  assert.equal(stream.codec_type, "audio", `${label} must be an audio stream`);
  assert.equal(stream.codec_name, "aac", `${label} must remain browser-compatible AAC`);
  assert.equal(stream.channels, 2, `${label} must remain stereo`);
  assert.ok(Number(stream.sample_rate) >= 44_100, `${label} sample rate must be at least 44.1 kHz`);
}

test("every production video family contains a real browser-playable BGM track", async () => {
  const [hero, portfolio, projects, heroMeanVolume, portfolioMeanVolume, projectMeanVolume] = await Promise.all([
    readAudioStreams("../assets/wormhole-home-with-audio.mp4"),
    readAudioStreams("../assets/portfolio-entry-transition-with-bgm.mp4"),
    readAudioStreams("../assets/sailing-august-9.mp4"),
    readDefaultTrackMeanVolume("../assets/wormhole-home-with-audio.mp4"),
    readDefaultTrackMeanVolume("../assets/portfolio-entry-transition-with-bgm.mp4"),
    readDefaultTrackMeanVolume("../assets/sailing-august-9.mp4"),
  ]);

  assert.equal(hero.length, 1, "Hero must contain its original BGM track");
  assertAudibleStereoAac(hero[0], "Hero BGM");
  assert.equal(hero[0].disposition.default, 1, "Hero BGM must be the default track");
  assert.equal(hero[0].tags?.name, "Original BGM");

  assert.equal(portfolio.length, 2, "Portfolio transition must retain the supplied original track beside its BGM");
  assertAudibleStereoAac(portfolio[0], "Portfolio cinematic BGM");
  assertAudibleStereoAac(portfolio[1], "Portfolio preserved original audio");
  assert.equal(portfolio[0].disposition.default, 1, "Portfolio cinematic BGM must be the default track");
  assert.equal(portfolio[0].tags?.name, "Cinematic BGM");
  assert.equal(portfolio[1].disposition.default, 0);
  assert.equal(portfolio[1].tags?.name, "Original audio");

  assert.equal(projects.length, 1, "Project-card media must retain its BGM track");
  assertAudibleStereoAac(projects[0], "Project-card BGM");
  assert.equal(projects[0].disposition.default, 1, "Project-card BGM must be the default track");

  for (const [label, meanVolume] of [
    ["Hero BGM", heroMeanVolume],
    ["Portfolio cinematic BGM", portfolioMeanVolume],
    ["Project-card BGM", projectMeanVolume],
  ]) {
    assert.ok(meanVolume > -55, `${label} is effectively silent at ${meanVolume} dB`);
  }
});
