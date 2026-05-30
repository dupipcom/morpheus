import { NextRequest, NextResponse } from 'next/server'
import { auth } from '@clerk/nextjs/server'
import { clerkClient } from '@clerk/nextjs/server'
// @ts-expect-error -- nodemailer has no bundled types; same pattern as unreadChatEmailNotifications.ts
import nodemailer from 'nodemailer'
import prisma from '@/lib/prisma'
import { sanitizeText } from '@/lib/utils/sanitize'

export const runtime = 'nodejs'

/**
 * Generates a Safari-friendly ICS calendar string.
 * Safari requires VCALENDAR with METHOD:REQUEST and proper line folding.
 */
function generateICS({
  summary,
  description,
  startDate,
  endDate,
  organizerEmail,
  organizerName,
  attendeeEmail,
  attendeeName,
  location,
}: {
  summary: string
  description: string
  startDate: Date
  endDate: Date
  organizerEmail: string
  organizerName: string
  attendeeEmail: string
  attendeeName: string
  location?: string
}): string {
  const uid = `${Date.now()}-${Math.random().toString(36).slice(2)}@dpip.cc`
  const now = formatICSDate(new Date())
  const dtStart = formatICSDate(startDate)
  const dtEnd = formatICSDate(endDate)

  const lines = [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//Dupip//MeetMe//EN',
    'CALSCALE:GREGORIAN',
    'METHOD:REQUEST',
    'BEGIN:VEVENT',
    `UID:${uid}`,
    `DTSTAMP:${now}`,
    `DTSTART:${dtStart}`,
    `DTEND:${dtEnd}`,
    `SUMMARY:${escapeICSText(summary)}`,
    `DESCRIPTION:${escapeICSText(description)}`,
    `ORGANIZER;CN=${escapeICSText(organizerName)}:mailto:${organizerEmail}`,
    `ATTENDEE;CN=${escapeICSText(attendeeName)};RSVP=TRUE;PARTSTAT=NEEDS-ACTION:mailto:${attendeeEmail}`,
    `ATTENDEE;CN=${escapeICSText(organizerName)};RSVP=FALSE;PARTSTAT=ACCEPTED:mailto:${organizerEmail}`,
    ...(location ? [`LOCATION:${escapeICSText(location)}`] : []),
    'STATUS:CONFIRMED',
    `CREATED:${now}`,
    `LAST-MODIFIED:${now}`,
    'SEQUENCE:0',
    'BEGIN:VALARM',
    'TRIGGER:-PT15M',
    'ACTION:DISPLAY',
    'DESCRIPTION:Reminder',
    'END:VALARM',
    'END:VEVENT',
    'END:VCALENDAR',
  ]

  return lines.join('\r\n')
}

function formatICSDate(date: Date): string {
  return date.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')
}

function escapeICSText(text: string): string {
  return text
    .replace(/\\/g, '\\\\')
    .replace(/;/g, '\\;')
    .replace(/,/g, '\\,')
    .replace(/\n/g, '\\n')
}

function createMailTransport() {
  const user = process.env.BREVO_SMTP_USER?.trim()
  const pass = process.env.BREVO_SMTP_PASS?.trim()

  if (!user || !pass) {
    throw new Error('Missing Brevo SMTP credentials')
  }

  const host = process.env.BREVO_SMTP_HOST?.trim() || 'smtp-relay.brevo.com'
  const port = Number(process.env.BREVO_SMTP_PORT || '587')

  return nodemailer.createTransport({
    host,
    port,
    secure: port === 465,
    auth: { user, pass },
  })
}

function getFromAddress() {
  const fromEmail = process.env.BREVO_SMTP_FROM_EMAIL?.trim()
  if (!fromEmail) {
    throw new Error('Missing BREVO_SMTP_FROM_EMAIL')
  }
  const fromName = process.env.BREVO_SMTP_FROM_NAME?.trim() || 'Dupip'
  return fromName ? `${fromName} <${fromEmail}>` : fromEmail
}

