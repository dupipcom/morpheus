import React, { useEffect, useState } from 'react';
import styled from 'styled-components';
// import Link from 'next/link';
import Link from 'next/link';
import {
  AppBar,
  IconButton,
  Toolbar,
} from '@mui/material';
import { makeStyles } from "@mui/styles"
import MenuIcon from '@mui/icons-material/Menu';
import Player from './Player';
import Image from '../components/ImageBlock';
import { HeaderLocale } from '../locale';
import { useRouter } from 'next/router';
import { localizeUrl, pzTrack, generateApiCall } from '../lib/helpers';
import { useFirstInteraction } from '../hooks/useFirstInteraction';
import dynamic from 'next/dynamic';

import { Button, Grid, AudioPlayer, EGridVariant, EBleedVariant, ESystemIcon } from '@dreampipcom/oneiros';

const MenuDrawer = dynamic(() => import("../components/MenuDrawer"))


const PlayersWrapper = styled.div`
  display: flex;
  position: relative;
  align-items: center;
  justify-content: space-between;
  flex-direction: column;

  @media screen and (min-width: 768px) {
    flex-direction: row;
  }
`;


const Apps = styled.div`
  background-color: #1a1a1a;
  display: flex;
  justify-content: center;
  @media screen and (min-width: 768px) {
    display: none;
    justify-content: center;
    align-items: center;
  }
  width: 100%;
  padding: 8px;
`

const Social = styled.div`
  display: flex;
  align-items: center;
  justify-content: space-between;
  justify-self: self-end;
  margin: 16px;
  @media screen and (min-width: 768px) {
    display: flex;
  }
  & a {
    width: 100%;
    margin-left: 4px;
  }
`

const useStyles = makeStyles((theme) => ({
  drawer: {
    width: '50%',
    maxWidth: '300px',
  },
  listwrapper: {
    backgroundColor: 'white',
    height: "100%",
  },
  link: {
    textDecoration: 'none',
    fontStyle: 'italic',
    fontWeight: 'bold',
    color: 'black',
    fontSize: 24,
  },
  logoWrapper: {
    position: 'absolute',
    left: '50%',
    top: '50%',
    transform: 'translate(-50%, -50%)',
  },
}));

function Header({ title = 'Headless by WP Engine', description }) {
  const [interacted, setInteracted] = useState(false)
  const classes = useStyles();
  const navClasses = ``;
  const toolsClasses = `bg-primary-dark2`;

  // TODO: accept a `menuItems` prop to receive menu items from WordPress.
  const [isPlayingA, setIsPlayingA] = useState(false);
  // const [isPlayingB, setIsPlayingB] = useState(false);
  const [image, setImage] = useState("");

  const { locale: orig } = useRouter()
  const locale = orig === "default" ? "en" : orig

  const localization = HeaderLocale[locale] || HeaderLocale["default"]

  const [statusA, setStatusA] = useState('');
  // const [statusB, setStatusB] = useState('');

  const menuItems = [
    { title: localization['home'], href: localizeUrl('/', locale) },
    {
      title: localization['chat'], href: localizeUrl(`/chat`, locale), target: "_blank", onClick: () => {
        pzTrack('click', {
          value: 'join'
        })
      }
    },
    { title: localization['episodes'], href: localizeUrl(`/episodes`, locale) },
    // { title: localization['shows'], href: localizeUrl(`/shows`, locale) },
    { title: localization['agenda'], href: localizeUrl(`/agenda`, locale) },
    // { title: localization['events'], href: localizeUrl(`/events`, locale) },
    // { title: localization['blog'], href: localizeUrl(`/blog`, locale) },
    // { title: localization['label'], href: localizeUrl(`/label`, locale) },
    // { title: localization['support-us'], href: localizeUrl('/support', locale) },
    { title: localization['about'], href: localizeUrl(`/who`, locale) },
    { title: localization['privacy'], href: localizeUrl(`/privacy`, locale) },
  ];

  const switchPlayerA = () => {
    if (!isPlayingA) {
      // setIsPlayingB(false);
      setIsPlayingA(true);
    } else {
      setIsPlayingA(false);
    }
  };

  const [isMenuOpen, setIsMenuOpen] = useState(false);

  useFirstInteraction(() => {
    setInteracted(true)
    const initSong = async () => {
      return
    };
    void initSong();
    /* eslint-disable */
  }, [], [true], [statusA])

  useEffect(() => {

  })

  return (
    <nav style={{ position: "sticky", top: 0, zIndex: 999, boxShadow: "0 1px 4px 0 rgba(0,0,0,.8)" }}>
      <Apps>
        <a href='https://play.google.com/store/apps/details?id=com.angeloreale.purizumobile' style={{ marginRight: '8px', position: 'relative', display: 'block', height: 36, width: 124 }} >
          <Image fill alt='Get it on Google Play' src='/images/googleplay.svg' />
        </a>
        <a style={{ position: 'relative', display: 'block', height: 36, width: 109 }} href='https://apps.apple.com/us/app/purizu/id1639022876'>
          <Image fill alt='Download on App Store' src='/images/appstore.svg' />
        </a>
      </Apps>
      <AppBar className={navClasses} position='relative'>
        <Toolbar className={toolsClasses} variant="dense" sx={{ minHeight: '120px', backgroundColor: '#1a1a1a', justifyContent: 'space-between' }}>
          <Grid variant={EGridVariant.DEFAULT} bleed={EBleedVariant.ZERO}>
            <div className="justify-self-start self-center col-span-1 col-start-0 md:!col-span-1 md:!col-start-0">
              <Button icon={ESystemIcon['apps']} onClick={() => {
                setIsMenuOpen(true)
              }} edge="end" color="inherit" aria-label="menu" />
            </div>
            <div 
              className="justify-self-center self-center col-span-4 col-start-2 md:!col-span-2 md:!col-start-4"
            >
              {image && (
                <img alt="Header image" src={image} style={{ width: "auto", height: 75, position: 'absolute', left: -55, top: "50%", transform: "translateY(-50%)" }} />
              )}
              <Link href={`/`}>
                <span style={{ display: "flex", height: 120, width: 100 }}>
                  <Image eager fill src={`/${process.env.NEXT_PUBLIC_SUBPATH_PREFIX ? process.env.NEXT_PUBLIC_SUBPATH_PREFIX + '/' : ''}images/logo.svg`} alt="DreamPip" />
                </span>
              </Link>
            </div>
            <Grid className="grid md:justify-self-end self-center col-span-6 col-start-0 md:!col-span-4 md:!col-start-6">
                <AudioPlayer
                  className="justify-self-start self-center col-span-1 col-start-0 md:col-span-2 col-start-0"
                  prompt=""
                  src={generateApiCall('/api/nexus/audio')}
                  onPlay={switchPlayerA}
                  playing={isPlayingA}
                />
                <Button className="self-center col-span-5 col-start-2 md:col-span-6 col-start-2" href={localizeUrl(`/chat`, locale)} target="_blank" onClick={() => {
                  pzTrack('click', {
                    value: 'join'
                  })
                }}>
                  {localization['chat']}!
                </Button>
            </Grid>
          </Grid>
        </Toolbar>
      </AppBar>
      {interacted ? <MenuDrawer listItems={menuItems} classes={{ drawer: classes.drawer, listwrapper: classes.listwrapper, link: classes.link }} open={isMenuOpen} onClose={() => setIsMenuOpen(false)} onOpen={() => setIsMenuOpen(true)} /> : undefined}
    </nav>
  );
}

export default Header;