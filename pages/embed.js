import dynamic from 'next/dynamic';
import React, { useEffect, useRef } from 'react';
import ReactPlayer from 'react-player';

export default function Embed() {
  return (
    <div
      style={{
        position: 'relative',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        width: '100%',
        height: '100vh',
        zIndex: 2,
      }}>
      <div style={{
        position: 'relative',
        width: '100%',
        height: "100vh",
        paddingBottom: '56.25%'
      }}>
        <div style={{
          position: 'relative',
          width: '100%',
          height: '100vh'
        }}>
          <iframe
            src="https://player.twitch.tv/?channel=unaltru&parent=www.unaltru.com&parent=localhost&muted=true"
            frameBorder="0"
            scrolling="no"
            allowFullScreen
            muted
            style={{
              position: 'absolute',
              top: '0',
              left: '0',
              width: '100%',
              height: '100%',
              border: '0',
            }}
          />
        </div>
      </div>

    </div>
  );
}
