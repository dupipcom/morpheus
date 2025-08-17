'use client'
import React, { useRef, useState, useEffect, useContext } from 'react'
import ReactDOMServer from 'react-dom/server';
import { useAuth } from '@clerk/nextjs';

import Link from 'next/link'
import Layout from './layout'

import { SettingsView } from "@/views/settingsView"
import { ViewMenu } from "@/components/viewMenu"
import { setLoginTime, getLoginTime } from '@/lib/cookieManager'



export default function Template({ title, content, isomorphicContent }: any) {
  const { isLoaded, isSignedIn } = useAuth();

  // Set login time when user is authenticated
  useEffect(() => {
    if (isLoaded && isSignedIn) {
      const loginTime = getLoginTime();
      
      // Set login time if not already set
      if (loginTime === null) {
        setLoginTime();
      }
    }
  }, [isLoaded, isSignedIn]);

  return (
    <main className="">
      <ViewMenu active="settings" />
      <h1 className="scroll-m-20 text-2xl font-semibold tracking-tight text-center mb-8">Let's configure things.</h1>
      <SettingsView />
    </main>
  )
}
