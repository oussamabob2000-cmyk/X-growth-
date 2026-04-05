import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig } from 'remotion';

export type TerminalStyle = {
  title: string;
  prompt: string;
  typingSpeed: number;
  cursorBlink: boolean;
  showTopBar: boolean;
  showTrafficLights: boolean;
  showLastLogin: boolean;
  scale: number;
  padding: number;
  fontSize: number;
  lineHeight: number;
  backgroundColor: string;
  textColor: string;
  creatorName: string;
  creatorHandle: string;
  shellName: string;
  creatorLogo: string | null;
  showCreatorLogo: boolean;
  showCreatorName: boolean;
  showHandle: boolean;
  platformName: string;
};

export type Scene = {
  text: string;
  durationInFrames: number;
  backgroundColor: string;
  textColor: string;
};

export type SceneSettings = {
  backgroundType: 'custom_image' | 'solid_color' | 'gradient' | 'none';
  backgroundImageUrl: string;
  backgroundBrightness: number;
  backgroundBlur: number;
  fitMode: 'cover' | 'contain' | 'fill';
  gradientPreset: 'night_sky' | 'forest_dark' | 'terminal_classic' | 'sunset';
};

export type TerminalAppearance = {
  opacity: number;
  blurIntensity: number;
  titleBarOpacity: number;
  contentAreaOpacity: number;
};

export type VideoCompositionProps = {
  scenes: Scene[];
  terminalStyle: TerminalStyle;
  sceneSettings: SceneSettings;
  terminalAppearance: TerminalAppearance;
};

const GRADIENTS = {
  night_sky: 'linear-gradient(to bottom right, #0f172a, #020617)',
  forest_dark: 'linear-gradient(to bottom right, #064e3b, #022c22)',
  terminal_classic: '#000000',
  sunset: 'linear-gradient(to bottom right, #7c2d12, #4c1d95)',
};

