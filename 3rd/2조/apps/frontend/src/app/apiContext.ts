import { createContext } from 'react'
import { createApiClient, type ApiClient } from '../api/client'
import { apiBaseUrl } from './apiMode'

// One API client for the app; tests provide their own (absolute base URL) through the provider.
export const ApiContext = createContext<ApiClient>(createApiClient({ baseUrl: apiBaseUrl }))
