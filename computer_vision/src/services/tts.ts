export type Voice = {
  voice_id: string
  name: string
}

const request = async (path: string, init?: RequestInit): Promise<Response> => {
  const configuredApiUrl = import.meta.env.VITE_API_URL?.trim()
  const apiUrl = (configuredApiUrl ?? (import.meta.env.DEV
    ? 'http://localhost:8000'
    : '')).replace(/\/+$/, '')
  if (!apiUrl) {
    throw new Error('The production API is not configured. Set VITE_API_URL in Netlify and redeploy.')
  }
  const endpoint = `${apiUrl}${path}`
  let response: Response
  try {
    response = await fetch(endpoint, init)
  } catch (error) {
    throw new Error(
      `Could not reach the backend at ${endpoint}. Check VITE_API_URL, the Railway public domain, and CORS.`,
      { cause: error },
    )
  }
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(`${endpoint} returned HTTP ${response.status}: ${detail || 'No response detail.'}`)
  }
  return response
}

export async function getVoices(): Promise<Voice[]> {
  const response = await request('/api/tts/voices')
  const result = await response.json() as { voices?: Voice[] }
  return result.voices ?? []
}

export async function generateSpeech(
  text: string,
  voiceId?: string,
  modelId?: string,
  signal?: AbortSignal,
): Promise<Blob> {
  const response = await request('/api/tts/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice_id: voiceId, model_id: modelId }),
    signal,
  })
  return response.blob()
}
