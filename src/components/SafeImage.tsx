import React, { useState, useEffect } from 'react';
import { motion, AnimatePresence } from 'motion/react';
import { Loader2 } from 'lucide-react';
import { APP_MEDIA } from '../assets/media';

interface SafeImageProps {
  src?: string;
  alt?: string;
  className?: string;
  imgClassName?: string;
  fallbackSrc?: string;
  objectFit?: 'cover' | 'contain' | 'fill' | 'none' | 'scale-down';
  showLoader?: boolean;
}

export default function SafeImage({
  src,
  alt = 'Esports Visual',
  className = '',
  imgClassName = '',
  fallbackSrc = APP_MEDIA.emblem,
  objectFit = 'cover',
  showLoader = true,
}: SafeImageProps) {
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(false);
  const [currentSrc, setCurrentSrc] = useState<string | undefined>(src || fallbackSrc);

  useEffect(() => {
    setIsLoading(true);
    setError(false);
    setCurrentSrc(src || fallbackSrc);
  }, [src, fallbackSrc]);

  const handleError = () => {
    if (!error) {
      setError(true);
      setCurrentSrc(fallbackSrc);
      setIsLoading(false);
    }
  };

  const handleLoad = () => {
    setIsLoading(false);
  };

  useEffect(() => {
    if (!src) {
      setError(true);
      setCurrentSrc(fallbackSrc);
      setIsLoading(false);
    }
  }, [src, fallbackSrc]);

  return (
    <div className={`relative overflow-hidden ${className}`}>
      <div className="absolute inset-0 bg-slate-100 flex flex-col items-center justify-center p-4">
        <img
          src={APP_MEDIA.emblem}
          alt="Placeholder"
          className="w-1/3 max-w-[56px] opacity-20 rounded-xl"
        />
        {isLoading && showLoader && (
          <div className="absolute inset-0 flex items-center justify-center bg-white/60 backdrop-blur-xs">
            <Loader2 className="text-[#007AFF] animate-spin" size={20} />
          </div>
        )}
      </div>

      <AnimatePresence mode="wait">
        <motion.img
          key={currentSrc}
          src={currentSrc}
          alt={alt}
          initial={{ opacity: 0 }}
          animate={{ opacity: isLoading ? 0 : 1 }}
          transition={{ duration: 0.25 }}
          onLoad={handleLoad}
          onError={handleError}
          className={`w-full h-full object-${objectFit} relative z-10 ${imgClassName}`}
          referrerPolicy="no-referrer"
        />
      </AnimatePresence>
    </div>
  );
}
