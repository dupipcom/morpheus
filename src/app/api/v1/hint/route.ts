import { NextRequest } from 'next/server';
import { auth } from '@clerk/nextjs/server'
import prisma from "@/lib/prisma";
import { getWeekNumber } from '@/app/helpers'
import { getDelegationScopes } from '@/lib/utils/delegation'
import { resolveNoteVisibilityFilter } from '@/lib/services/visibility/noteAccess'
import { z } from 'zod'
import { DEEPSEEK_CHAT_MODEL, getDeepseekOpenAI } from '@/lib/deepseek'
import {
  AGENT_DIMENSIONS,
  buildDaySelectForDimensions,
  buildDayWhere,
  buildHintMessages,
  buildRagForQuery,
  chunkNotes,
  compactDay,
  fetchCompactNotes,
  HINT_ANALYSIS_KEYS
} from '@/lib/services/agent'
import type { AgentDayRecord, CompactDay } from '@/lib/services/agent'

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
export const maxDuration = 120;

/** Fixed retrieval query — the hint always analyzes the same dimensions */
const HINT_QUERY = 'mood trends, gratitude, optimism, restedness, tolerance, selfEsteem, trust, task completion, progress, correlations with mood and money';

type DelegationVisibilityAccess =
  | { kind: 'full' }
  | { kind: 'restricted'; visibilities: Array<'PUBLIC' | 'FRIENDS' | 'CLOSE_FRIENDS'> }
  | { kind: 'invalid' }

function resolveDelegationVisibilityAccess(scopes: string[]): DelegationVisibilityAccess {
  if (scopes.length === 0) return { kind: 'invalid' }

  const allVisibilities = new Set<'PUBLIC' | 'FRIENDS' | 'CLOSE_FRIENDS'>()
  for (const scope of scopes) {
    switch (scope) {
      case 'PRIVATE':
      case 'AI_ENABLED':
        return { kind: 'full' }
      case 'PUBLIC':
        allVisibilities.add('PUBLIC')
        break
      case 'CLOSE_FRIENDS':
        allVisibilities.add('PUBLIC')
        allVisibilities.add('CLOSE_FRIENDS')
        break
      case 'FRIENDS':
        allVisibilities.add('PUBLIC')
        allVisibilities.add('FRIENDS')
        allVisibilities.add('CLOSE_FRIENDS')
        break
      case 'DOC_ENABLED':
        // Defensive: DOC_ENABLED is not a grantable scope; grants no day access
        break
      default:
        // Skip unrecognized scopes rather than discarding accumulated access
        break
    }
  }
  return { kind: 'restricted', visibilities: Array.from(allVisibilities) }
}

/**
 * DeepSeek offers JSON mode via response_format {type:'json_object'} (not
 * json_schema), so the output contract is validated here with zod.
 */
const HINT_SCHEMA = z.object({
  alltimeAnalysis: z.string().min(10),
  dayAnalysis: z.string().min(10),
  last3daysAnalysis: z.string().min(10),
  weekAnalysis: z.string().min(10),
  yearAnalysis: z.string().min(10),
  gratitudeAnalysis: z.string().min(10),
  optimismAnalysis: z.string().min(10),
  restednessAnalysis: z.string().min(10),
  toleranceAnalysis: z.string().min(10),
  selfEsteemAnalysis: z.string().min(10),
  trustAnalysis: z.string().min(10)
})

type HintAnalysis = z.infer<typeof HINT_SCHEMA>

function parseHintOutput(raw: string | null | undefined): HintAnalysis | null {
  if (!raw) return null
  try {
    const result = HINT_SCHEMA.safeParse(JSON.parse(raw))
    return result.success ? result.data : null
  } catch {
    return null
  }
}

