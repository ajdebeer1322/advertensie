import React, { useEffect, useRef, useState } from 'react';
import type { ImageItem } from '../types';

interface Props {
  items: ImageItem[];
  currentPath: string | null;
  onPick: (path: string) => void;
}

export function ThumbStrip({ items, currentPath, onPick }: Props) {
  const [thumbs, setThumbs] = useState<Record<string, string>>({});
  const activeRef = useRef<HTMLDivElement>(null);

  // Lazy-load thumbnails for the current strip
  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (const it of items) {
        if (cancelled) return;
        if (thumbs[it.path]) continue;
        const url = await window.api.readFileAsDataUrl(it.path);
        if (cancelled) return;
        if (url) setThumbs((t) => ({ ...t, [it.path]: url }));
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [items]);

  // Scroll the active tile into view when it changes
  useEffect(() => {
    activeRef.current?.scrollIntoView({ block: 'nearest', inline: 'center', behavior: 'smooth' });
  }, [currentPath]);

  if (!items.length) return null;

  return (
    <div
      style={{
        display: 'flex',
        gap: 6,
        overflowX: 'auto',
        padding: '8px 2px',
        marginBottom: 12,
        borderBottom: '1px solid #374151',
      }}
    >
      {items.map((it) => {
        const active = it.path === currentPath;
        return (
          <div
            key={it.path}
            ref={active ? activeRef : undefined}
            onClick={() => onPick(it.path)}
            title={it.name}
            style={{
              flex: '0 0 auto',
              width: 72,
              height: 72,
              border: `2px solid ${active ? '#fbbf24' : '#374151'}`,
              borderRadius: 4,
              overflow: 'hidden',
              cursor: 'pointer',
              background: '#111827',
              position: 'relative',
            }}
          >
            {thumbs[it.path] ? (
              <img
                src={thumbs[it.path]}
                alt={it.name}
                style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              />
            ) : (
              <div
                style={{
                  width: '100%',
                  height: '100%',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  color: '#6b7280',
                  fontSize: 10,
                }}
              >
                …
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
