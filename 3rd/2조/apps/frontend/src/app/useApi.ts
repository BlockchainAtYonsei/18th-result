import { useContext } from 'react'
import type { ApiClient } from '../api/client'
import { ApiContext } from './apiContext'

export function useApi(): ApiClient {
  return useContext(ApiContext)
}
