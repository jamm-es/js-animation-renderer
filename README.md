# JS Animation Renderer
Renders a website with javascript animations (like d3, matter, etc) into a video by overriding JS's timing functions in Puppeteer.

## Installation

Download the repo and run `npm install` in its directory.

## Usage

Run with `node render.js <full url to render>`.

Only libraries that use, on the underlying layer, `setInterval`, `setTimeout`, or `requestAnimationFrame` are supported (though this should encompass almost all cases).
For instance, this program was successfully used to render a [complex d3 physics simulation](https://www.jamesli.io/emoji-cooccurrence) into a video perfectly. 

If `ffmpeg` is installed, the program will try to render the frames into an mp4, at `./rendered.mp4`.

## Options

#### `-H, --headless`

Run puppeteer headless

#### `-w, --width <width>` and `-h, --height <height>`

Set dimensions of viewport in pixels. Both default to 720

#### `-s, --scale <scale>`

Scale the viewport by the given multiple, defaults to 1

#### `-l --length <seconds>`

Number of seconds to run animation, defaults to 60

#### `-f, --framerate <rate>`

Number of frames to sample per second, defaults to 60

#### `-o, --output <path>`

Path of directory to output frames to, defaults to ./frames/`