export async function POST(req: NextRequest) {
  const { userId } = await auth()

  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const body = await req.json()
    const { profileUsername, startTime, endTime, message } = body

    if (!profileUsername || !startTime || !endTime) {
      return NextResponse.json(
        { error: 'profileUsername, startTime, and endTime are required' },
        { status: 400 }
      )
    }

    const start = new Date(startTime)
    const end = new Date(endTime)

    if (isNaN(start.getTime()) || isNaN(end.getTime())) {
      return NextResponse.json({ error: 'Invalid date format' }, { status: 400 })
    }

    if (end <= start) {
      return NextResponse.json({ error: 'endTime must be after startTime' }, { status: 400 })
    }

    // Find the profile owner
    const targetProfile = await prisma.profile.findFirst({
      where: { username: profileUsername },
      select: { userId: true, username: true, data: true },
    })

    if (!targetProfile) {
      return NextResponse.json({ error: 'Profile not found' }, { status: 404 })
    }

    // Get the profile owner's Clerk user for email
    const targetUser = await prisma.user.findUnique({
      where: { id: targetProfile.userId },
      select: { userId: true },
    })

    if (!targetUser || !targetUser.userId) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 })
    }

    const clerk = await clerkClient()

    // Get profile owner's email from Clerk
    const targetClerkUser = await clerk.users.getUser(targetUser.userId)
    const targetEmail = targetClerkUser.emailAddresses?.[0]?.emailAddress
    if (!targetEmail) {
      return NextResponse.json({ error: 'Profile owner has no email' }, { status: 400 })
    }

    // Get booking user's info from Clerk
    const bookingClerkUser = await clerk.users.getUser(userId)
    const bookingEmail = bookingClerkUser.emailAddresses?.[0]?.emailAddress
    const bookingName = [bookingClerkUser.firstName, bookingClerkUser.lastName]
      .filter(Boolean)
      .join(' ') || bookingClerkUser.username || 'Someone'

    if (!bookingEmail) {
      return NextResponse.json({ error: 'Your account has no email' }, { status: 400 })
    }

    // Build names
    const profileData = targetProfile.data as Record<string, any> || {}
    const targetName = [profileData.firstName?.value, profileData.lastName?.value]
      .filter(Boolean)
      .join(' ') || profileUsername

    const sanitizedMessage = message ? sanitizeText(message) : ''
    const meetingSummary = `Meeting: ${bookingName} ↔ ${targetName}`
    const meetingDescription = sanitizedMessage
      ? `Meeting booked via Dupip.\n\nMessage: ${sanitizedMessage}`
      : 'Meeting booked via Dupip.'

    // Generate Safari-friendly ICS
    const icsContent = generateICS({
      summary: meetingSummary,
      description: meetingDescription,
      startDate: start,
      endDate: end,
      organizerEmail: `${profileUsername}@dpip.cc`,
      organizerName: targetName,
      attendeeEmail: bookingEmail,
      attendeeName: bookingName,
    })

    // Build email
    const transport = createMailTransport()
    const from = getFromAddress()

    const emailHtml = `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto;">
        <h2 style="color: #333;">Meeting Booked</h2>
        <p><strong>${bookingName}</strong> has booked a meeting with <strong>${targetName}</strong>.</p>
        <table style="border-collapse: collapse; width: 100%; margin: 16px 0;">
          <tr>
            <td style="padding: 8px; border: 1px solid #eee; font-weight: bold;">When</td>
            <td style="padding: 8px; border: 1px solid #eee;">${start.toLocaleString('en-US', { dateStyle: 'full', timeStyle: 'short', timeZone: 'UTC' })} UTC</td>
          </tr>
          <tr>
            <td style="padding: 8px; border: 1px solid #eee; font-weight: bold;">Duration</td>
            <td style="padding: 8px; border: 1px solid #eee;">${Math.round((end.getTime() - start.getTime()) / 60000)} minutes</td>
          </tr>
          ${sanitizedMessage ? `<tr><td style="padding: 8px; border: 1px solid #eee; font-weight: bold;">Message</td><td style="padding: 8px; border: 1px solid #eee;">${sanitizedMessage}</td></tr>` : ''}
        </table>
        <p style="color: #666; font-size: 13px;">A calendar invite (.ics) is attached. Add it to your calendar to confirm the time.</p>
        <p style="color: #999; font-size: 11px;">Sent via Dupip · dpip.cc</p>
      </div>
    `

    const emailText = `Meeting Booked\n\n${bookingName} has booked a meeting with ${targetName}.\nWhen: ${start.toISOString()}\nDuration: ${Math.round((end.getTime() - start.getTime()) / 60000)} minutes\n${sanitizedMessage ? `Message: ${sanitizedMessage}\n` : ''}\nA calendar invite is attached.`

    const icsAttachment = {
      filename: 'meeting.ics',
      content: icsContent,
      contentType: 'text/calendar; charset=utf-8; method=REQUEST',
    }

    // Recipient list for the profile owner: their Clerk email + {username}@dpip.cc
    const ownerRecipients = [targetEmail, `${profileUsername}@dpip.cc`]
      .filter((e, i, arr) => arr.indexOf(e) === i) // dedupe

    const subject = `Meeting: ${bookingName} ↔ ${targetName}`

    // Send to profile owner
    await transport.sendMail({
      from,
      to: ownerRecipients.join(', '),
      subject,
      text: emailText,
      html: emailHtml,
      icalEvent: {
        filename: 'meeting.ics',
        method: 'REQUEST',
        content: icsContent,
      },
      attachments: [icsAttachment],
    })

    // Send copy to the booking user
    await transport.sendMail({
      from,
      to: bookingEmail,
      subject: `[Copy] ${subject}`,
      text: emailText,
      html: emailHtml,
      icalEvent: {
        filename: 'meeting.ics',
        method: 'REQUEST',
        content: icsContent,
      },
      attachments: [icsAttachment],
    })

    return NextResponse.json({ success: true, message: 'Meeting booked and invites sent' })
  } catch (error) {
    console.error('Error booking meeting:', error)
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 })
  }
}
