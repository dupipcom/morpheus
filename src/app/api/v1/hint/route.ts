import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server'
import openai from '@/lib/openai';
import prisma from "@/lib/prisma";
import { getWeekNumber } from '@/app/helpers'
import { buildHistoricalEntriesByYear } from '@/lib/utils/dayHistory'
import { getDelegationScopes, resolveEffectiveDelegationScope } from '@/lib/utils/delegation'
import fs from 'node:fs'
import path from 'node:path'

// Logger helper function for consistent console logging format
const logger = (str: string, originalMessage?: unknown) => {
  // Convert objects to strings to avoid circular references
  let message = str;
  if (originalMessage !== undefined) {
    if (typeof originalMessage === 'object') {
      try {
        message = `${str} - ${JSON.stringify(originalMessage, null, 2)}`;
      } catch {
        message = `${str} - [Object - circular reference or non-serializable]`;
      }
    } else {
      message = `${str} - ${String(originalMessage)}`;
    }
  }

  // Determine colors based on message content
  const isDb = str.includes('db');
  const isError = str.includes('error');
  const isIdle = str.includes('idle');
  const isWarning = str.includes('warning');

  // Create console.log color settings object
  const colorSettings = {
    background: isDb ? 'cyan' : '#1f1f1f',
    color: isError ? 'red' : isIdle || isWarning ? 'yellow' : 'green',
    fontWeight: 'bold',
    padding: '2px 4px',
    borderRadius: '3px'
  };

  console.log(
    `%cdpip::morpheus::${message}`,
    `background: ${colorSettings.background}; color: ${colorSettings.color}; font-weight: ${colorSettings.fontWeight}; padding: ${colorSettings.padding}; border-radius: ${colorSettings.borderRadius};`
  );
};

export const revalidate = 86400;
export const maxDuration = 30;

const HINT_VECTOR_STORE_NAME = 'morpheus-hint-rag'
const HINT_VECTOR_STORE_ID = process.env.OPENAI_HINT_VECTOR_STORE_ID?.trim() || null
const HINT_RAG_FILE_PATH = path.join(process.cwd(), 'src/app/api/v1/hint/rag/cognitive-psychology-archiveorg.md')
const HINT_RAG_FILE_NAME = path.basename(HINT_RAG_FILE_PATH)

type DelegationVisibilityAccess =
  | { kind: 'full' }
  | { kind: 'restricted'; visibilities: Array<'PUBLIC' | 'FRIENDS' | 'CLOSE_FRIENDS'> }
  | { kind: 'invalid' }

function resolveDelegationVisibilityAccess(scope: string): DelegationVisibilityAccess {
  switch (scope) {
    case 'PRIVATE':
    case 'AI_ENABLED':
      return { kind: 'full' }
    case 'PUBLIC':
      return { kind: 'restricted', visibilities: ['PUBLIC'] }
    case 'CLOSE_FRIENDS':
      return { kind: 'restricted', visibilities: ['PUBLIC', 'CLOSE_FRIENDS'] }
    case 'FRIENDS':
      return { kind: 'restricted', visibilities: ['PUBLIC', 'FRIENDS', 'CLOSE_FRIENDS'] }
    default:
      return { kind: 'invalid' }
  }
}

async function getOrCreateHintVectorStore() {
  if (HINT_VECTOR_STORE_ID) {
    try {
      return await openai.vectorStores.retrieve(HINT_VECTOR_STORE_ID)
    } catch {
      logger('hint_rag_vector_store_lookup_failed', `Could not retrieve configured vector store id: ${HINT_VECTOR_STORE_ID}`)
    }
  }

  const vectorStores = await openai.vectorStores.list({ limit: 100 })
  const existingVectorStore = vectorStores.data.find((store) => store.name === HINT_VECTOR_STORE_NAME)

  if (existingVectorStore) {
    return existingVectorStore
  }

  return openai.vectorStores.create({
    name: HINT_VECTOR_STORE_NAME,
  })
}

async function ensureHintRagFileInVectorStore(vectorStoreId: string): Promise<void> {
  if (!fs.existsSync(HINT_RAG_FILE_PATH)) {
    throw new Error(`RAG source file not found at ${HINT_RAG_FILE_PATH}`)
  }

  const vectorStoreFiles = await openai.vectorStores.files.list(vectorStoreId, { limit: 100 })

  const fileNames = await Promise.all(
    vectorStoreFiles.data.map(async (vectorFile) => {
      try {
        const file = await openai.files.retrieve(vectorFile.id)
        return file.filename
      } catch {
        return null
      }
    })
  )

  const hasRequiredFile = fileNames.includes(HINT_RAG_FILE_NAME)
  if (hasRequiredFile) {
    return
  }

  const file = await openai.files.create({
    file: fs.createReadStream(HINT_RAG_FILE_PATH),
    purpose: 'assistants'
  })

  await openai.vectorStores.files.create(vectorStoreId, {
    file_id: file.id
  })
}

