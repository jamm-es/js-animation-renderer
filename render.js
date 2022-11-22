import * as puppeteer from 'puppeteer';
import { program } from 'commander';
import fs from 'fs';
import { SingleBar } from "cli-progress";
import { execSync } from 'child_process';
import * as path from 'path';

program
  .name('render')
  .argument('<url>', 'URL of site to render')
  .option('-H, --headless', 'Run puppeteer headless')
  .option('-w, --width <width>', 'Width of viewport in pixels, defaults to 720')
  .option('-h, --height <height>', 'Height of viewport in pixels, defaults to 720')
  .option('-s, --scale <scale>', 'Scale the viewport by the given multiple, defaults to 1')
  .option('-l, --length <seconds>', 'Number of seconds to run animation, defaults to 60')
  .option('-f, --framerate <rate>', 'Number of frames to sample per second, defaults to 60')
  .option('-o, --output <path>', 'Path of directory to output frames to, defaults to ./frames/')
  .description('Renders a website with javascript animations (like d3, matter, etc) into a video by overriding JS\'s timing functions.')
  .action(async (url, options) => {
    const headless = options.headless !== undefined;
    const width = +(options.width ?? 720);
    const height = +(options.height ?? 720);
    const scale = +(options.scale ?? 1);
    const length = +(options.length ?? 60);
    const framerate = +(options.framerate ?? 60);
    const output = options.output ?? './frames/';

    // sanity check for if URL is valid
    try {
      new URL(url);
    }
    catch {
      console.log(`Invalid URL: ${url}`)
      console.log('Check if you forgot the protocol (https:// or http://');
      return;
    }

    // clear out output directory and remake it
    try {
      fs.rmSync(output, { recursive: true });
    }
    catch {
      // directory doesn't exist
    }
    fs.mkdirSync(output);
    console.log(`Made output directory at ${output}`);

    // load browser
    console.log('Please wait, loading page...');
    const browser = await puppeteer.launch({ headless: headless });
    const page = (await browser.pages())[0];


    // overriding all timing functions to be frame-synced - will be injected into page file
    await page.evaluateOnNewDocument(framerate => {
      // control window.currentTime
      window.curFrame = 0; // is a global
      window.currentTime = 0;
      performance.now = () => window.currentTime;
      window.msToFrame = ms => Math.ceil((ms)/(1000/framerate)); // elapsed milliseconds to frame number, is a global

      // override all timing functions to use an execution list that gets processed frame by frame
      window.timeouts = []; // is a global
      window.nextID = 0; // is a global
      setTimeout = (callback, timeout, ...args) => {
        console.log('settings', callback);
        timeouts.push({ at: msToFrame(window.currentTime+timeout), callback: callback, args: args, id: nextID });
        return nextID++;
      };
      clearTimeout = id => {
        timeouts = timeouts.filter(d => d.id !== id);
      };

      requestAnimationFrame = callback => {
        console.log('settings', callback);
        timeouts.push({ at: curFrame+1, callback: callback, args: [], id: nextID });
        return nextID++;
      };
      cancelAnimationFrame = id => {
        timeouts = timeouts.filter(d => d.id !== id);
      };

      window.intervals = []; // is a global
      setInterval = (callback, delay, ...args) => {
        intervals.push({ nextAt: msToFrame(window.currentTime+delay), delay: delay, callback: callback, args: args, id: nextID });
        return nextID++;
      };
      clearInterval = id => {
        intervals = intervals.filter(d => d.id !== id);
      };
    }, framerate);

    // try going to url, error out otherwise
    try {
      await page.goto(url, { waitUntil: 'load', timeout: 0 });
    }
    catch {
      console.log(`Unable to load url: ${url}`);
      await browser.close();
      return;
    }

    // set viewport, hide scroll bars and wait a second
    await page.setViewport({ width: width, height: height, deviceScaleFactor: scale });
    await page.evaluate(() => document.querySelector('html').style.overflow = 'hidden');
    await new Promise(resolve => setTimeout(resolve, 1000)); // wait a second

    // setup progress bar
    const progressBar = new SingleBar({
      format: 'Rendering: {bar} {percentage}% | ETA: {eta_formatted} | Frames: {value}/{total}',
      barCompleteChar: '\u2588',
      barIncompleteChar: '\u2591',
      hideCursor: true
    });
    progressBar.start(length*framerate, 0);

    // main frame drawing loop
    for(let frame = 0; frame < length*framerate; ++frame) {
      const curTime = frame*1000/framerate;

      // update time and execute timeouts and intervals that needs to happen
      await page.evaluate(t => window.currentTime = t, curTime); // set time
      await page.evaluate(f => window.curFrame = f, frame); // set frame
      await page.evaluate(() => {
        // update timeouts
        const newTimeouts = [];
        for(const e of timeouts) {
          if(e.at === curFrame) {
            console.log('executing ', e.callback);
            e.callback(...e.args);
          }
          else {
            newTimeouts.push(e);
          }
        }
        if(newTimeouts.length !== timeouts.length) {
          timeouts = newTimeouts;
        }

        // update intervals
        for(const e of intervals) {
          if(e.nextAt === curFrame) {
            console.log('executing interval ', e.callback);
            e.callback(...e.args);
            e.nextAt = msToFrame(window.currentTime+e.delay);
          }
        }
      });

      // write screenshot, then wait
      await page.screenshot({ path: `${output}/${String(frame)}.png` }); // screenshot
      await new Promise(resolve => setTimeout(resolve, 50)); // wait a bit

      progressBar.increment();
    }
    progressBar.stop();
    await browser.close();

    // check if ffmpeg is installed, and if so, render mp4
    try {
      execSync('ffmpeg --help', { stdio: [] }); // test ffmpeg existence
      console.log('ffmpeg is installed, trying to make video...');
      try {
        try {
          fs.rmSync('./rendered.mp4');
          console.log('Removed old video file');
        }
        catch {
          // rendered.mp4 doesn't exist
        }
        execSync(`ffmpeg -hide_banner -loglevel error -framerate ${framerate} -pattern_type sequence -start_number 0 -i "${path.join(output, '%d.png')}" -s:v ${width*scale}x${height*scale} -c:v h264 -pix_fmt yuv420p rendered.mp4`);
        console.log('Video rendered at ./rendered.mp4');
      }
      catch(e) {
        console.log('ffmpeg errored with message:');
        console.log(e.message);
      }
    }
    catch(e) {
      console.log(e.message);
      console.log('ffmpeg is not installed, video will not be made from frames');
    }

    console.log('Done!');
  });

program.parse();
