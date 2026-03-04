import './App.css'
import { useEffect } from 'react'
import { CanvasSurface } from './canvas/CanvasSurface'
import { PropertiesPanel } from './components/PropertiesPanel'
import { Toolbar } from './components/Toolbar'
import { startRealtimeSync } from './services/realtime'
import { useSupabaseSync } from './hooks/useSupabaseSync'
import { GithubPanel } from './components/GithubPanel'

function App() {
  useSupabaseSync()
  useEffect(() => {
    try {
      const channel = startRealtimeSync()
      return () => {
        channel?.unsubscribe?.()
      }
    } catch (err) {
      console.error('Supabase realtime sync failed:', err)
    }
  }, [])

  return (
    <div className="app-shell">
      <div className="app-sidebar-placeholder">
        <Toolbar />
      </div>
      <div className="app-canvas-area">
        <CanvasSurface />
      </div>
      <div className="app-panel-placeholder">
        <div className="panel-stack">
          <PropertiesPanel />
          <GithubPanel />
        </div>
      </div>
    </div>
  )
}

export default App
