import { NextRequest } from 'next/server'
import { revalidatePath, revalidateTag } from 'next/cache'
import { auth, currentUser } from '@clerk/nextjs/server'

export async function POST(req: NextRequest) {
  try {
    // Check if user is authenticated
    const { userId } = await auth()
    const { paths, tags, secretKey } = await req.json()

    if (!userId && secretKey !== process.env.REVALIDATE_SECRET_KEY) {
      return Response.json({ error: 'Not authenticated' }, { status: 401 })
    }


    // Revalidate specific paths
    if (paths && Array.isArray(paths)) {
      for (const path of paths) {
        revalidatePath(path)
      }
    }

    // Revalidate specific tags
    if (tags && Array.isArray(tags)) {
      for (const tag of tags) {
        revalidateTag(tag)
      }
    }

    return Response.json({ 
      revalidated: true, 
      paths: paths || [],
      tags: tags || [],
      now: Date.now() 
    })
  } catch (error) {
    console.error('Error revalidating:', error)
    return Response.json({ error: 'Internal server error' }, { status: 500 })
  }
}
