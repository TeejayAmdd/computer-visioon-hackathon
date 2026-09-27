export type Voice = {
  voice_id: string
  name: string
}

const request = async (path: string, init?: RequestInit): Promise<Response> => {
  const apiUrl = (import.meta.env.VITE_API_URL ?? (import.meta.env.DEV
    ? 'http://localhost:8000'
    : 'https://computervision-production.up.railway.app')).replace(/\/+$/, '')
  const response = await fetch(`${apiUrl}${path}`, init)
  if (!response.ok) {
    const detail = await response.text()
    throw new Error(detail || `HTTP ${response.status}`)
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
): Promise<Blob> {
  const response = await request('/api/tts/speak', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ text, voice_id: voiceId, model_id: modelId }),
  })
  return response.blob()
}
