import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { ArrowUp } from 'lucide-react';

interface ScrollToTopProps {
  /** Scroll threshold in pixels before button appears */
  threshold?: number;
  /** Smooth scroll behavior */
  smooth?: boolean;
}

export function ScrollToTop({ threshold = 300, smooth = true }: ScrollToTopProps) {
  const [isVisible, setIsVisible] = useState(false);

  const checkScroll = useCallback(() => {
    const scrollY = window.scrollY || document.documentElement.scrollTop;
    setIsVisible(scrollY > threshold);
  }, [threshold]);

  useEffect(() => {
    window.addEventListener('scroll', checkScroll, { passive: true });
    // Check initial scroll position
    checkScroll();
    return () => window.removeEventListener('scroll', checkScroll);
  }, [checkScroll]);

  const scrollToTop = () => {
    window.scrollTo({
      top: 0,
      behavior: smooth ? 'smooth' : 'auto',
    });
  };

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.button
          initial={{ opacity: 0, scale: 0.8, y: 20 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.8, y: 20 }}
          transition={{ type: 'spring', stiffness: 300, damping: 25 }}
          onClick={scrollToTop}
          className="fixed bottom-24 lg:bottom-6 right-6 z-40 p-3 bg-signal-primary hover:brightness-110 text-white rounded-full shadow-[0_0_12px_var(--color-glow-primary)] focus:outline-none focus:ring-2 focus:ring-signal-primary focus:ring-offset-2 focus:ring-offset-surface-base"
          title="Scroll to top"
          aria-label="Scroll to top"
        >
          <ArrowUp className="w-5 h-5" />
        </motion.button>
      )}
    </AnimatePresence>
  );
}