async function generateHintAnalysis(
  messages: Array<{ role: 'system' | 'user'; content: string }>
): Promise<HintAnalysis> {
  let currentMessages = messages

  for (let attempt = 0; attempt < 2; attempt++) {
    const completion = await getDeepseekOpenAI().chat.completions.create({
      model: DEEPSEEK_CHAT_MODEL,
      messages: currentMessages,
      response_format: { type: 'json_object' },
      max_tokens: 8192,
      temperature: 0.3
    })

    const parsed = parseHintOutput(completion.choices[0]?.message?.content)
    if (parsed) return parsed

    if (attempt === 0) {
      currentMessages = [
        ...currentMessages,
        {
          role: 'user',
          content: `Your previous output was not a valid JSON object with the required keys. Return ONLY a JSON object with exactly these keys: ${HINT_ANALYSIS_KEYS.join(', ')}`
        }
      ]
    }
  }

  throw new Error('Hint output validation failed after retry')
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

  const requestingUser = await prisma.user.findUnique({
    where: { userId: clerkUserId },
    select: { id: true }
  })

  if (!requestingUser) {
    return Response.json({ error: 'User not found' }, { status: 404 })
  }

  const targetUserId = requestedUserId || requestingUser.id
  let delegationAccess: DelegationVisibilityAccess = { kind: 'full' }
  let noteVisibilityFilter: ReturnType<typeof resolveNoteVisibilityFilter> = undefined

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

    if (delegationScopes.length === 0) {
      return Response.json({ error: 'Delegation exists but has no valid scope configured' }, { status: 403 })
    }

    delegationAccess = resolveDelegationVisibilityAccess(delegationScopes)
    if (delegationAccess.kind === 'invalid') {
      return Response.json({ error: 'Delegation scope contains an unrecognized value' }, { status: 403 })
    }

    noteVisibilityFilter = resolveNoteVisibilityFilter(delegation.scopes, delegation.scope)
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
      // Minimal MongoDB payload: only the fields the hint dimensions need.
      // `analysis` and `productivity` are never selected (recursion guard).
      const dimensions = [...AGENT_DIMENSIONS]
      const days = await prisma.day.findMany({
        where: buildDayWhere(
          targetUser.id,
          undefined,
          undefined,
          delegationAccess.kind === 'restricted' ? delegationAccess.visibilities : undefined
        ),
        select: buildDaySelectForDimensions(dimensions),
        orderBy: { date: 'asc' }
      })

      const compactDays = days
        .map((day) => compactDay(day as AgentDayRecord, dimensions))
        .filter((day): day is CompactDay => day !== null)

      const startDate = compactDays.length > 0 ? compactDays[0].date : date
      const endDate = compactDays.length > 0 ? compactDays[compactDays.length - 1].date : date

      const compactNotes = await fetchCompactNotes({
        targetUserId: targetUser.id,
        userLabel: targetUserId === requestingUser.id ? 'you' : 'the delegated user',
        startDate,
        endDate,
        dimensions,
        noteVisibilityFilter,
        isRestricted: delegationAccess.kind !== 'full'
      })

      const rag = await buildRagForQuery(compactDays, HINT_QUERY, {
        dimensions,
        userChunkTopK: 12,
        docChunkTopK: 4,
        noteChunks: chunkNotes(compactNotes)
      })

      const parsedOutput = await generateHintAnalysis(
        buildHintMessages({ locale, startDate, endDate, rag })
      )

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
          try {
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
          } catch (createError: unknown) {
            const errorCode =
              createError && typeof createError === 'object' && 'code' in createError
                ? (createError as { code?: unknown }).code
                : undefined
            if (errorCode === 'P2002') {
              // Day was just created by a concurrent request — merge the hint into it
              const createdDay = await prisma.day.findFirst({
                where: { userId: targetUser.id, date }
              })
              if (createdDay) {
                await prisma.day.update({
                  where: { id: createdDay.id },
                  data: {
                    analysis: {
                      ...(createdDay.analysis && typeof createdDay.analysis === 'object' && !Array.isArray(createdDay.analysis)
                        ? createdDay.analysis as Record<string, unknown>
                        : {}),
                      hint: parsedOutput
                    }
                  }
                })
              }
            } else {
              throw createError
            }
          }
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
