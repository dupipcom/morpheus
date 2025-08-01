'use client'

import React, { useRef, useState, useEffect, useContext } from 'react'
import ReactDOMServer from 'react-dom/server';
import '@mux/mux-video';

import Link from 'next/link'
import { NotionRenderer, createBlockRenderer } from "@notion-render/client"

import { Globals, Nav, Typography, TypographyVariant, ENavControlVariant, EIcon, AudioPlayer } from '@dreampipcom/oneiros'
import "@dreampipcom/oneiros/styles"

import Layout from './layout'
import { GlobalContext } from "./contexts"
import { useSession, signIn, signOut } from "next-auth/react"
import { SettingsView } from "@/views/settingsView"
import { ViewMenu } from "@/components/viewMenu"



export default function Template({ title, content, isomorphicContent }: any) {
  const { data: session } = useSession()


    return (
      <main className="">
        <ViewMenu active="settings" />
        <h1 className="scroll-m-20 text-2xl font-semibold tracking-tight text-center mb-8">Let's configure things.</h1>
        <SettingsView />
      </main>
    )
}
