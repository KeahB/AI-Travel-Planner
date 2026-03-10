import React, { useState, useEffect } from 'react';
import { searchWiki } from '../services/api';
import { Image as ImageIcon } from 'lucide-react';
import { motion } from 'motion/react';

interface WikiImageProps {
  placeName: string;
  alt?: string;
}

export function WikiImage({ placeName, alt }: WikiImageProps) {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    
    const fetchImage = async () => {
      try {
        setLoading(true);
        const data = await searchWiki(placeName);
        if (isMounted && data.imageUrl) {
          setImageUrl(data.imageUrl);
        } else if (isMounted) {
          setError(true);
        }
      } catch (err) {
        if (isMounted) {
          setError(true);
        }
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    };

    fetchImage();

    return () => {
      isMounted = false;
    };
  }, [placeName]);

  if (loading) {
    return (
      <motion.span 
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        className="inline-flex items-center justify-center w-full h-64 bg-slate-100 rounded-3xl animate-pulse my-6 border-2 border-brand-sand/50"
      >
        <ImageIcon className="w-10 h-10 text-slate-300" />
      </motion.span>
    );
  }

  if (error || !imageUrl) {
    // If no image is found, we just don't render anything to avoid cluttering the itinerary
    return null;
  }

  return (
    <motion.span 
      initial={{ opacity: 0, scale: 0.95, y: 20 }}
      whileInView={{ opacity: 1, scale: 1, y: 0 }}
      viewport={{ once: true, margin: "-50px" }}
      transition={{ duration: 0.5, type: "spring", bounce: 0.4 }}
      className="block my-8 relative group"
    >
      <div className="absolute inset-0 bg-brand-peach/20 rounded-3xl blur-xl group-hover:blur-2xl transition-all duration-500 opacity-0 group-hover:opacity-100" />
      <img 
        src={imageUrl} 
        alt={alt || placeName} 
        className="w-full h-72 md:h-96 object-cover rounded-3xl shadow-lg border-4 border-white relative z-10 transition-transform duration-500 group-hover:scale-[1.02]"
        referrerPolicy="no-referrer"
      />
      <span className="block text-center text-sm font-medium text-slate-500 mt-3 italic">
        {alt || placeName}
      </span>
    </motion.span>
  );
}
