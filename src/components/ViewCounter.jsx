// Enhanced ViewCounter Component - src/components/ViewCounter.jsx
import React, { useState, useEffect, useRef } from 'react';
import { motion, AnimatePresence } from 'framer-motion';

export function ViewCounter({ path, apiUrl }) {
  const [views, setViews] = useState('...');
  const [uniqueVisitors, setUniqueVisitors] = useState(0);
  const [isVisible, setIsVisible] = useState(false);
  const [error, setError] = useState(false);
  const endpoint = `${apiUrl}/api/view`;
  const hasTracked = useRef(false);

  useEffect(() => {
    if (!path || !endpoint || hasTracked.current) return;

    // Enhanced admin/dev mode detection
    const isDevMode = localStorage.getItem('niels_dev_mode') === 'true' || 
                     sessionStorage.getItem('preview_mode') === 'true' ||
                     window.location.hostname === 'localhost' ||
                     window.location.hostname.includes('preview');

    if (isDevMode) {
      console.log("🔧 Dev Mode: pageview tracking disabled");
      setViews('DEV');
      setIsVisible(true);
      return;
    }

    // Enhanced visitor tracking with session management
    const sessionId = sessionStorage.getItem('visitor_session') || 
                     `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionStorage.setItem('visitor_session', sessionId);

    // Track visitor with enhanced data collection
    const trackVisitor = async () => {
      try {
        const startTime = Date.now();
        
        // Collect enhanced visitor data
        const visitorData = {
          path,
          referrer: document.referrer || 'Direct',
          sessionId,
          timestamp: new Date().toISOString(),
          viewport: {
            width: window.innerWidth,
            height: window.innerHeight
          },
          screen: {
            width: screen.width,
            height: screen.height,
            pixelRatio: window.devicePixelRatio || 1
          },
          language: navigator.language || 'Unknown',
          timezone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'Unknown',
          connection: navigator.connection ? {
            effectiveType: navigator.connection.effectiveType,
            downlink: navigator.connection.downlink,
            rtt: navigator.connection.rtt
          } : null
        };

        const response = await fetch(endpoint, {
          method: 'POST',
          headers: { 
            'Content-Type': 'application/json',
            'X-Requested-With': 'XMLHttpRequest'
          },
          body: JSON.stringify(visitorData),
          keepalive: true,
        });

        const responseTime = Date.now() - startTime;
        
        if (!response.ok) {
          throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }

        const data = await response.json();
        
        // Animate the view counter
        setViews(data.views ?? 'Error');
        setUniqueVisitors(data.uniqueVisitors ?? 0);
        setIsVisible(true);
        hasTracked.current = true;
        
        // Log performance metrics in dev mode
        if (process.env.NODE_ENV === 'development') {
          console.log(`📊 Analytics tracked in ${responseTime}ms:`, data);
        }

        // Track page visibility for session duration
        let visibilityStart = Date.now();
        let totalTime = 0;

        const handleVisibilityChange = () => {
          if (document.hidden) {
            totalTime += Date.now() - visibilityStart;
          } else {
            visibilityStart = Date.now();
          }
        };

        const handleBeforeUnload = () => {
          totalTime += Date.now() - visibilityStart;
          
          // Send session duration data
          fetch(`${apiUrl}/api/analytics`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              type: 'session_end',
              sessionId,
              path,
              duration: totalTime,
              timestamp: new Date().toISOString()
            }),
            keepalive: true,
          }).catch(err => console.warn('Session tracking failed:', err));
        };

        document.addEventListener('visibilitychange', handleVisibilityChange);
        window.addEventListener('beforeunload', handleBeforeUnload);

        // Cleanup listeners
        return () => {
          document.removeEventListener('visibilitychange', handleVisibilityChange);
          window.removeEventListener('beforeunload', handleBeforeUnload);
        };

      } catch (err) {
        console.error("📊 Analytics tracking error:", err);
        setViews('Error');
        setError(true);
        setIsVisible(true);
      }
    };

    trackVisitor();
  }, [path, endpoint, apiUrl]);

  return (
    <AnimatePresence>
      <motion.span
        className={`inline-flex items-center gap-1 px-3 py-1 rounded-full text-sm font-medium transition-all duration-300 ${
          error
            ? 'bg-red-100 text-red-800 dark:bg-red-900/20 dark:text-red-400'
            : 'bg-blue-100 text-blue-800 dark:bg-blue-900/20 dark:text-blue-400 hover:bg-blue-200 dark:hover:bg-blue-900/30'
        }`}
        initial={{ opacity: 0, scale: 0.8 }}
        animate={{ opacity: isVisible ? 1 : 0.7, scale: 1 }}
        transition={{ 
          type: "spring", 
          stiffness: 300, 
          damping: 30,
          duration: 0.6 
        }}
        whileHover={{ 
          scale: 1.05,
          transition: { duration: 0.2 }
        }}
        whileTap={{ scale: 0.95 }}
        title={`${views} total views${uniqueVisitors ? ` • ${uniqueVisitors} unique visitors` : ''}`}
      >
        <motion.span
          animate={isVisible && views !== 'Error' && views !== 'DEV' ? { rotate: 360 } : { rotate: 0 }}
          transition={{ duration: 0.5 }}
        >
          👁️
        </motion.span>
        
        <motion.span
          key={views}
          initial={{ y: 10, opacity: 0 }}
          animate={{ y: 0, opacity: 1 }}
          transition={{ duration: 0.3 }}
        >
          {views}
        </motion.span>

        {uniqueVisitors > 0 && (
          <motion.span
            className="text-xs opacity-75 ml-1"
            initial={{ opacity: 0, width: 0 }}
            animate={{ opacity: 1, width: 'auto' }}
            transition={{ delay: 0.5 }}
          >
            • {uniqueVisitors} unique
          </motion.span>
        )}
      </motion.span>
    </AnimatePresence>
  );
}