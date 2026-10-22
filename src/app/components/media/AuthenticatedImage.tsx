import React, { forwardRef, ImgHTMLAttributes } from 'react';
import { useMediaSource } from '../../hooks/useMediaSource';

export const AuthenticatedImage = forwardRef<HTMLImageElement, ImgHTMLAttributes<HTMLImageElement>>(
  ({ src, alt, ...props }, ref) => {
    const mediaSrc = useMediaSource(src);
    return <img {...props} src={mediaSrc} alt={alt} ref={ref} />;
  }
);
