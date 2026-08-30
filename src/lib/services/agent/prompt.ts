/**
 * System prompt builders for the two DeepSeek consumers (assistant chat, hint).
 * Both assemble persona/instructions + the retrieved RAG context.
 */

import type { RagResult, ResolvedAgentContext } from './types'

export interface AssistantPromptInput {
  date: string
  year: number
  weekNumber: number
  ctx: ResolvedAgentContext
  rag: RagResult
}

// Persona carried over verbatim from the previous OpenAI implementation
const ASSISTANT_PERSONA = `You are a compassionate AI assistant understand their health data and make conscious, legal, responsible with a healthy mindset, and helping users with their mental health and habit tracking journey.

You can't setup reminders or control the user IoT devices.

You have access to the user's historical data and can reference the Cognitive Psychology books for guidance.

Pease keep your answers under 250 words. Try to share tips for solving practical issues in the user's input.

Please don't try to validate logical assumptions with the user, assume your solutions and suggestions are good.

The definition of done for daily and weekly tasks is the count key-value matching times key-value in each object in the arrays.
Otherwise, the count specifies the amount of times the task was completed in their respective period: daily or weekly.`

export function buildAssistantSystemPrompt(input: AssistantPromptInput): string {
  const { date, year, weekNumber, ctx, rag } = input

  const sections: string[] = [
    ASSISTANT_PERSONA,
    '',
    `Today is ${date}.`,
    `The year is ${year}`,
    `Current week number for the current year is ${weekNumber}.`,
    '',
    'DATA SCOPE',
    `The data below covers ${ctx.startDate} to ${ctx.endDate} for ${ctx.userLabel}.`,
    `Dimensions included: ${rag.dimensionList.length > 0 ? rag.dimensionList.join(', ') : 'none (tasks only)'}.`,
    'Notes the requester is authorized to read may be included as chunks prefixed with [date].',
    'Only reference data present in this prompt; never claim to see data outside it.'
  ]

  if (ctx.isRestricted) {
    sections.push('Access to this data is restricted by a delegation scope; only days and notes visible under that scope are included.')
  }

  if (rag.userChunks.length > 0) {
    sections.push('', 'USER DATA (most relevant first)')
    for (const chunk of rag.userChunks) {
      sections.push(chunk.text)
    }
  } else {
    sections.push('', 'No user data was retrieved for the current range and filters.')
  }

  if (rag.docChunks.length > 0) {
    sections.push('', 'PSYCHOLOGY REFERENCE (excerpts from "Cognitive Psychology and Cognitive Neuroscience")')
    for (const chunk of rag.docChunks) {
      sections.push(chunk.text)
    }
  }

  sections.push(
    '',
    'Use this data to provide personalized insights and advice.',
    'If no relevant user data was retrieved, say so plainly and give general guidance.'
  )

  return sections.join('\n')
}

export interface HintPromptInput {
  locale: string
  startDate: string
  endDate: string
  rag: RagResult
}

export interface PhoneQueryPromptInput {
  accessLevel: string
  locale: string
  startDate: string
  endDate: string
  rag: RagResult
  publicProfile: Record<string, unknown> | null
}

/**
 * System prompt for the MCP phone_query_user_data pipeline (phase 12).
 * Answers are spoken over the phone: plain sentences, strict scope discipline,
 * bounded by the data provided for the caller's access level.
 */
export function buildPhoneQuerySystemPrompt(input: PhoneQueryPromptInput): string {
  const sections: string[] = [
    "You answer a phone caller's question about a Dupip user's life, using only the data provided below.",
    `Data covers ${input.startDate} to ${input.endDate}. Answer in locale: ${input.locale}.`,
    `The caller's access level is ${input.accessLevel}. You are given only data the caller is allowed to see — never imply additional or private data exists, and never discuss access levels or tooling.`,
    'Speak in plain, warm, concise sentences — at most 120 words. No markdown, no lists.',
    `Never fabricate moods, tasks, notes, dates, or analysis. If the data does not answer the question, say "I don't have information about that."`,
    'Summarize; never recite note text verbatim at length.'
  ]

  if (input.publicProfile) {
    const profile = input.publicProfile
    const nameParts = [profile.firstName, profile.lastName].filter(Boolean)
    sections.push(
      '',
      'PUBLIC PROFILE',
      `username: ${profile.userName ?? 'n/a'}`,
      `name: ${nameParts.length > 0 ? nameParts.join(' ') : 'n/a'}`,
      `bio: ${profile.bio ?? 'n/a'}`
    )
  }

  if (input.rag.userChunks.length > 0) {
    sections.push('', 'USER DATA (most relevant first)')
    for (const chunk of input.rag.userChunks) {
      sections.push(chunk.text)
    }
  } else {
    sections.push('', 'No user data was retrieved for this period.')
  }

  return sections.join('\n')
}

export const HINT_ANALYSIS_KEYS = [
  'alltimeAnalysis',
  'dayAnalysis',
  'last3daysAnalysis',
  'weekAnalysis',
  'yearAnalysis',
  'gratitudeAnalysis',
  'optimismAnalysis',
  'restednessAnalysis',
  'toleranceAnalysis',
  'selfEsteemAnalysis',
  'trustAnalysis'
] as const

export type HintAnalysisKey = typeof HINT_ANALYSIS_KEYS[number]

/**
 * Chat Completions messages for the hint route. DeepSeek supports JSON mode
 * via response_format {type:'json_object'} (not json_schema), so the contract
 * is spelled out in the prompt and enforced by zod at parse time.
 */
export function buildHintMessages(input: HintPromptInput): Array<{ role: 'system' | 'user'; content: string }> {
  const system = `You are a cognitive psychologist data assistant talking to a user. You should use the pronoun 'you' while generating the output.

You reference the cognitive psychology archive excerpts provided in this prompt to provide improvement suggestions to the user routine.

You analyse how indicators like gratitude, optimism, restedness, tolerance and trust progress over time, finding correlations with weekly and daily task completions.

Please generate the insights in this locale: ${input.locale}

Return ONLY a single JSON object with exactly these keys and no other text:
${HINT_ANALYSIS_KEYS.join(', ')}

Each value must be an analysis string of around 500 words.`

  const user = `This is the user historical data set (${input.startDate} to ${input.endDate}):

${input.rag.userChunks.map((chunk) => chunk.text).join('\n\n') || 'No user data available.'}

Psychology reference excerpts:
${input.rag.docChunks.map((chunk) => chunk.text).join('\n\n') || 'None available.'}

Please provide a series of 500 words analysis for the provided format.`

  return [
    { role: 'system', content: system },
    { role: 'user', content: user }
  ]
}
