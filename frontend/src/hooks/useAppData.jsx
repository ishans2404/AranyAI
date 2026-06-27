import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { api } from '../lib/api'

const AppDataContext = createContext(null)

export function AppDataProvider({ children }) {
  const [aois, setAois] = useState([])
  const [aoisLoaded, setAoisLoaded] = useState(false)
  const [rangers, setRangers] = useState([])
  const [rangersLoaded, setRangersLoaded] = useState(false)

  const refreshAois = useCallback(() => {
    return api.listAois()
      .then(setAois)
      .catch(err => console.error('AOI list load failed:', err))
      .finally(() => setAoisLoaded(true))
  }, [])

  const refreshRangers = useCallback(() => {
    return api.listRangers()
      .then(setRangers)
      .catch(err => console.error('Ranger list load failed:', err))
      .finally(() => setRangersLoaded(true))
  }, [])

  useEffect(() => { refreshAois(); refreshRangers() }, [refreshAois, refreshRangers])

  return (
    <AppDataContext.Provider value={{
      aois, aoisLoaded, refreshAois,
      rangers, rangersLoaded, refreshRangers,
    }}>
      {children}
    </AppDataContext.Provider>
  )
}

export function useAppData() {
  const ctx = useContext(AppDataContext)
  if (!ctx) throw new Error('useAppData must be used within AppDataProvider')
  return ctx
}
