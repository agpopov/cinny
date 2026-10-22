import React, { ImgHTMLAttributes, forwardRef } from 'react';
import classNames from 'classnames';
import { AuthenticatedImage } from './AuthenticatedImage';
import * as css from './media.css';

export const Image = forwardRef<HTMLImageElement, ImgHTMLAttributes<HTMLImageElement>>(
  ({ className, alt, ...props }, ref) => (
    <AuthenticatedImage
      className={classNames(css.Image, className)}
      alt={alt}
      {...props}
      ref={ref}
    />
  )
);
