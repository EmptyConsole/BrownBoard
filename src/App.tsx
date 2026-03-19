import { useState, useEffect } from 'react'
import { Whiteboard } from './whiteboard'
import { KanbanBoard } from './kanban'

function App() {
  const [currentPage, setCurrentPage] = useState<'whiteboard' | 'kanban'>('whiteboard')

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Only respond to number keys 1 and 2
      if (e.key === '1') {
        e.preventDefault()
        setCurrentPage('whiteboard')
      } else if (e.key === '2') {
        e.preventDefault()
        setCurrentPage('kanban')
      }
    }

    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [])

  return currentPage === 'whiteboard' ? <Whiteboard /> : <KanbanBoard />
}

export default App