export async function GET(req: NextRequest) {
  const { userId: clerkUserId } = await auth()

  if (!clerkUserId) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 })
  }
  
  // Extract locale from request headers or query parameters
  const url = new URL(req.url)
  const locale = url.searchParams.get('locale') || 'en'
  const requestedUserId = url.searchParams.get('userId')

  // if (!data.prompt) {
  //   return Response.json({ error: "Prompt is required" }, { status: 400 });
  // }
  
  const requestingUser = await prisma.user.findUnique({
    where: { userId: clerkUserId },
    select: { id: true }
  })

  if (!requestingUser) {
    return Response.json({ error: 'User not found' }, { status: 404 })
  }

  const targetUserId = requestedUserId || requestingUser.id
  let delegationAccess: DelegationVisibilityAccess = { kind: 'full' }

  if (targetUserId !== requestingUser.id) {
    const delegation = await prisma.delegation.findUnique({
      where: {
        delegatorId_delegatedId: {
          delegatorId: targetUserId,
          delegatedId: requestingUser.id
        }
      },
      select: { id: true, scope: true, scopes: true }
    })

    if (!delegation) {
      return Response.json({ error: 'Not authorized for selected user data' }, { status: 403 })
    }

    const delegationScopes = getDelegationScopes(delegation.scopes, delegation.scope)
    const delegationScope = resolveEffectiveDelegationScope(delegationScopes, delegation.scope)

    if (!delegationScope) {
      return Response.json({ error: 'Delegation scope is invalid' }, { status: 403 })
    }

    delegationAccess = resolveDelegationVisibilityAccess(delegationScope)
    if (delegationAccess.kind === 'invalid') {
      return Response.json({ error: 'Delegation scope is invalid' }, { status: 403 })
    }
  }

  const targetUser = await prisma.user.findUnique({
    where: { id: targetUserId },
    select: { id: true }
  })

  if (!targetUser) {
    return Response.json({ error: 'Target user not found' }, { status: 404 })
  }

  const fullDate = new Date()
  const date = fullDate.toISOString().split('T')[0]
  const week = Number(getWeekNumber(fullDate)[1])
  const month = fullDate.getMonth() + 1
  const quarter = Math.floor((month - 1) / 3) + 1
  const semester = month <= 6 ? 1 : 2
  const dayWhere: Record<string, unknown> = { userId: targetUser.id }
  if (delegationAccess.kind === 'restricted') {
    dayWhere.visibility = { in: delegationAccess.visibilities }
  }
  const days = targetUser
    ? await prisma.day.findMany({
        where: dayWhere,
        orderBy: { date: 'asc' },
        select: {
          date: true,
          week: true,
          tasks: true,
          mood: true,
          ticker: true,
          average: true,
          progress: true,
          balance: true,
          stash: true,
          withdrawn: true,
          analysis: true,
          productivity: true
        }
      })
    : []
  const entries = buildHistoricalEntriesByYear(days)
  const canReadPersistedHint = delegationAccess.kind === 'full'
  const existingDay = canReadPersistedHint
    ? await prisma.day.findFirst({
        where: { userId: targetUser.id, date },
        select: { id: true, analysis: true }
      })
    : null
  const existingAnalysis = existingDay?.analysis && typeof existingDay.analysis === 'object' && !Array.isArray(existingDay.analysis)
    ? existingDay.analysis as Record<string, unknown>
    : {}
  const existingHint = existingAnalysis.hint

  if (!existingHint) {
    try {
      const vectorStore = await getOrCreateHintVectorStore()
      await ensureHintRagFileInVectorStore(vectorStore.id)

      const response = await openai.responses.create({
        model: "gpt-5-nano-2025-08-07",
        tools: [{ type: 'file_search', vector_store_ids: [vectorStore.id] }],
        instructions: `
          Please use file_search for this analysis.

          You are a data science platform talking to a user. You should use the pronoun 'you' while generating the output.
          
          You reference the cognitive psychology archive in the file_search vector store to provide improvement suggestions to the user routine.

          You analyse how indicators like gratitude, optimism, restedness, tolerance and trust progress over time, finding correlations with weekly and daily task completions.

          Please generate the insights in this locale: ${locale}

          This is the user historical data set:

          \`\`\`
          ${JSON.stringify(entries)}
          \`\`\`

          `,
        text: {
          format: {
            name: "mood_analysis",
            type: "json_schema",
            schema: {
              type: "object",
              properties: {
                alltimeAnalysis: { type: "string" },
                dayAnalysis: { type: "string" },
                last3daysAnalysis: { type: "string" },
                weekAnalysis: { type: "string" },
                yearAnalysis: { type: "string" },
                gratitudeAnalysis: { type: "string" },
                optimismAnalysis: { type: "string" },
                restednessAnalysis: { type: "string" },
                toleranceAnalysis: { type: "string" },
                selfEsteemAnalysis: { type: "string" },
                trustAnalysis: { type: "string" },
              },
              required: ["alltimeAnalysis", "dayAnalysis", "last3daysAnalysis", "weekAnalysis", "yearAnalysis", "gratitudeAnalysis", "optimismAnalysis", "restednessAnalysis", "toleranceAnalysis", "selfEsteemAnalysis", "trustAnalysis"],
              additionalProperties: false,
            },
            strict: true,
          },
        },
        input: 'Please provide a series of 250 words analysis for the provided format',
      });

      const parsedOutput = JSON.parse(response.output_text)

      if (canReadPersistedHint) {
        if (existingDay) {
          await prisma.day.update({
            where: { id: existingDay.id },
            data: {
              analysis: {
                ...existingAnalysis,
                hint: parsedOutput
              }
            }
          })
        } else {
          await prisma.day.create({
            data: {
              userId: targetUser.id,
              date,
              week,
              month,
              quarter,
              semester,
              tasks: [],
              ticker: [],
              analysis: {
                hint: parsedOutput
              }
            }
          })
        }
      }

      return Response.json({ result: parsedOutput });

  } catch (error) {
    logger('hint_generation_error', `Failed to generate response: ${error}`);
    return Response.json({ error: "Failed to generate response" }, { status: 500 });
  }} else {
    return Response.json({ result: existingHint });
  }
  
  return Response.json(targetUser)
}
