import { NextResponse } from 'next/server';
import { requireApiKeyProject } from '@/lib/api-key';
import { listConfigsForProject } from '@/lib/experiment-repo';

// The SDK's entire "dynamic config" story is this one endpoint: it fetches
// this (with its own local TTL cache — see @cro-engine/sdk), then evaluates
// bucketing LOCALLY via assign() from @cro-engine/assignment-engine. This
// route never computes anyone's bucket, it only returns config.
export async function GET(request: Request) {
  const projectId = await requireApiKeyProject(request);
  if (!projectId) return NextResponse.json({ error: 'Invalid or missing API key' }, { status: 401 });

  const experiments = await listConfigsForProject(projectId);
  return NextResponse.json({ experiments });
}
