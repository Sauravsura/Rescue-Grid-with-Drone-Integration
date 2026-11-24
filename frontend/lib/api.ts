import type { CitizenReport, DashboardData, Incident, Mission, RealtimeEvent } from "@/shared/types"

const API_BASE_URL = (process.env.NEXT_PUBLIC_API_BASE_URL || "http://localhost:8000").replace(/\/$/, "")
const API_PREFIX = "/api/v1"
const ACCESS_KEY = "drc-access-token"
const REFRESH_KEY = "drc-refresh-token"

export class ApiError extends Error {
  constructor(message: string, public readonly status: number) {
    super(message)
    this.name = "ApiError"
  }
}

/** Thrown for screens whose feature has no backend endpoint yet. */
export class UnsupportedByBackendError extends ApiError {
  constructor(feature: string) {
    super(`${feature} is not available in the backend yet.`, 501)
    this.name = "UnsupportedByBackendError"
  }
}

// ---------- casing helpers: backend is snake_case, frontend types are camelCase ----------

const snakeToCamel = (key: string) => key.replace(/_([a-z0-9])/g, (_, c: string) => c.toUpperCase())
const camelToSnake = (key: string) => key.replace(/[A-Z]/g, (c) => `_${c.toLowerCase()}`)

function convertKeys(value: unknown, convert: (key: string) => string): unknown {
  if (Array.isArray(value)) return value.map((item) => convertKeys(item, convert))
  if (value !== null && typeof value === "object" && !(value instanceof FormData)) {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>).map(([k, v]) => [convert(k), convertKeys(v, convert)]),
    )
  }
  return value
}

// ---------- session storage ----------

function readToken(key: string): string | null {
  if (typeof window === "undefined") return null
  return window.localStorage.getItem(key)
}

function saveSession(accessToken: string, refreshToken: string) {
  window.localStorage.setItem(ACCESS_KEY, accessToken)
  window.localStorage.setItem(REFRESH_KEY, refreshToken)
}

export function clearSession() {
  if (typeof window === "undefined") return
  window.localStorage.removeItem(ACCESS_KEY)
  window.localStorage.removeItem(REFRESH_KEY)
}

export function isSignedIn(): boolean {
  return Boolean(readToken(ACCESS_KEY))
}

// ---------- request core ----------

type RequestOptions = Omit<RequestInit, "body"> & {
  json?: unknown
  body?: BodyInit | null
  auth?: boolean
}

async function parseError(response: Response): Promise<string> {
  const text = await response.text().catch(() => "")
  try {
    const data = JSON.parse(text) as { detail?: unknown }
    if (typeof data.detail === "string") return data.detail
    if (data.detail) return JSON.stringify(data.detail)
  } catch {
    /* not JSON, fall through */
  }
  return text || `Request failed (${response.status})`
}

async function refreshSession(): Promise<boolean> {
  const refreshToken = readToken(REFRESH_KEY)
  if (!refreshToken) return false
  const response = await fetch(`${API_BASE_URL}${API_PREFIX}/auth/refresh`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ refresh_token: refreshToken }),
  })
  if (!response.ok) {
    clearSession()
    return false
  }
  const data = (await response.json()) as { access_token: string; refresh_token: string }
  saveSession(data.access_token, data.refresh_token)
  return true
}

async function request<T>(path: string, options: RequestOptions = {}, retried = false): Promise<T> {
  const { json, auth = true, ...init } = options
  const headers = new Headers(init.headers)
  let body: BodyInit | null | undefined = init.body

  if (json !== undefined) {
    body = JSON.stringify(convertKeys(json, camelToSnake))
    headers.set("Content-Type", "application/json")
  } else if (body && !(body instanceof FormData) && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json")
  }

  const accessToken = readToken(ACCESS_KEY)
  if (auth && accessToken) headers.set("Authorization", `Bearer ${accessToken}`)

  const response = await fetch(`${API_BASE_URL}${API_PREFIX}${path}`, { ...init, body, headers })

  if (response.status === 401 && auth && !retried && (await refreshSession())) {
    return request<T>(path, options, true)
  }
  if (!response.ok) throw new ApiError(await parseError(response), response.status)
  if (response.status === 204) return undefined as T
  return convertKeys(await response.json(), snakeToCamel) as T
}

const enc = encodeURIComponent

// ---------- public API used by the screens ----------