export const VideoComposition: React.FC<VideoCompositionProps> = ({ scenes, terminalStyle, sceneSettings, terminalAppearance }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  // Calculate total text and visible characters
  const rawText = scenes.map(s => s.text).join(' ');
  // Format text to add newlines after sentences for better terminal wrapping
  const fullText = rawText.replace(/([.!?])\s+(?=[A-Z])/g, '$1\n');
  
  const charsToShow = Math.floor(frame * terminalStyle.typingSpeed);
  const visibleText = fullText.substring(0, charsToShow);
  
  const isTypingComplete = charsToShow >= fullText.length;
  const showCursor = terminalStyle.cursorBlink ? (Math.floor(frame / 15) % 2 === 0) : true;

  // Auto-generate title if shellName is provided and title is default-like
  const displayTitle = terminalStyle.title || `${terminalStyle.creatorName.toLowerCase()} — ${terminalStyle.shellName} — 80x24`;

  let backgroundStyle: React.CSSProperties = {
    backgroundColor: '#000',
    justifyContent: 'center',
    alignItems: 'center',
  };

  if (sceneSettings.backgroundType === 'gradient') {
    backgroundStyle.background = GRADIENTS[sceneSettings.gradientPreset];
  } else if (sceneSettings.backgroundType === 'solid_color') {
    backgroundStyle.backgroundColor = '#1a1a1a'; // Default solid color
  }

  const getFitMode = () => {
    switch (sceneSettings.fitMode) {
      case 'contain': return 'contain';
      case 'fill': return 'fill';
      case 'cover':
      default: return 'cover';
    }
  };

  return (
    <AbsoluteFill style={backgroundStyle}>
      {sceneSettings.backgroundType === 'custom_image' && sceneSettings.backgroundImageUrl && (
        <div style={{
          position: 'absolute',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundImage: `url(${sceneSettings.backgroundImageUrl})`,
          backgroundSize: getFitMode(),
          backgroundPosition: 'center',
          backgroundRepeat: 'no-repeat',
          filter: `brightness(${sceneSettings.backgroundBrightness * 100}%) blur(${sceneSettings.backgroundBlur}px)`,
          transform: 'scale(1.05)', // Prevent blur edges from showing
        }} />
      )}
      
      <div
        style={{
          width: `${terminalStyle.scale * 100}%`,
          maxWidth: '95%',
          backgroundColor: `rgba(15, 15, 20, ${terminalAppearance.opacity})`,
          backdropFilter: `blur(${terminalAppearance.blurIntensity}px) saturate(180%)`,
          WebkitBackdropFilter: `blur(${terminalAppearance.blurIntensity}px) saturate(180%)`,
          borderRadius: '10px',
          boxShadow: '0 20px 60px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid rgba(255, 255, 255, 0.08)',
          position: 'relative',
          zIndex: 10,
        }}
      >
        {terminalStyle.showTopBar && (
          <div style={{
            backgroundColor: `rgba(30, 30, 35, ${terminalAppearance.titleBarOpacity})`,
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            position: 'relative',
            borderBottom: '1px solid rgba(255, 255, 255, 0.05)'
          }}>
            {terminalStyle.showTrafficLights && (
              <div style={{ display: 'flex', gap: '8px' }}>
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#ff5f56' }} />
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#ffbd2e' }} />
                <div style={{ width: '12px', height: '12px', borderRadius: '50%', backgroundColor: '#27c93f' }} />
              </div>
            )}
            <div style={{
              position: 'absolute',
              left: 0,
              right: 0,
              textAlign: 'center',
              color: '#999',
              fontSize: '14px',
              fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
              fontWeight: 500,
              pointerEvents: 'none'
            }}>
              {displayTitle}
            </div>
          </div>
        )}
        
        <div style={{
          padding: `${terminalStyle.padding}px`,
          backgroundColor: `rgba(10, 12, 16, ${terminalAppearance.contentAreaOpacity})`,
          color: terminalAppearance.opacity < 0.4 ? '#ffffff' : '#e8e8e8',
          fontFamily: '"JetBrains Mono", "Fira Code", monospace',
          fontSize: `${terminalStyle.fontSize}px`,
          lineHeight: terminalStyle.lineHeight,
          flex: 1,
          whiteSpace: 'pre-wrap',
          wordBreak: 'break-word',
          textAlign: 'left'
        }}>
          {terminalStyle.showLastLogin && (
            <div style={{ color: '#888', marginBottom: '16px' }}>
              Last login: {new Date().toString().split(' ')[0]} {new Date().toString().split(' ')[1]} {new Date().getDate()} {new Date().toLocaleTimeString()} on ttys000
            </div>
          )}
          <div>
            <span style={{ color: '#4ade80' }}>{terminalStyle.prompt}</span>{' '}
            <span style={{ color: '#d1fae5' }}>{visibleText}</span>
            {(!isTypingComplete || showCursor) && (
              <span style={{ 
                display: 'inline-block', 
                width: `${terminalStyle.fontSize * 0.6}px`, 
                height: `${terminalStyle.fontSize}px`, 
                backgroundColor: '#60a5fa',
                verticalAlign: 'middle',
                marginLeft: '2px',
                opacity: showCursor ? 1 : 0
              }} />
            )}
          </div>
        </div>
      </div>

      {/* Creator Identity Overlay */}
      {(terminalStyle.showCreatorName || terminalStyle.showHandle || terminalStyle.showCreatorLogo) && (
        <div style={{
          position: 'absolute',
          bottom: '40px',
          left: '40px',
          display: 'flex',
          alignItems: 'center',
          gap: '16px',
          fontFamily: '-apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif',
          color: 'white',
          textShadow: '0 2px 10px rgba(0,0,0,0.5)'
        }}>
          {terminalStyle.showCreatorLogo && terminalStyle.creatorLogo && (
            <img src={terminalStyle.creatorLogo} alt="Logo" style={{ width: '60px', height: '60px', borderRadius: '50%', objectFit: 'cover', border: '2px solid rgba(255,255,255,0.2)' }} />
          )}
          <div style={{ display: 'flex', flexDirection: 'column', textAlign: 'left' }}>
            {terminalStyle.showCreatorName && (
              <span style={{ fontSize: '24px', fontWeight: 'bold' }}>{terminalStyle.creatorName}</span>
            )}
            {terminalStyle.showHandle && (
              <span style={{ fontSize: '18px', opacity: 0.8 }}>
                {terminalStyle.creatorHandle} {terminalStyle.platformName ? `• ${terminalStyle.platformName}` : ''}
              </span>
            )}
          </div>
        </div>
      )}
    </AbsoluteFill>
  );
};
