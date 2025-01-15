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
  return <Nav hideTheme hideProfile />;
}

export default Header;