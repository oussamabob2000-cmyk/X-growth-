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

export type VideoCompositionProps = {
  scenes: Scene[];
  terminalStyle: TerminalStyle;
};

export const VideoComposition: React.FC<VideoCompositionProps> = ({ scenes, terminalStyle }) => {
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

  return (
    <AbsoluteFill style={{ backgroundColor: '#1a1a1a', justifyContent: 'center', alignItems: 'center' }}>
      <div
        style={{
          width: `${terminalStyle.scale * 100}%`,
          maxWidth: '95%',
          backgroundColor: terminalStyle.backgroundColor,
          borderRadius: '10px',
          boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
          overflow: 'hidden',
          display: 'flex',
          flexDirection: 'column',
          border: '1px solid #333',
        }}
      >
        {terminalStyle.showTopBar && (
          <div style={{
            backgroundColor: '#2d2d2d',
            height: '36px',
            display: 'flex',
            alignItems: 'center',
            padding: '0 16px',
            position: 'relative',
            borderBottom: '1px solid #111'
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
          color: terminalStyle.textColor,
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
            <span style={{ color: '#4af626' }}>{terminalStyle.prompt}</span>{' '}
            <span>{visibleText}</span>
            {(!isTypingComplete || showCursor) && (
              <span style={{ 
                display: 'inline-block', 
                width: `${terminalStyle.fontSize * 0.6}px`, 
                height: `${terminalStyle.fontSize}px`, 
                backgroundColor: terminalStyle.textColor,
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
