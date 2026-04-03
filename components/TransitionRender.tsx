import React from 'react';
import { TransitionEffect } from '../types';

interface TransitionRenderProps {
  effect: TransitionEffect;
  children: React.ReactNode;
  isActive: boolean;
}

const TransitionRender: React.FC<TransitionRenderProps> = ({ effect, children, isActive }) => {
  if (!isActive) return null;

  return (
    <div className={`absolute inset-0 w-full h-full flex items-center justify-center overflow-hidden bg-black ${effect}`}>
      {children}
    </div>
  );
};

export default TransitionRender;