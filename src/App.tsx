import React, { useState, useRef } from 'react';
import { Player } from '@remotion/player';
import { VideoComposition, Scene, TerminalStyle } from './components/VideoComposition';
import { GoogleGenAI, Type } from '@google/genai';
import { Loader2, Video, Settings, Download, Sparkles, Play, CheckCircle2, X } from 'lucide-react';
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
  '4:5': { width: 1080, height: 1350 },
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

  // AI Settings State
  const [showSettings, setShowSettings] = useState(false);
  const [aiProvider, setAiProvider] = useState<'gemini' | 'openrouter'>('gemini');
  const [openRouterApiKey, setOpenRouterApiKey] = useState('');
  const [openRouterModel, setOpenRouterModel] = useState('anthropic/claude-3-haiku');

  const [terminalStyle, setTerminalStyle] = useState<TerminalStyle>({
    title: 'creator — zsh — 80x24',
    prompt: 'creator@MacBook ~ %',
    typingSpeed: 2,
    cursorBlink: true,
    showTopBar: true,
    showTrafficLights: true,
    showLastLogin: true,
    scale: 0.85,
    padding: 40,
    fontSize: 32,
    lineHeight: 1.5,
    backgroundColor: '#1e1e1e',
    textColor: '#f0f0f0',
  });

  const fps = 30;
  const totalFrames = durationSeconds * fps;

  const handleGenerate = async () => {
    if (!prompt.trim()) return;
    setIsGenerating(true);
    setScenes([]);

    try {
      const promptText = `I have written the following text:\n"${prompt}"\n\nI want to turn this EXACT text into a video. Do NOT rewrite my text, do NOT add new information, and do NOT generate a random script.\nSplit my exact text into a sequence of scenes.\nThe total video duration is ${durationSeconds} seconds (${totalFrames} frames at ${fps} fps).\nProvide the text to display for each scene (using my exact words), the duration in frames for each scene (the sum of all durations MUST equal exactly ${totalFrames}), a background color (hex code), and a text color (hex code) that contrasts well with the background.\n\nIMPORTANT: Return ONLY valid JSON. The JSON must be an object with a "scenes" array. Each object in the array must have: "text" (string), "durationInFrames" (number), "backgroundColor" (string hex), "textColor" (string hex).`;

      let generatedText = '';

      if (aiProvider === 'gemini') {
        const ai = getAI();
        const response = await ai.models.generateContent({
          model: 'gemini-3-flash-preview',
          contents: promptText,
          config: {
            responseMimeType: 'application/json',
            responseSchema: {
              type: Type.OBJECT,
              properties: {
                scenes: {
                  type: Type.ARRAY,
                  items: {
                    type: Type.OBJECT,
                    properties: {
                      text: { type: Type.STRING },
                      durationInFrames: { type: Type.INTEGER },
                      backgroundColor: { type: Type.STRING },
                      textColor: { type: Type.STRING },
                    },
                    required: ['text', 'durationInFrames', 'backgroundColor', 'textColor'],
                  }
                }
              },
              required: ['scenes']
            },
          },
        });
        generatedText = response.text || '{"scenes":[]}';
      } else {
        if (!openRouterApiKey) throw new Error("OpenRouter API Key is missing. Please add it in Settings.");
        const res = await fetch('https://openrouter.ai/api/v1/chat/completions', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${openRouterApiKey}`,
            'Content-Type': 'application/json',
            'HTTP-Referer': window.location.href,
            'X-Title': 'Remotion AI Studio'
          },
          body: JSON.stringify({
            model: openRouterModel,
            messages: [{ role: 'user', content: promptText }],
            response_format: { type: 'json_object' }
          })
        });
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error?.message || 'OpenRouter API error');
        }
        const data = await res.json();
        generatedText = data.choices[0].message.content;
      }

      // Clean up markdown if present
      generatedText = generatedText.replace(/```json/g, '').replace(/```/g, '').trim();
      const parsed = JSON.parse(generatedText);
      const generatedScenes: Scene[] = parsed.scenes || parsed || [];
      
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
        // Draw background
        ctx.fillStyle = '#1a1a1a';
        ctx.fillRect(0, 0, width, height);

        const termWidth = width * terminalStyle.scale;
        ctx.font = `${terminalStyle.fontSize}px monospace`;
        const lineHeight = terminalStyle.fontSize * terminalStyle.lineHeight;
        
        const fullText = scenes.map(s => s.text).join(' ');
        const charsToShow = Math.floor(f * terminalStyle.typingSpeed);
        const visibleText = fullText.substring(0, charsToShow);
        const promptText = terminalStyle.prompt + ' ';
        
        const maxWidth = termWidth - (terminalStyle.padding * 2);
        const lines: string[] = [];
        
        if (terminalStyle.showLastLogin) {
           lines.push(`Last login: ${new Date().toString().split(' ')[0]} ${new Date().toString().split(' ')[1]} ${new Date().getDate()} ${new Date().toLocaleTimeString()} on ttys000`);
           lines.push('');
        }
        
        const combinedText = promptText + visibleText;
        const textWords = combinedText.split(' ');
        let currentLine = '';
        for (let i = 0; i < textWords.length; i++) {
           const testLine = currentLine + textWords[i] + ' ';
           const metrics = ctx.measureText(testLine);
           if (metrics.width > maxWidth && i > 0) {
               lines.push(currentLine);
               currentLine = textWords[i] + ' ';
           } else {
               currentLine = testLine;
           }
        }
        lines.push(currentLine);

        const contentHeight = lines.length * lineHeight;
        const topBarHeight = terminalStyle.showTopBar ? 40 : 0;
        const termHeight = Math.max(height * 0.4, contentHeight + (terminalStyle.padding * 2) + topBarHeight);
        
        const startX = (width - termWidth) / 2;
        const startY = (height - termHeight) / 2;

        // Draw Terminal Window
        ctx.fillStyle = terminalStyle.backgroundColor;
        ctx.shadowColor = 'rgba(0,0,0,0.5)';
        ctx.shadowBlur = 50;
        ctx.shadowOffsetY = 20;
        
        ctx.beginPath();
        if (ctx.roundRect) {
            ctx.roundRect(startX, startY, termWidth, termHeight, 10);
        } else {
            ctx.rect(startX, startY, termWidth, termHeight);
        }
        ctx.fill();
        ctx.shadowColor = 'transparent';
        
        ctx.strokeStyle = '#333';
        ctx.lineWidth = 2;
        ctx.stroke();

        // Draw Top Bar
        if (terminalStyle.showTopBar) {
            ctx.fillStyle = '#2d2d2d';
            ctx.beginPath();
            if (ctx.roundRect) {
                ctx.roundRect(startX, startY, termWidth, topBarHeight, [10, 10, 0, 0]);
            } else {
                ctx.rect(startX, startY, termWidth, topBarHeight);
            }
            ctx.fill();
            
            ctx.beginPath();
            ctx.moveTo(startX, startY + topBarHeight);
            ctx.lineTo(startX + termWidth, startY + topBarHeight);
            ctx.strokeStyle = '#111';
            ctx.lineWidth = 1;
            ctx.stroke();

            if (terminalStyle.showTrafficLights) {
                const radius = 6;
                const spacing = 20;
                const lightsY = startY + topBarHeight / 2;
                let lightX = startX + 20;
                
                ctx.fillStyle = '#ff5f56';
                ctx.beginPath(); ctx.arc(lightX, lightsY, radius, 0, Math.PI * 2); ctx.fill();
                
                lightX += spacing;
                ctx.fillStyle = '#ffbd2e';
                ctx.beginPath(); ctx.arc(lightX, lightsY, radius, 0, Math.PI * 2); ctx.fill();
                
                lightX += spacing;
                ctx.fillStyle = '#27c93f';
                ctx.beginPath(); ctx.arc(lightX, lightsY, radius, 0, Math.PI * 2); ctx.fill();
            }

            ctx.fillStyle = '#999';
            ctx.font = '500 16px sans-serif';
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';
            ctx.fillText(terminalStyle.title, startX + termWidth / 2, startY + topBarHeight / 2);
        }

        // Draw Content
        ctx.textAlign = 'left';
        ctx.textBaseline = 'top';
        ctx.font = `${terminalStyle.fontSize}px monospace`;
        
        let textY = startY + topBarHeight + terminalStyle.padding;
        const textX = startX + terminalStyle.padding;

        if (terminalStyle.showLastLogin) {
            ctx.fillStyle = '#888';
            ctx.fillText(lines[0], textX, textY);
            textY += lineHeight * 2;
        }

        let charsDrawn = 0;
        const promptLen = promptText.length;
        const startLineIndex = terminalStyle.showLastLogin ? 2 : 0;
        
        for (let i = startLineIndex; i < lines.length; i++) {
            const lineStr = lines[i];
            let currentX = textX;
            
            for (let j = 0; j < lineStr.length; j++) {
                const char = lineStr[j];
                if (charsDrawn < promptLen) {
                    ctx.fillStyle = '#4af626';
                } else {
                    ctx.fillStyle = terminalStyle.textColor;
                }
                ctx.fillText(char, currentX, textY);
                currentX += ctx.measureText(char).width;
                charsDrawn++;
            }
            
            if (i === lines.length - 1) {
                const isTypingComplete = charsToShow >= fullText.length;
                const showCursor = terminalStyle.cursorBlink ? (Math.floor(f / 15) % 2 === 0) : true;
                if (!isTypingComplete || showCursor) {
                    ctx.fillStyle = terminalStyle.textColor;
                    ctx.fillRect(currentX + 2, textY, terminalStyle.fontSize * 0.6, terminalStyle.fontSize);
                }
            }
            
            textY += lineHeight;
        }

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
          <div className="flex items-start justify-between">
            <div>
              <h1 className="text-3xl font-bold tracking-tight flex items-center gap-3 mb-2">
                <Video className="w-8 h-8 text-indigo-500" />
                Remotion AI Studio
              </h1>
              <p className="text-neutral-400">Generate dynamic videos from text using AI.</p>
            </div>
            <button 
              onClick={() => setShowSettings(true)} 
              className="p-2 hover:bg-neutral-800 rounded-full transition-colors text-neutral-400 hover:text-white"
              title="AI Settings"
            >
              <Settings className="w-6 h-6" />
            </button>
          </div>

          <div className="space-y-6 bg-neutral-900/50 p-6 rounded-2xl border border-neutral-800">
            <div className="flex items-center gap-2 text-lg font-medium border-b border-neutral-800 pb-4">
              <Settings className="w-5 h-5 text-neutral-400" />
              Video Format & Settings
            </div>
            
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-2">Video Format (Canvas Setup)</label>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
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
                      {ratio === '9:16' ? 'Vertical Shorts' : ratio === '1:1' ? 'Square' : ratio === '16:9' ? 'Landscape' : 'Portrait'} ({ratio})
                    </button>
                  ))}
                </div>
                {scenes.length > 0 && (
                  <p className="text-xs text-amber-500 mt-2">
                    Warning: Changing format after generation may require adjusting terminal scale or text size.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-2">
                  Duration: {durationSeconds} seconds
                </label>
                <input
                  type="range"
                  min="5"
                  max="60"
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
                    inputProps={{ scenes, terminalStyle }}
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
              <div className="p-6 border-t border-neutral-800 bg-neutral-900 space-y-6">
                
                {/* Terminal Style Controls */}
                <div className="space-y-4">
                  <h3 className="text-sm font-medium text-neutral-300 uppercase tracking-wider mb-4">Terminal Style Controls</h3>
                  
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-1">Terminal Title</label>
                      <input 
                        type="text" 
                        value={terminalStyle.title} 
                        onChange={e => setTerminalStyle(s => ({...s, title: e.target.value}))}
                        className="w-full py-1.5 px-3 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-neutral-300 focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-1">Prompt Style</label>
                      <input 
                        type="text" 
                        value={terminalStyle.prompt} 
                        onChange={e => setTerminalStyle(s => ({...s, prompt: e.target.value}))}
                        className="w-full py-1.5 px-3 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-neutral-300 focus:ring-1 focus:ring-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-1">Typing Speed ({terminalStyle.typingSpeed})</label>
                      <input type="range" min="0.1" max="5" step="0.1" value={terminalStyle.typingSpeed} onChange={e => setTerminalStyle(s => ({...s, typingSpeed: parseFloat(e.target.value)}))} className="w-full accent-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-1">Window Scale ({terminalStyle.scale})</label>
                      <input type="range" min="0.5" max="1" step="0.05" value={terminalStyle.scale} onChange={e => setTerminalStyle(s => ({...s, scale: parseFloat(e.target.value)}))} className="w-full accent-indigo-500" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-1">Text Size ({terminalStyle.fontSize}px)</label>
                      <input type="range" min="12" max="72" step="1" value={terminalStyle.fontSize} onChange={e => setTerminalStyle(s => ({...s, fontSize: parseInt(e.target.value)}))} className="w-full accent-indigo-500" />
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-1">Padding ({terminalStyle.padding}px)</label>
                      <input type="range" min="10" max="100" step="5" value={terminalStyle.padding} onChange={e => setTerminalStyle(s => ({...s, padding: parseInt(e.target.value)}))} className="w-full accent-indigo-500" />
                    </div>
                  </div>

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-1">Background Color</label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={terminalStyle.backgroundColor} onChange={e => setTerminalStyle(s => ({...s, backgroundColor: e.target.value}))} className="w-8 h-8 rounded cursor-pointer bg-transparent border-0 p-0" />
                        <span className="text-sm text-neutral-300 font-mono">{terminalStyle.backgroundColor}</span>
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-medium text-neutral-500 mb-1">Text Color</label>
                      <div className="flex items-center gap-2">
                        <input type="color" value={terminalStyle.textColor} onChange={e => setTerminalStyle(s => ({...s, textColor: e.target.value}))} className="w-8 h-8 rounded cursor-pointer bg-transparent border-0 p-0" />
                        <span className="text-sm text-neutral-300 font-mono">{terminalStyle.textColor}</span>
                      </div>
                    </div>
                  </div>

                  <div className="flex flex-wrap gap-4 pt-2">
                    <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
                      <input type="checkbox" checked={terminalStyle.cursorBlink} onChange={e => setTerminalStyle(s => ({...s, cursorBlink: e.target.checked}))} className="rounded border-neutral-700 bg-neutral-900 text-indigo-500 focus:ring-indigo-500" />
                      Cursor Blink
                    </label>
                    <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
                      <input type="checkbox" checked={terminalStyle.showTopBar} onChange={e => setTerminalStyle(s => ({...s, showTopBar: e.target.checked}))} className="rounded border-neutral-700 bg-neutral-900 text-indigo-500 focus:ring-indigo-500" />
                      Top Bar
                    </label>
                    <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
                      <input type="checkbox" checked={terminalStyle.showTrafficLights} onChange={e => setTerminalStyle(s => ({...s, showTrafficLights: e.target.checked}))} className="rounded border-neutral-700 bg-neutral-900 text-indigo-500 focus:ring-indigo-500" />
                      Traffic Lights
                    </label>
                    <label className="flex items-center gap-2 text-sm text-neutral-300 cursor-pointer">
                      <input type="checkbox" checked={terminalStyle.showLastLogin} onChange={e => setTerminalStyle(s => ({...s, showLastLogin: e.target.checked}))} className="rounded border-neutral-700 bg-neutral-900 text-indigo-500 focus:ring-indigo-500" />
                      Last Login Text
                    </label>
                  </div>
                </div>

                <hr className="border-neutral-800" />

                {/* Export Controls */}
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

      {/* Settings Modal */}
      {showSettings && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-sm z-50 flex items-center justify-center p-4">
          <div className="bg-neutral-900 border border-neutral-800 rounded-2xl w-full max-w-md overflow-hidden shadow-2xl">
            <div className="p-4 border-b border-neutral-800 flex items-center justify-between">
              <h2 className="text-lg font-semibold flex items-center gap-2">
                <Settings className="w-5 h-5" />
                AI Provider Settings
              </h2>
              <button onClick={() => setShowSettings(false)} className="text-neutral-400 hover:text-white">
                <X className="w-5 h-5" />
              </button>
            </div>
            <div className="p-6 space-y-6">
              <div>
                <label className="block text-sm font-medium text-neutral-400 mb-2">AI Provider</label>
                <div className="flex bg-neutral-950 rounded-lg p-1 border border-neutral-800">
                  <button
                    onClick={() => setAiProvider('gemini')}
                    className={cn("flex-1 py-2 text-sm font-medium rounded-md transition-all", aiProvider === 'gemini' ? "bg-neutral-800 text-white" : "text-neutral-400")}
                  >
                    Google Gemini
                  </button>
                  <button
                    onClick={() => setAiProvider('openrouter')}
                    className={cn("flex-1 py-2 text-sm font-medium rounded-md transition-all", aiProvider === 'openrouter' ? "bg-neutral-800 text-white" : "text-neutral-400")}
                  >
                    OpenRouter
                  </button>
                </div>
              </div>

              {aiProvider === 'openrouter' && (
                <div className="space-y-4 animate-in fade-in slide-in-from-top-2">
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-2">OpenRouter API Key</label>
                    <input
                      type="password"
                      value={openRouterApiKey}
                      onChange={(e) => setOpenRouterApiKey(e.target.value)}
                      placeholder="sk-or-v1-..."
                      className="w-full py-2 px-3 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-neutral-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-neutral-400 mb-2">Model</label>
                    <input
                      type="text"
                      value={openRouterModel}
                      onChange={(e) => setOpenRouterModel(e.target.value)}
                      placeholder="e.g., anthropic/claude-3-haiku"
                      className="w-full py-2 px-3 bg-neutral-950 border border-neutral-800 rounded-lg text-sm text-neutral-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
                    />
                    <p className="text-xs text-neutral-500 mt-2">
                      Popular: anthropic/claude-3-haiku, google/gemini-2.5-flash, meta-llama/llama-3-8b-instruct
                    </p>
                  </div>
                </div>
              )}
            </div>
            <div className="p-4 border-t border-neutral-800 bg-neutral-950 flex justify-end">
              <button onClick={() => setShowSettings(false)} className="py-2 px-4 bg-indigo-600 hover:bg-indigo-500 text-white text-sm font-medium rounded-lg transition-colors">
                Done
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
