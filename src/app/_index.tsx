'use client'

import { useRef, useMemo, useState, useCallback, useEffect } from 'react'
import Link from 'next/link'
import Layout from './layout'
import { Nav, ENavControlVariant, EIcon, AudioPlayer } from '@dreampipcom/oneiros'

const QUERY_MAP = {
  it: 'italiano',
  pt: 'portugues',
  en: 'english'
}

const TMP_CONTROLS = {
    top: [
      {
        type: ENavControlVariant.BREADCRUMB,
        label: "Home",
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



export default function Index({ pages }: any) {

  return (
    <>
        <Nav hideSpots hideMenu controls={TMP_CONTROLS} />
        <div className="md:hidden flex relative p-a2 w-full">
          <AudioPlayer className="w-full" />
        </div>
    </>
  )
}