export const api = {
  // Auth. Returns the shape the login page reads: response.user.role
  login: async (credentials: { email: string; password: string }) => {
    const data = await request<{
      accessToken: string
      refreshToken: string
      role: string
      departmentId?: string
      userId: string
      name: string
    }>("/auth/login", { method: "POST", json: credentials, auth: false })
    saveSession(data.accessToken, data.refreshToken)
    return {
      accessToken: data.accessToken,
      user: { id: data.userId, name: data.name, role: data.role, departmentId: data.departmentId },
    }
  },
  me: () => request<{ id: string; name: string; email: string; role: string }>("/auth/me"),
  logout: () => clearSession(),

  // Citizen reports
  createReport: (payload: Partial<CitizenReport>) => {
    // Maps the frontend report shape to ReportCreateRequest (backend field names).
    const location = (payload as any).location as { latitude: number; longitude: number; accuracyMeters?: number } | undefined
    return request<CitizenReport>("/reports", {
      method: "POST",
      auth: false,
      json: {
        emergencyCategory: (payload as any).category,
        description: payload.description,
        latitude: location?.latitude,
        longitude: location?.longitude,
        locationAccuracy: location?.accuracyMeters,
        addressOrLandmark: (payload as any).address,
        peopleAffected: (payload as any).peopleAffected ?? 0,
        peopleTrapped: (payload as any).peopleTrapped ?? 0,
        submissionSource: "WEB",
      },
    })
  },
  myReports: () => request<CitizenReport[]>("/reports/my"),
  report: (id: string) => request<CitizenReport>(`/reports/${enc(id)}`),
  reportStatus: async (id: string) => {
    // No dedicated status endpoint in the backend: derive it from the report.
    const report = await request<{ status: string; updatedAt?: string }>(`/reports/${enc(id)}`)
    return { status: report.status, updates: [] as Array<{ at: string; text: string }> }
  },
  addReportUpdate: (id: string, payload: { text?: string }) =>
    request(`/reports/${enc(id)}/updates`, { method: "POST", json: payload }),
  uploadReportMedia: (id: string, formData: FormData) =>
    request(`/reports/${enc(id)}/media`, { method: "POST", body: formData }),

  // Incidents
  incidents: () => request<Incident[]>("/incidents"),
  incident: (id: string) => request<Incident>(`/incidents/${enc(id)}`),
  updateIncident: (id: string, patch: Partial<Incident>) =>
    request<Incident>(`/incidents/${enc(id)}`, { method: "PATCH", json: patch }),
  assignIncident: (id: string, departmentId: string) =>
    request(`/incidents/${enc(id)}/assign-department`, { method: "POST", json: { departmentId } }),
  linkReport: async (_incidentId: string, _reportId: string): Promise<never> => {
    throw new UnsupportedByBackendError("Linking a report to an incident")
  },
  unlinkReport: async (_incidentId: string, _reportId: string): Promise<never> => {
    throw new UnsupportedByBackendError("Unlinking a report")
  },
  // Backend: POST /incidents/{id}/review needs the link id and CONFIRM or REJECT.
  reviewGrouping: (incidentId: string, linkId: string, decision: "confirm" | "reject") =>
    request(`/incidents/${enc(incidentId)}/review`, {
      method: "POST",
      json: { linkId, action: decision === "confirm" ? "CONFIRM" : "REJECT" },
    }),

  // Drone missions (the backend calls these "missions"; the UI calls them "job cards")
  createJobCard: (incidentId: string, payload: { missionObjective: string; pilotId?: string; droneId?: string; departmentInstructions?: string }) =>
    request<Mission>("/missions", { method: "POST", json: { incidentId, ...payload } }),
  jobCards: () => request<Mission[]>("/missions"),
  jobCard: (id: string) => request<Mission>(`/missions/${enc(id)}`),
  acceptMission: (id: string, notes?: string) =>
    request(`/missions/${enc(id)}/accept`, { method: "POST", json: { notes } }),
  rejectMission: (id: string, rejectionReason: string) =>
    request(`/missions/${enc(id)}/reject`, { method: "POST", json: { rejectionReason } }),
  updateMissionStatus: (id: string, status: string, notes?: string) =>
    request(`/missions/${enc(id)}/status`, { method: "POST", json: { status, notes } }),
  submitFindings: (id: string, payload: Record<string, unknown>) =>
    request(`/missions/${enc(id)}/observations`, { method: "POST", json: payload }),

  // Fleet and departments
  drones: () => request<DashboardData["drones"]>("/drones"),
  droneStations: () => request<NonNullable<DashboardData["droneStations"]>>("/drones/stations"),
  departments: () => request<NonNullable<DashboardData["departments"]>>("/departments"),
  unlinkedReports: async (): Promise<never> => {
    throw new UnsupportedByBackendError("The unlinked reports queue")
  },
}

/**
 * Live updates. The backend WebSocket routes are /api/v1/ws/department/{id}
 * and /api/v1/ws/incidents/{id}. Set NEXT_PUBLIC_WS_URL to the full URL, for example
 * wss://your-backend.onrender.com/api/v1/ws/department/<department-id>.
 */
export function subscribeToEvents(onEvent: (event: RealtimeEvent) => void, onState?: (state: "connecting" | "connected" | "disconnected") => void) {
  const configuredUrl = process.env.NEXT_PUBLIC_WS_URL
  if (!configuredUrl || process.env.NEXT_PUBLIC_DEMO_MODE === "true") {
    onState?.("disconnected")
    return () => undefined
  }
  const socket = new WebSocket(configuredUrl)
  onState?.("connecting")
  socket.addEventListener("open", () => onState?.("connected"))
  socket.addEventListener("close", () => onState?.("disconnected"))
  socket.addEventListener("message", (message) => {
    try {
      onEvent(JSON.parse(message.data) as RealtimeEvent)
    } catch {
      /* ignore non-JSON heartbeats such as "pong" */
    }
  })
  return () => socket.close()
}

export const isDemoMode = () => process.env.NEXT_PUBLIC_DEMO_MODE !== "false"