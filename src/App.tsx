import React, { useState, useRef } from 'react';
import { Player } from '@remotion/player';
import { VideoComposition, Scene } from './components/VideoComposition';
import { GoogleGenAI, Type } from '@google/genai';
import { Loader2, Video, Settings, Download, Sparkles, Play, CheckCircle2 } from 'lucide-react';
import { cn } from './lib/utils';
import * as Mp4Muxer from 'mp4-muxer';

let aiClient: GoogleGenAI | null = null;

const getAI = () => {
  if (!aiClient) {
    // Try to get the key from process.env (AI Studio) or import.meta.env (Vercel/Vite standard)
    const apiKey = process.env.GEMINI_API_KEY || (import.meta as any).env?.VITE_GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("Gemini API Key is missing. Please set GEMINI_API_KEY or VITE_GEMINI_API_KEY in your environment variables.");
    }
    aiClient = new GoogleGenAI({ apiKey });
  }
  return aiClient;
};

const ASPECT_RATIOS = {
  '16:9': { width: 1920, height: 1080 },
  '9:16': { width: 1080, height: 1920 },
  '1:1': { width: 1080, height: 1080 },
};

type AspectRatioKey = keyof typeof ASPECT_RATIOS;

export default function App() {
  const [prompt, setPrompt] = useState('');
  const [aspectRatio, setAspectRatio] = useState<AspectRatioKey>('16:9');
  const [durationSeconds, setDurationSeconds] = useState(10);
  const [isGenerating, setIsGenerating] = useState(false);
  const [scenes, setScenes] = useState<Scene[]>([]);
  const [exportMethod, setExportMethod] = useState<'ffmpeg' | 'webcodecs' | 'hybrid'>('webcodecs');
  const [codec, setCodec] = useState<'h264' | 'vp9'>('h264');
  const [bitrate, setBitrate] = useState(5);
  const [isExporting, setIsExporting] = useState(false);
  const [exportProgress, setExportProgress] = useState(0);
  const playerRef = useRef<any>(null);

  const fps = 30;
  const totalFrames = durationSeconds * fps;

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setScenes([]);

    try {
      const ai = getAI();
      const response = await ai.models.generateContent({
        model: 'gemini-3-flash-preview',
        contents: `I have written the following text:
        "${prompt}"
        
        I want to turn this EXACT text into a video. Do NOT rewrite my text, do NOT add new information, and do NOT generate a random script. 
        Split my exact text into a sequence of scenes. 
        The total video duration is ${durationSeconds} seconds (${totalFrames} frames at ${fps} fps).
        Provide the text to display for each scene (using my exact words), the duration in frames for each scene (the sum of all durations MUST equal exactly ${totalFrames}), a background color (hex code), and a text color (hex code) that contrasts well with the background.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                text: { type: Type.STRING, description: 'The text to display on screen' },
                durationInFrames: { type: Type.INTEGER, description: 'Duration of this scene in frames' },
                backgroundColor: { type: Type.STRING, description: 'Hex color code for background' },
                textColor: { type: Type.STRING, description: 'Hex color code for text' },
              },
              required: ['text', 'durationInFrames', 'backgroundColor', 'textColor'],
            },
          },
        },
      });

      const generatedScenes: Scene[] = JSON.parse(response.text || '[]');
      
      // Normalize durations to ensure they match totalFrames exactly
      let currentTotal = generatedScenes.reduce((acc, scene) => acc + scene.durationInFrames, 0);
      if (currentTotal !== totalFrames && generatedScenes.length > 0) {
        const diff = totalFrames - currentTotal;
        generatedScenes[generatedScenes.length - 1].durationInFrames += diff;
      }

      setScenes(generatedScenes);
    } catch (error: any) {
      console.error('Error generating script:', error);
      alert(`Failed to generate script: ${error.message || 'Unknown error'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleExport = async () => {
    if (scenes.length === 0) return;
    
    if (!window.VideoEncoder) {
      alert('Your browser does not support local video rendering (WebCodecs API). Please use a modern browser like Chrome, Edge, or Safari 16.4+.');
      return;
    }

    setIsExporting(true);
    setExportProgress(0);

    try {
      const { width, height } = ASPECT_RATIOS[aspectRatio];
      
      const muxer = new Mp4Muxer.Muxer({
        target: new Mp4Muxer.ArrayBufferTarget(),
        video: {
          codec: codec === 'h264' ? 'avc' : 'vp9',
          width,
          height
        },
        fastStart: 'in-memory'
      });

      const encoder = new VideoEncoder({
        output: (chunk, meta) => muxer.addVideoChunk(chunk, meta as any),
        error: (e) => {
          console.error('Encoder error:', e);
          alert('Video encoding failed: ' + e.message);
        }
      });

      const codecString = codec === 'h264' ? 'avc1.4D002A' : 'vp09.00.40.08';

      encoder.configure({
        codec: codecString,
        width,
        height,
        bitrate: bitrate * 1_000_000,
        framerate: fps
      });

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;
      const ctx = canvas.getContext('2d')!;

      let currentFrameCount = 0;
      let currentSceneIndex = 0;

      for (let f = 0; f < totalFrames; f++) {
        // Find current scene
        if (f >= currentFrameCount + scenes[currentSceneIndex].durationInFrames) {
          currentFrameCount += scenes[currentSceneIndex].durationInFrames;
          currentSceneIndex = Math.min(currentSceneIndex + 1, scenes.length - 1);
        }
        const scene = scenes[currentSceneIndex];
        const frameWithinScene = f - currentFrameCount;

        // Draw background
        ctx.fillStyle = scene.backgroundColor;
        ctx.fillRect(0, 0, width, height);

        // Opacity
        let opacity = 1;
        const fadeFrames = 15;
        if (frameWithinScene < fadeFrames) {
          opacity = frameWithinScene / fadeFrames;
        } else if (frameWithinScene > scene.durationInFrames - fadeFrames) {
          opacity = (scene.durationInFrames - frameWithinScene) / fadeFrames;
        }
        opacity = Math.max(0, Math.min(1, opacity));

        // Scale
        const progress = Math.min(1, frameWithinScene / (fps * 0.5));
        const easeOut = 1 - Math.pow(1 - progress, 3);
        const scale = 0.9 + (easeOut * 0.1);

        ctx.save();
        ctx.translate(width / 2, height / 2);
        ctx.scale(scale, scale);
        ctx.globalAlpha = opacity;

        ctx.fillStyle = scene.textColor;
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        const fontSize = Math.floor(width * 0.06);
        ctx.font = `bold ${fontSize}px sans-serif`;
        ctx.shadowColor = 'rgba(0,0,0,0.3)';
        ctx.shadowBlur = 10;
        ctx.shadowOffsetY = 4;

        // Wrap text
        const words = scene.text.split(' ');
        let line = '';
        const lines = [];
        const maxWidth = width * 0.8;

        for (let n = 0; n < words.length; n++) {
          const testLine = line + words[n] + ' ';
          const metrics = ctx.measureText(testLine);
          if (metrics.width > maxWidth && n > 0) {
            lines.push(line);
            line = words[n] + ' ';
          } else {
            line = testLine;
          }
        }
        lines.push(line);

        const lineHeight = fontSize * 1.2;
        const totalHeight = lines.length * lineHeight;
        let startY = -(totalHeight / 2) + (lineHeight / 2);

        for (let i = 0; i < lines.length; i++) {
          ctx.fillText(lines[i].trim(), 0, startY + (i * lineHeight));
        }

        ctx.restore();

        // Encode frame
        const videoFrame = new VideoFrame(canvas, { timestamp: (f * 1e6) / fps });
        encoder.encode(videoFrame, { keyFrame: f % 30 === 0 });
        videoFrame.close();

        if (f % 5 === 0) {
          setExportProgress(Math.round((f / totalFrames) * 100));
          await new Promise(resolve => setTimeout(resolve, 0)); // Yield to UI
        }

        while (encoder.encodeQueueSize > 30) {
          await new Promise(resolve => setTimeout(resolve, 50));
        }
      }

      await encoder.flush();
      muxer.finalize();

      const buffer = muxer.target.buffer;
      const blob = new Blob([buffer], { type: 'video/mp4' });
      const url = URL.createObjectURL(blob);
      
      const a = document.createElement('a');
      a.href = url;
      a.download = `video-${Date.now()}.mp4`;
      a.click();
      URL.revokeObjectURL(url);

      setExportProgress(100);
      setTimeout(() => {
        setIsExporting(false);
        alert(`Video exported successfully as MP4 (${codec.toUpperCase()}, ${bitrate}Mbps)!`);
      }, 500);

    } catch (error) {
      console.error('Export error:', error);
      alert('An error occurred during export.');
      setIsExporting(false);
    }
  };

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-50 font-sans selection:bg-indigo-500/30">
      <div className="max-w-6xl mx-auto p-6 lg:p-12 grid grid-cols-1 lg:grid-cols-12 gap-12">
        
        {/* Left Column: Controls */}
        <div className="lg:col-span-5 space-y-8">
          <div>
            <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3 mb-2">
              <Video className="w-8 h-8 text-indigo-500" />
              Remotion AI Studio
            </h1>
            <p className="text-neutral-400">Generate dynamic videos from text using Gemini 3 Flash.</p>
          </div>

          <div className="space-y-6 bg-neutral-900/50 p-6 rounded-2xl border border-neutral-800">
            <div className="flex items-center gap-2 text-lg font-medium border-b border-neutral-800 pb-4">
              <Settings className="w-5 h-5 text-neutral-400" />
              Video Settings
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-2">Aspect Ratio</label>
                <div className="grid grid-cols-3 gap-2">
                  {(Object.keys(ASPECT_RATIOS) as AspectRatioKey[]).map((ratio) => (
                    <button
                      key={ratio}
                      onClick={() => setAspectRatio(ratio)}
                      className={cn(
                        "py-2 px-4 rounded-lg text-sm font-medium transition-all",
                        aspectRatio === ratio 
                          ? "bg-indigo-500 text-white shadow-lg shadow-indigo-500/20" 
                          : "bg-neutral-800 text-neutral-300 hover:bg-neutral-700"
                      )}
                    >
                      {ratio}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-2">
                  Duration: {durationSeconds} seconds
                </label>
                <input
                  type="range"
                  min="5"
                  max="30"
                  step="1"
                  value={durationSeconds}
                  onChange={(e) => setDurationSeconds(parseInt(e.target.value))}
                  className="w-full accent-indigo-500"
                />
              </div>
            </div>
          </div>

          <div className="space-y-4">
            <label className="block text-sm font-medium text-neutral-400">Video Text Content</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enter the exact text you want to appear in the video... (e.g., Welcome to my channel! \n Today we are learning React.)"
              className="w-full h-32 bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-neutral-100 placeholder:text-neutral-600 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
            />
            <button
              onClick={handleGenerate}
              disabled={isGenerating || !prompt.trim()}
              className="w-full py-4 px-6 bg-white text-black font-semibold rounded-xl hover:bg-neutral-200 transition-all disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  Generating Script...
                </>
              ) : (
                <>
                  <Sparkles className="w-5 h-5" />
                  Generate Video Script
                </>
              )}
            </button>
          </div>
        </div>

        {/* Right Column: Preview & Export */}
        <div className="lg:col-span-7 space-y-8">
          <div className="bg-neutral-900/50 rounded-2xl border border-neutral-800 overflow-hidden flex flex-col h-full min-h-[600px]">
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between bg-neutral-900">
              <div className="font-medium flex items-center gap-2">
                <Play className="w-4 h-4 text-indigo-500" />
                Preview
              </div>
              {scenes.length > 0 && (
                <div className="text-xs text-neutral-500 font-mono">
                  {totalFrames} frames @ {fps}fps
                </div>
              )}
            </div>
            
            <div className="flex-1 flex items-center justify-center bg-black/50 p-6 relative">
              {scenes.length > 0 ? (
                <div className="w-full max-w-full flex items-center justify-center shadow-2xl shadow-black/50 rounded-lg overflow-hidden">
                  <Player
                    ref={playerRef}
                    component={VideoComposition}
                    inputProps={{ scenes }}
                    durationInFrames={totalFrames}
                    compositionWidth={ASPECT_RATIOS[aspectRatio].width}
                    compositionHeight={ASPECT_RATIOS[aspectRatio].height}
                    fps={fps}
                    controls
                    autoPlay
                    loop
                    style={{
                      width: '100%',
                      height: 'auto',
                      maxHeight: '600px',
                      aspectRatio: `${ASPECT_RATIOS[aspectRatio].width} / ${ASPECT_RATIOS[aspectRatio].height}`,
                    }}
                  />
                </div>
              ) : (
                <div className="text-center text-neutral-600 flex flex-col items-center gap-4">
                  <Video className="w-16 h-16 opacity-20" />
                  <p>Generate a script to see the preview</p>
                </div>
              )}
            </div>

            {scenes.length > 0 && (
              <div className="p-6 border-t border-neutral-800 bg-neutral-900">
                <div className="space-y-4">
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-2 uppercase tracking-wider">Export Method</label>
                      <div className="flex bg-neutral-950 rounded-lg p-1 border border-neutral-800">
                        {(['ffmpeg', 'webcodecs', 'hybrid'] as const).map((method) => (
                          <button
                            key={method}
                            onClick={() => setExportMethod(method)}
                            className={cn(
                              "flex-1 py-1.5 text-xs font-medium rounded-md transition-all capitalize",
                              exportMethod === method
                                ? "bg-neutral-800 text-white shadow-sm"
                                : "text-neutral-400 hover:text-neutral-200"
                            )}
                          >
                            {method}
                          </button>
                        ))}
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-2 uppercase tracking-wider">Format</label>
                      <div className="py-1.5 px-3 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-neutral-300 font-medium text-center">
                        MP4 (.mp4)
                      </div>
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-2 uppercase tracking-wider">Video Codec</label>
                      <select 
                        value={codec} 
                        onChange={(e) => setCodec(e.target.value as any)}
                        className="w-full py-1.5 px-3 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-neutral-300 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
                      >
                        <option value="h264">H.264</option>
                        <option value="vp9">VP9</option>
                      </select>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-2 uppercase tracking-wider">Bitrate ({bitrate} Mbps)</label>
                      <input 
                        type="range" 
                        min="1" 
                        max="20" 
                        step="1"
                        value={bitrate}
                        onChange={(e) => setBitrate(Number(e.target.value))}
                        className="w-full accent-indigo-500"
                      />
                    </div>
                  </div>

                  <button
                    onClick={handleExport}
                    disabled={isExporting}
                    className="w-full py-3 px-8 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold rounded-xl transition-all disabled:opacity-50 flex items-center justify-center gap-2 mt-4"
                  >
                    {isExporting ? (
                      <>
                        <Loader2 className="w-5 h-5 animate-spin" />
                        Exporting {exportProgress}%
                      </>
                    ) : (
                      <>
                        <Download className="w-5 h-5" />
                        Export Video
                      </>
                    )}
                  </button>
                  
                  {isExporting && (
                    <div className="h-2 bg-neutral-800 rounded-full overflow-hidden">
                      <div 
                        className="h-full bg-indigo-500 transition-all duration-200 ease-out"
                        style={{ width: `${exportProgress}%` }}
                      />
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

      </div>
    </div>
  );
}
