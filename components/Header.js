import React, { useEffect, useState } from 'react';
// import Link from 'next/link';
import Link from 'next/link';
import { HeaderLocale } from '../locale';
import { useRouter } from 'next/router';
import { localizeUrl, pzTrack, generateApiCall } from '../lib/helpers';
import { useFirstInteraction } from '../hooks/useFirstInteraction';
import dynamic from 'next/dynamic';

import { Nav } from '@dreampipcom/oneiros';


function Header({}) {
  return (<div className="sticky top-0 z-[999]">
      <Nav hideSpots hideTheme hideProfile  />
    </div>
  );
}

export default Header;