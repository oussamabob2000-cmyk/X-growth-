import React from 'react';
import { AbsoluteFill, useCurrentFrame, useVideoConfig, spring, interpolate } from 'remotion';

export type Scene = {
  text: string;
  durationInFrames: number;
  backgroundColor: string;
  textColor: string;
};

export type VideoCompositionProps = {
  scenes: Scene[];
};

export const VideoComposition: React.FC<VideoCompositionProps> = ({ scenes }) => {
  const frame = useCurrentFrame();
  const { fps } = useVideoConfig();

  let currentFrameCount = 0;
  let currentSceneIndex = 0;
  let frameWithinScene = 0;

  for (let i = 0; i < scenes.length; i++) {
    if (frame >= currentFrameCount && frame < currentFrameCount + scenes[i].durationInFrames) {
      currentSceneIndex = i;
      frameWithinScene = frame - currentFrameCount;
      break;
    }
    currentFrameCount += scenes[i].durationInFrames;
  }

  // If frame is beyond all scenes, show the last scene
  if (currentSceneIndex === 0 && frame >= currentFrameCount && scenes.length > 0) {
    currentSceneIndex = scenes.length - 1;
    frameWithinScene = scenes[currentSceneIndex].durationInFrames - 1;
  }

  const scene = scenes[currentSceneIndex];

  if (!scene) {
    return <AbsoluteFill style={{ backgroundColor: 'black' }} />;
  }

  const opacity = interpolate(
    frameWithinScene,
    [0, 15, scene.durationInFrames - 15, scene.durationInFrames],
    [0, 1, 1, 0],
    { extrapolateLeft: 'clamp', extrapolateRight: 'clamp' }
  );

  const scale = spring({
    frame: frameWithinScene,
    fps,
    config: { damping: 200 },
  });

  return (
    <AbsoluteFill style={{ backgroundColor: scene.backgroundColor, justifyContent: 'center', alignItems: 'center' }}>
      <div
        style={{
          opacity,
          transform: `scale(${0.9 + scale * 0.1})`,
          color: scene.textColor,
          fontSize: '6vw',
          fontWeight: 'bold',
          textAlign: 'center',
          padding: '40px',
          fontFamily: 'sans-serif',
          textShadow: '0px 4px 10px rgba(0,0,0,0.3)',
        }}
      >
        {scene.text}
      </div>
    </AbsoluteFill>
  );
};
