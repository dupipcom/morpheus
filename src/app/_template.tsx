'use client'

import { useRef, useMemo, useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import Layout from './layout'
import { Nav, Typography, TypographyVariant, ENavControlVariant, EIcon, AudioPlayer } from '@dreampipcom/oneiros'
import "@dreampipcom/oneiros/styles"




export default function Template({ title, content }: any) {

  const TMP_CONTROLS = {
    top: [
      {
        type: ENavControlVariant.BREADCRUMB,
        label: title,
      },
    ],
    center: [
      {
        type: ENavControlVariant.AUDIO_PLAYER,
        mods: '$flip',
        label: 'Rotations portal live',
        src: '/api/nexus/audio',
      },
    ],
    bottom: [
      {
        type: ENavControlVariant.BUTTON,
        icon: EIcon['music-note'],
        href: "https://mixcloud.com/dreampip"
      },
    ],
  };


  return (
    <>
        <Nav hideSpots hideMenu controls={TMP_CONTROLS} />
        <main>
          <div className="md:hidden flex relative p-a2 w-full">
            <AudioPlayer className="w-full" />
          </div>
          { title && !content ? <Typography className="p-[32px] md:max-w-[720px] md:m-auto" variant={TypographyVariant.H1}>{title}</Typography> : undefined }
          { content ? <div className="p-[32px] md:max-w-[720px] md:m-auto">
            <div dangerouslySetInnerHTML={{ __html: content }} />
          </div> : undefined }
        </main>
    </>
  )
}
