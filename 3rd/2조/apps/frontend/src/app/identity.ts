// Demo sign-in (design doc §6.1, §9): no external auth service. The name is kept in this browser only.
export interface Identity {
  name: string
  signedInAt: string
}

const KEY = 'scl.identity.v1'

export function getIdentity(): Identity | null {
  try {
    const raw = localStorage.getItem(KEY)
    if (!raw) return null
    const parsed = JSON.parse(raw) as Partial<Identity>
    return typeof parsed.name === 'string' && parsed.name.trim() !== '' && typeof parsed.signedInAt === 'string'
      ? { name: parsed.name, signedInAt: parsed.signedInAt }
      : null
  } catch {
    return null
  }
}

export function signIn(name: string): Identity {
  const identity: Identity = { name: name.trim(), signedInAt: new Date().toISOString() }
  try {
    localStorage.setItem(KEY, JSON.stringify(identity))
  } catch {
    // storage unavailable: the session still works until reload
  }
  return identity
}

export function signOut(): void {
  try {
    localStorage.removeItem(KEY)
  } catch {
    // ignore
  }
}
