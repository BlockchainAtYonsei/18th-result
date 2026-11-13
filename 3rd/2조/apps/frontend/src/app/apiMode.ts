// Where API calls go (design doc §9): Mock (MSW in the browser), or a Backend reached through the
// dev proxy (`/api`) or an absolute URL baked into the build. A saved override lets a deployed build
// fall back to Mock during a demo.
import { demoScenarioIds, fixtureScenarios, protocolModels, type FixtureScenario } from '../contracts/catalog'

export type ApiMode = 'mock' | 'backend'

const OVERRIDE_KEY = 'scl.apiMode.v1'

export function resolveApiMode(envMode: string | undefined, override: ApiMode | null): ApiMode {
  if (override) return override
  return envMode === 'backend' ? 'backend' : 'mock'
}

export function getModeOverride(): ApiMode | null {
  try {
    const v = localStorage.getItem(OVERRIDE_KEY)
    return v === 'mock' || v === 'backend' ? v : null
  } catch {
    return null
  }
}

export function setModeOverride(mode: ApiMode | null): void {
  try {
    if (mode === null) localStorage.removeItem(OVERRIDE_KEY)
    else localStorage.setItem(OVERRIDE_KEY, mode)
  } catch {
    // storage unavailable: the build setting stays in effect
  }
}

export function currentApiMode(): ApiMode {
  return resolveApiMode(import.meta.env.VITE_API_MODE, getModeOverride())
}

/** Empty means same-origin `/api` (the dev proxy). Set VITE_API_BASE_URL for a deployed Backend. */
export const apiBaseUrl: string = (import.meta.env.VITE_API_BASE_URL ?? '').replace(/\/$/, '')

/** What the top bar shows for the Backend in use. */
export function backendLabel(): string {
  return apiBaseUrl || import.meta.env.VITE_BACKEND_URL || 'http://127.0.0.1:8080'
}

/**
 * Constellation model versions to offer. The Public API has no list endpoint, so they come from
 * the contract's team research list and VITE_CONSTELLATION_MODELS. Mock mode explicitly selects its placeholder.
 */
export const constellationModelOptions: string[] = Array.from(
  new Set([
    ...protocolModels.approvedVersions,
    ...(import.meta.env.VITE_CONSTELLATION_MODELS ?? '')
      .split(',')
      .map((s: string) => s.trim())
      .filter(Boolean),
  ]),
)

/**
 * The frontend's demo scenarios live in apps/frontend/demo, not in the shared contract fixtures. The Mock always has
 * them. A Backend has them only if its fixture collector was pointed at the merged folder (docs/backend-wiring.md);
 * a build for a Backend that was not sets VITE_DEMO_FIXTURES=off so the app does not offer what would fail.
 */
export const demoOnBackend: boolean = import.meta.env.VITE_DEMO_FIXTURES !== 'off'

export function scenariosFor(mode: ApiMode, onBackend: boolean = demoOnBackend): FixtureScenario[] {
  return fixtureScenarios.filter((s) => {
    if (s.provenance.dataType === 'ON_CHAIN' && mode !== 'backend') return false
    return !(mode === 'backend' && !onBackend && demoScenarioIds.includes(s.fixtureId))
  })
}
