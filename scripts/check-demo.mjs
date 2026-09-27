import {readFile,writeFile} from 'node:fs/promises';
import {spawnSync} from 'node:child_process';
import assert from 'node:assert/strict';

const ffmpeg=process.env.FFMPEG_PATH||'ffmpeg';
const timeline=JSON.parse(await readFile('docs/demo-timeline.json','utf8'));
assert(timeline.chapters.length>=10);
let previous=0;
for(const chapter of timeline.chapters){
  assert(Math.abs(chapter.start-previous)<.001,'Gap between chapters');
  assert(chapter.end>chapter.start);previous=chapter.end;
}
const results=[];
for(const file of ['public/landing/demo.mp4','docs/landing-demo.webm']){
  const process=spawnSync(ffmpeg,['-hide_banner','-i',file,'-vf','blackdetect=d=0.15:pix_th=0.10,freezedetect=n=-60dB:d=2.5','-an','-f','null','-'],{encoding:'utf8'});
  assert.equal(process.status,0,process.error?.message||process.stderr);
  assert(!process.stderr.includes('black_start:'),`${file}: black gap detected`);
  assert(!process.stderr.includes('freeze_start:'),`${file}: unchanged interval longer than 2.5 seconds`);
  const match=process.stderr.match(/Duration: (\d+):(\d+):([\d.]+)/);
  assert(match,`${file}: duration missing`);
  const duration=Number(match[1])*3600+Number(match[2])*60+Number(match[3]);
  assert(Math.abs(duration-timeline.duration)<.1,`${file}: timeline and encoding durations differ`);
  results.push(`${file}: ${duration.toFixed(2)} seconds; decode passed; no black gaps >= 0.15s; no detected freezes >= 2.5s.`);
}
const report=`Video verification\n${timeline.chapters.length} contiguous scenes, ${timeline.width}×${timeline.height}, ${timeline.fps} fps.\n${results.join('\n')}\n`;
await writeFile('docs/demo-video-check.txt',report);console.log(report);
