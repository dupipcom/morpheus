import Image from '../components/ImageBlock';
import React, { useContext, useEffect, useState } from 'react';
import styled from 'styled-components';
import { AppContext } from '../context';
import { FormControl, InputLabel, MenuItem, Select } from '@mui/material';
import { useRouter } from 'next/router';
import { setCookie } from '../lib/helpers';
import { HeaderLocale } from '../locale';
import Link from 'next/link';

const Apps = styled.section`
  display: none;
  justify-content: center;
  @media screen and (min-width: 768px) {
    display: flex;
    justify-content: space-between;
  }
  width: 250px;
  margin: 24px;
`

const Wrapper = styled.div`
  display: flex;
  grid-template-columns: 1fr 1fr 1fr;
  align-items: center;
  justify-content: center;
  height: 100%;
  flex-wrap: wrap;

  @media screen and (min-width: 768px) {
    place-items: center;
    display: grid;
    grid-template-columns: 1fr 1fr 1fr;
  }
`

function Footer({ copyrightHolder = 'Company Name' }) {
  const year = new Date().getFullYear();
  const context = useContext(AppContext);
  const [locale, setLocale] = useState(context?.locale)
  const router = useRouter()

  const localization = HeaderLocale[locale] || HeaderLocale["default"]

  const [hasPlayer, setHasPlayer] = useState(false)

  useEffect(() => {
    if(context?.episode?.mixcloud) {
      setHasPlayer(true)
    } else {
      setHasPlayer(false)
    }
  }, [JSON.stringify(context?.episode)])

  const handleChange = (e) => {
    const value = e.target.value

    if (value !== context?.locale) {
      context.setContext({ ...context, locale: value })
      setLocale(value)
      router.push({ pathname: router.pathname, query: router.query }, router.asPath, { locale: value })
      setCookie("NEXT_LOCALE", value, 90)
    }
  }

  return (
    <>
      {(hasPlayer || !!context.mobileApp) && (
        <section key={`${context?.episode?.mixcloud}+${!!context.mobileApp}`} style={{ bottom: 0, position: "sticky", bottom: 0, zIndex: 3 }}>
          {hasPlayer && (
            <iframe key={context?.episode?.mixcloud} width="100%" style={{ marginBottom: "-9px" }} height="60" src={`https://www.mixcloud.com/widget/iframe/?hide_cover=1&mini=1&hide_artwork=1&feed=%2Fdreampip%2F${encodeURIComponent(context.episode?.mixcloud?.split('/purizu/')[1])}`} frameBorder="0" ></iframe>
          )}
          <div style={{ display: !!context?.mobileApp ? 'flex' : 'none', justifyContent: 'center', padding: '8px' }}>
            <FormControl sx={{ w: 200 }} variant="standard">
              <InputLabel id="locale-switcher">{localization["locale"]}</InputLabel>
              <Select
                labelId="locale-switcher"
                id="locale"
                value={locale}
                label="Locale"
                onChange={handleChange}
              >
                <MenuItem value="en">English</MenuItem>
                <MenuItem value="it-it">Italiano</MenuItem>
                <MenuItem value="pt-br">Português</MenuItem>
                <MenuItem value="es-es">Español</MenuItem>
                <MenuItem value="ro">Română</MenuItem>
                <MenuItem value="de-de">Deutsch</MenuItem>
                <MenuItem value="fr-fr">Français</MenuItem>
                <MenuItem value="pl-pl">Polski</MenuItem>
                <MenuItem value="cs-cz">Český</MenuItem>
                <MenuItem value="sv-se">Svenska</MenuItem>
                <MenuItem value="et-ee">Eesti</MenuItem>
                <MenuItem value="ru-ru">Русский</MenuItem> 
                <MenuItem value="ja-jp">日本語</MenuItem> 
              </Select>
            </FormControl>
          </div>
        </section>
      )}

      {!context.mobileApp && (
        <footer className='content-page !text-body-dark !bg-primary-dark' style={{ paddingBottom: '32px' }}>
          <div className="wrap" style={{ height: '100%' }}>
            <Wrapper>
              <section style={{
                display: 'flex',
                justifyContent: 'flex-start',
                alignItems: 'flex-start',
                flexDirection: 'column',
                justifySelf: 'self-start',
              }}>
                <Link className="text-body-dark" href="/privacy" style={{ fontSize: '12px', marginTop: '24px', justifySelf: 'self-start' }}>{`© 2012-${year} Purizu D.I. Angelo Reale`}</Link>
                <span style={{ display: 'block', fontSize: '12px', justifySelf: 'self-start', lineHeight: '16px' }}>VAT: IT02925300903</span>
                <span style={{ display: 'block', fontSize: '12px', justifySelf: 'self-start', lineHeight: '16px' }}>REA: 572763</span>
                <span style={{ display: 'block', fontSize: '12px', justifySelf: 'self-start', lineHeight: '16px' }}>SIAE License: 202300000075</span>
                <Link className="text-body-dark" href="/impressum" style={{ fontSize: '12px', lineHeight: '16px', marginBottom: '24px', justifySelf: 'self-start' }}>{`Impressum.`}</Link>
                <FormControl fullWidth variant="standard">
                  <InputLabel className="text-body-dark border-body-light" id="locale-switcher">{localization["locale"]}</InputLabel>
                  <Select
                    labelId="locale-switcher"
                    id="locale"
                    value={locale}
                    label="Locale"
                    onChange={handleChange}
                    className="text-body-dark"
                  >
                    <MenuItem value="en">English</MenuItem>
                    <MenuItem value="it-it">Italiano</MenuItem>
                    <MenuItem value="pt-br">Português</MenuItem>
                    <MenuItem value="es-es">Español</MenuItem>
                    <MenuItem value="ro">Română</MenuItem>
                    <MenuItem value="de-de">Deutsch</MenuItem>
                    <MenuItem value="fr-fr">Français</MenuItem>
                    <MenuItem value="pl-pl">Polski</MenuItem>
                    <MenuItem value="cs-cz">Český</MenuItem>
                    <MenuItem value="sv-se">Svenska</MenuItem>
                    <MenuItem value="et-ee">Eesti</MenuItem>
                    <MenuItem value="ru-ru">Русский</MenuItem>
                    <MenuItem value="ja-jp">日本語</MenuItem>
                  </Select>
                </FormControl>
              </section>
              <div className="mt-a3">
                <a className="m-a2 !text-xs text-body-dark" style={{ position: 'relative', display: 'flex', alignItems: 'center' }} href="https://facebook.com/dreampipcom" target="_blank">
                  Facebook
                </a>
                <a className="m-a2 !text-xs text-body-dark" style={{ position: 'relative', display: 'flex', alignItems: 'center' }} href="https://instagram.com/dreampipcom" target="_blank">
                  Instagram
                </a>
                <a className="m-a2 !text-xs text-body-dark" style={{ position: 'relative', display: 'flex', alignItems: 'center' }} href="https://x.com/dreampipcom" target="_blank">
                  Twitter
                </a>
                {/* <a className="m-a2 !text-xs text-body-dark" style={{ position: 'relative', display: 'flex', alignItems: 'center' }} href="https://soundcloud.com/dreampipcom" target="_blank">
                  Soundcloud
                </a> */}
                <a className="m-a2 !text-xs text-body-dark" style={{ position: 'relative', display: 'flex', alignItems: 'center' }} href="https://mixcloud.com/dreampip" target="_blank">
                  Mixcloud
                </a>
              </div>
            </Wrapper>
          </div>
        </footer>
      )}
    </>
  );
}

export default Footer;