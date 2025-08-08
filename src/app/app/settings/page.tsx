'use client'
import React, { useRef, useState, useEffect, useContext } from 'react'
import ReactDOMServer from 'react-dom/server';

import Link from 'next/link'
import Layout from './layout'

import { SettingsView } from "@/views/settingsView"
import { ViewMenu } from "@/components/viewMenu"



export default function Template({ title, content, isomorphicContent }: any) {
  const session = {
    user: {}
  }

    return (
      <main className="">
        <ViewMenu active="settings" />
        <h1 className="scroll-m-20 text-2xl font-semibold tracking-tight text-center mb-8">Let's configure things.</h1>
        <SettingsView />
      </main>
    )
}
