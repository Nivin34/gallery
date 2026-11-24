import React, { useEffect, useState } from 'react';
import { Image as ImageIcon } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import type { GalleryFileDTO } from '../types';

interface AuthImageProps {
  file: GalleryFileDTO;
  className?: string;
  alt?: string;
}

export function AuthImage({ file, className = '', alt }: AuthImageProps) {
  const { token } = useAuth();
  const inlineBase64 = file.fileData || file.previewDataUrl || null;

  const [src, setSrc] = useState<string | null>(() => {
    if (inlineBase64) return inlineBase64;
    if (file.visibility === 'public') return file.contentUrl;
    return null;
  });
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
    if (inlineBase64) {
      setSrc(inlineBase64);
      return;
    }
    if (file.visibility === 'public') {
      setSrc(file.contentUrl);
      return;
    }
    if (!token) {
      setSrc(null);
      return;
    }

    let active = true;
    let objectUrl: string | null = null;

    fetch(file.contentUrl, {
      headers: { Authorization: `Bearer ${token}` },
    })
      .then((res) => {
        if (!res.ok) throw new Error('Image fetch failed');
        return res.blob();
      })
      .then((blob) => {
        if (!active) return;
        objectUrl = URL.createObjectURL(blob);
        setSrc(objectUrl);
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [file.id, file.contentUrl, inlineBase64, file.visibility, token]);

  if (failed || !src) {
    return (
      <div
        className={`flex flex-col items-center justify-center bg-slate-100 text-slate-400 dark:bg-slate-800/80 dark:text-slate-500 ${className}`}
      >
        <ImageIcon className="h-7 w-7 opacity-70" />
        <span className="mt-1.5 max-w-[85%] truncate text-xs font-medium">{file.title}</span>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt || file.originalName || file.title}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className={className}
    />
  );
}
