import { useMemo } from 'react'
import { useCanvasStore } from '../store/canvasStore'
import type { CanvasTool } from '../types/canvas'
import { runLayoutAssistant } from '../services/aiAssist'

type ToolSpec = {
  id: CanvasTool
  label: string
}

const tools: ToolSpec[] = [
  { id: 'select', label: 'Select' },
  { id: 'frame', label: 'Frame' },
  { id: 'shape-rect', label: 'Rect' },
  { id: 'shape-ellipse', label: 'Ellipse' },
  { id: 'freehand', label: 'Freehand' },
  { id: 'text', label: 'Text' },
  { id: 'sticky', label: 'Sticky' },
  { id: 'arrow', label: 'Arrow' },
  { id: 'connector', label: 'Connector' },
  { id: 'prototype-button', label: 'Proto Btn' },
  { id: 'prototype-slider', label: 'Proto Sldr' },
  { id: 'prototype-panel', label: 'Proto Panel' },
  { id: 'prototype-collider', label: 'Collider' },
  { id: 'prototype-player', label: 'Player' },
]

export function Toolbar() {
  const activeTool = useCanvasStore((state) => state.activeTool)
  const setActiveTool = useCanvasStore((state) => state.setActiveTool)

  const groupedTools = useMemo(() => tools, [])

  return (
    <div className="toolbar">
      {groupedTools.map((tool) => (
        <button
          key={tool.id}
          className={`tool-button ${activeTool === tool.id ? 'is-active' : ''}`}
          onClick={() => setActiveTool(tool.id)}
          type="button"
        >
          {tool.label}
        </button>
      ))}
      <button className="tool-button" type="button" onClick={() => runLayoutAssistant()}>
        AI tidy
      </button>
    </div>
  )
}
