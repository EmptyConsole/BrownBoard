import React, { useRef, useEffect, useState } from 'react'
import {
  Pen,
  Trash2,
  Minus,
  Plus,
  Undo2,
  Redo2,
  Settings,
  X,
  MousePointer2,
  Square,
  Circle,
  Star,
  Heart,
} from 'lucide-react'
import { HexColorPicker } from 'react-colorful'
import { supabase } from './lib/supabase'

interface DrawAction {
  id?: string
  type: 'stroke' | 'shape'
  userId?: string
  drawing: true | false
  points: { x: number; y: number }[]
  lineWidth?: number
  drawColor?: string
  shapeKind?: 'rectangle' | 'circle' | 'star' | 'heart'
  shapeFill?: 'outline' | 'fill'
  // for resize support
  transform?: { scaleX: number; scaleY: number; originX: number; originY: number }
}

/**
 * Whiteboard component for drawing and erasing on a canvas.
 * Provides a drawing interface with:
 * - Pen tool for drawing strokes
 * - Eraser tool for removing content
 * - Adjustable brush/eraser size via range slider
 * - Clear canvas button to reset
 * - Visual cursor circle that tracks mouse position and reflects current brush size
 *
 * @component
 * @returns {JSX.Element} A full-screen whiteboard application with toolbar and canvas
 *
 * @note `px` and `py` refer to pixel coordinates (x and y positions) in the canvas coordinate system.
 * They represent the horizontal and vertical position respectively of a point being drawn or erased.
 */
export const Whiteboard: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const [isDrawing, setIsDrawing] = useState(false)
  const [tool, setTool] = useState<'pen' | 'select' | 'shape'>('select')
  const [actions, setActions] = useState<DrawAction[]>([])
  const [currentAction, setCurrentAction] = useState<DrawAction | null>(null)
  const [mouseSize, setMouseSize] = useState(10)
  const [drawColor, setDrawColor] = useState('#000000')
  const [panX, setPanX] = useState(0)
  const [panY, setPanY] = useState(0)
  const [scale, setScale] = useState(1)
  const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 })
  const panRef = useRef({ x: 0, y: 0 })
  const scaleRef = useRef(1)
  const cursorTargetRef = useRef({ x: 0, y: 0 })
  const cursorRef = useRef({ x: 0, y: 0 })
  const [isPanning, setIsPanning] = useState(false)
  const [panStart, setPanStart] = useState({ x: 0, y: 0 })
  const pinchStartDistance = useRef<number | null>(null)
  const myUndoStack = useRef<DrawAction[]>([]) // strokes I can undo
  const myRedoStack = useRef<DrawAction[]>([]) // strokes I can redo
  const [canUndo, setCanUndo] = useState(false)
  const [canRedo, setCanRedo] = useState(false)
  // const [showColorPicker, setShowColorPicker] = useState(false)
  const swatches = [
    '#0a0a0a',
    '#ffffff',
    '#ef4444',
    '#f97316',
    '#eab308',
    '#22c55e',
    '#06b6d4',
    '#3b82f6',
    '#8b5cf6',
    '#ec4899',
    '#f43f5e',
    '#64748b',
  ]
  const [otherCursors, setOtherCursors] = useState<{ x: number; y: number; userId: string }[]>([])
  const userIdRef = useRef<string>(crypto.randomUUID())
  const isSubscribedRef = useRef(false)
  const channelRef = useRef<any>(null)
  const myClearStack = useRef<{ actions: DrawAction[]; undoStack: DrawAction[] }[]>([])
  const actionsRef = useRef<DrawAction[]>([])
  const myClearRedoStack = useRef<{ actions: DrawAction[]; undoStack: DrawAction[] }[]>([])
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
  const [isDraggingSelection, setIsDraggingSelection] = useState(false)
  const [isResizingSelection, setIsResizingSelection] = useState<string | null>(null)
  const [marquee, setMarquee] = useState<{ x: number; y: number; w: number; h: number } | null>(
    null,
  )
  const marqueeStartRef = useRef<{ x: number; y: number } | null>(null)
  const dragStartRef = useRef<{ x: number; y: number; snapshots: DrawAction[] } | null>(null)
  const resizeStartRef = useRef<{
    x: number
    y: number
    bbox: BBox
    snapshots: DrawAction[]
  } | null>(null)
  // const [openPanel, setOpenPanel] = useState<'color' | null>(null)
  const [cursorColor, setCursorColor] = useState('#000000')
  const otherCursorColors = useRef<Map<string, string>>(new Map())
  const [hoveredId, setHoveredId] = useState<string | null>(null)
  const [hoveredHandle, setHoveredHandle] = useState<string | null>(null)

  //SETTINGS
  const [showSettings, setShowSettings] = useState(false)
  const [colorScheme, setColorScheme] = useState<'light' | 'dark' | 'custom'>('light')
  const [hudSize, setHudSize] = useState<'small' | 'medium' | 'large'>('medium')
  const [cursorStyle, setCursorStyle] = useState<'circle' | 'dot' | 'crosshair'>('circle')
  const [showGrid, setShowGrid] = useState(false)
  const [gridSize, setGridSize] = useState(50)
  const [snapToGrid, setSnapToGrid] = useState(false)
  const [customBg, setCustomBg] = useState('#ffffff')
  // const [customToolbar] = useState('#f9fafb')
  const [shapeKind, setShapeKind] = useState<'rectangle' | 'circle' | 'star' | 'heart'>('rectangle')
  const [shapeFillMode, setShapeFillMode] = useState<'outline' | 'fill'>('outline')
  const [showShapePanel, setShowShapePanel] = useState(false)
  const shapeHoverTimeout = useRef<number | null>(null)
  const [hideCursorWhileHudClick, setHideCursorWhileHudClick] = useState(false)
  // const [hideCursorWhileHudHover, setHideCursorWhileHudHover] = useState(false)
  const prevBodyCursor = useRef<string>('')

  const shapeIcons: Record<
    typeof shapeKind,
    React.ComponentType<{ size?: number; strokeWidth?: number }>
  > = {
    rectangle: Square,
    circle: Circle,
    star: Star,
    heart: Heart,
  }

  const updatePan = (x: number, y: number) => {
    panRef.current = { x, y }
    setPanX(x)
    setPanY(y)
  }

  const openShapePanel = () => {
    if (shapeHoverTimeout.current) {
      clearTimeout(shapeHoverTimeout.current)
      shapeHoverTimeout.current = null
    }
    setShowShapePanel(true)
  }

  const closeShapePanel = () => {
    if (shapeHoverTimeout.current) clearTimeout(shapeHoverTimeout.current)
    shapeHoverTimeout.current = window.setTimeout(() => {
      setShowShapePanel(false)
      shapeHoverTimeout.current = null
    }, 120)
  }

  // Hide custom cursor while clicking toolbar/popup; re-show on mouseup anywhere.
  useEffect(() => {
    const handleMouseUp = () => setHideCursorWhileHudClick(false)
    window.addEventListener('mouseup', handleMouseUp)
    return () => window.removeEventListener('mouseup', handleMouseUp)
  }, [])

  useEffect(() => {
    if (hideCursorWhileHudClick) {
      prevBodyCursor.current = document.body.style.cursor
      document.body.style.cursor = 'none'
    } else {
      document.body.style.cursor = prevBodyCursor.current
    }
    return () => {
      document.body.style.cursor = prevBodyCursor.current
    }
  }, [hideCursorWhileHudClick])

  const handleCanvasPan = (
    e: React.MouseEvent<HTMLCanvasElement> | MouseEvent,
    isMouseDown: boolean,
  ) => {
    // e.preventDefault();
    if (isMouseDown) {
      // Start pan on right-click
      const canvas = canvasRef.current
      if (!canvas) return
      setIsPanning(true)
      setPanStart({ x: e.clientX - panRef.current.x, y: e.clientY - panRef.current.y })
    } else {
      // Update pan position on mouse move
      if (!isPanning) return
      updatePan(e.clientX - panStart.x, e.clientY - panStart.y)
    }
  }

  const clampScale = (value: number) => Math.max(0.25, Math.min(4, value))

  // Convert world coordinates (stored in Supabase presence) to screen coordinates used by the SVG overlay.
  //   const worldToScreen = (worldX: number, worldY: number) => {
  //     const canvas = canvasRef.current
  //     if (!canvas) return { x: 0, y: 0 }
  //     const rect = canvas.getBoundingClientRect()
  //     return {
  //       x: worldX * scaleRef.current + panRef.current.x + rect.left,
  //       y: worldY * scaleRef.current + panRef.current.y + rect.top,
  //     }
  //   }

  // Zoom keeping the whiteboard content under the focal point stationary.
  const zoomAtPoint = (factor: number, clientX: number, clientY: number) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const focusX = clientX - rect.left
    const focusY = clientY - rect.top
    const prevScale = scaleRef.current
    const nextScale = clampScale(prevScale * factor)
    const worldX = (focusX - panRef.current.x) / prevScale
    const worldY = (focusY - panRef.current.y) / prevScale
    const nextPanX = focusX - worldX * nextScale
    const nextPanY = focusY - worldY * nextScale
    scaleRef.current = nextScale
    setScale(nextScale)
    updatePan(nextPanX, nextPanY)
    resizeDrawWidth(mouseSize)
  }

  const stopPan = () => {
    setIsPanning(false)
  }

  // store canvas dimensions so we can drive the SVG overlay and
  // re‑size when the window changes without losing existing drawings
  const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 })
  // smooth cursor marker that follows pointer
  useEffect(() => {
    let raf: number
    const tick = () => {
      const lerp = 1
      const nextX = cursorRef.current.x + (cursorTargetRef.current.x - cursorRef.current.x) * lerp
      const nextY = cursorRef.current.y + (cursorTargetRef.current.y - cursorRef.current.y) * lerp
      cursorRef.current = { x: nextX, y: nextY }
      setCursorPos(cursorRef.current)
      raf = requestAnimationFrame(tick)
    }
    raf = requestAnimationFrame(tick)
    return () => cancelAnimationFrame(raf)
  }, [])

  type BBox = { minX: number; minY: number; maxX: number; maxY: number }
  const getMultiBBox = (acts: DrawAction[]): BBox | null => {
    if (acts.length === 0) return null
    const boxes = acts.map(getBBox)
    return {
      minX: Math.min(...boxes.map((b) => b.minX)),
      minY: Math.min(...boxes.map((b) => b.minY)),
      maxX: Math.max(...boxes.map((b) => b.maxX)),
      maxY: Math.max(...boxes.map((b) => b.maxY)),
    }
  }

  const bboxesIntersect = (a: BBox, b: BBox) =>
    a.minX <= b.maxX && a.maxX >= b.minX && a.minY <= b.maxY && a.maxY >= b.minY
  const getBBox = (action: DrawAction): BBox => {
    if (action.type === 'shape' && action.points.length >= 2) {
      const [s, e] = action.points
      return {
        minX: Math.min(s.x, e.x),
        minY: Math.min(s.y, e.y),
        maxX: Math.max(s.x, e.x),
        maxY: Math.max(s.y, e.y),
      }
    }
    const xs = action.points.map((p) => p.x)
    const ys = action.points.map((p) => p.y)
    return {
      minX: Math.min(...xs),
      minY: Math.min(...ys),
      maxX: Math.max(...xs),
      maxY: Math.max(...ys),
    }
  }

  const pointInBBox = (x: number, y: number, bbox: BBox, padding = 8) =>
    x >= bbox.minX - padding &&
    x <= bbox.maxX + padding &&
    y >= bbox.minY - padding &&
    y <= bbox.maxY + padding

  const HANDLE_SIZE = 8
  const getResizeHandles = (bbox: BBox) => [
    { id: 'nw', x: bbox.minX, y: bbox.minY },
    { id: 'ne', x: bbox.maxX, y: bbox.minY },
    { id: 'se', x: bbox.maxX, y: bbox.maxY },
    { id: 'sw', x: bbox.minX, y: bbox.maxY },
  ]

  // helper that performs full redraw; can be called from resize handler
  const redraw = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (canvasSize.width === 0 || canvasSize.height === 0) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = canvasSize.width
    canvas.height = canvasSize.height
    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // background
    ctx.fillStyle =
      colorScheme === 'dark' ? '#1a1a1a' : colorScheme === 'custom' ? customBg : 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // grid
    if (showGrid) {
      ctx.save()
      ctx.translate(panX, panY)
      ctx.scale(scale, scale)
      ctx.strokeStyle = colorScheme === 'dark' ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.15)'
      ctx.lineWidth = 1 / scale
      const startX = -panX / scale
      const startY = -panY / scale
      const endX = startX + canvas.width / scale
      const endY = startY + canvas.height / scale
      const snappedStartX = Math.floor(startX / gridSize) * gridSize
      const snappedStartY = Math.floor(startY / gridSize) * gridSize
      for (let x = snappedStartX; x < endX; x += gridSize) {
        ctx.beginPath()
        ctx.moveTo(x, startY)
        ctx.lineTo(x, endY)
        ctx.stroke()
      }
      for (let y = snappedStartY; y < endY; y += gridSize) {
        ctx.beginPath()
        ctx.moveTo(startX, y)
        ctx.lineTo(endX, y)
        ctx.stroke()
      }
      ctx.restore()
    }

    // draw all actions
    ctx.save()
    ctx.translate(panX, panY)
    ctx.scale(scale, scale)
    const drawShapePath = (c: CanvasRenderingContext2D, action: DrawAction) => {
      if (!action.points || action.points.length < 2) return
      const [start, end] = action.points
      const width = end.x - start.x
      const height = end.y - start.y
      const centerX = start.x + width / 2
      const centerY = start.y + height / 2
      const absW = Math.abs(width)
      const absH = Math.abs(height)
      c.beginPath()
      switch (action.shapeKind) {
        case 'rectangle': {
          const x = Math.min(start.x, end.x)
          const y = Math.min(start.y, end.y)
          c.rect(x, y, absW, absH)
          break
        }
        case 'circle': {
          c.ellipse(
            centerX,
            centerY,
            Math.max(absW / 2, 1),
            Math.max(absH / 2, 1),
            0,
            0,
            Math.PI * 2,
          )
          break
        }
        case 'star': {
          const outerRadius = Math.max(absW, absH) / 2 || 1
          const innerRadius = outerRadius * 0.5
          for (let i = 0; i < 10; i++) {
            const angle = (Math.PI / 5) * i
            const r = i % 2 === 0 ? outerRadius : innerRadius
            const px = centerX + Math.cos(angle - Math.PI / 2) * r
            const py = centerY + Math.sin(angle - Math.PI / 2) * r
            i === 0 ? c.moveTo(px, py) : c.lineTo(px, py)
          }
          c.closePath()
          break
        }
        case 'heart': {
          const sx = absW / 2 || 1
          const sy = absH / 2 || 1
          c.moveTo(centerX, centerY + sy * 0.9)
          c.bezierCurveTo(
            centerX + sx,
            centerY + sy * 0.7,
            centerX + sx * 0.9,
            centerY - sy * 0.2,
            centerX,
            centerY + sy * 0.25,
          )
          c.bezierCurveTo(
            centerX - sx * 0.9,
            centerY - sy * 0.2,
            centerX - sx,
            centerY + sy * 0.7,
            centerX,
            centerY + sy * 0.9,
          )
          c.closePath()
          break
        }
      }
    }
    const drawAction = (action: DrawAction) => {
      if (!action.drawing || action.points.length < 1) return
      ctx.save()
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.lineWidth = action.lineWidth || mouseSize
      ctx.strokeStyle = action.drawColor || drawColor
      ctx.fillStyle = action.drawColor || drawColor

      if (action.type === 'stroke') {
        ctx.beginPath()
        ctx.moveTo(action.points[0].x, action.points[0].y)
        for (let i = 1; i < action.points.length; i++) {
          ctx.lineTo(action.points[i].x, action.points[i].y)
        }
        ctx.stroke()
      } else if (action.type === 'shape') {
        drawShapePath(ctx, action)
        if (action.shapeFill === 'fill') ctx.fill()
        else ctx.stroke()
      }
      ctx.restore()
    }

    for (const action of actions) drawAction(action)
    if (currentAction) drawAction(currentAction)

    // hover highlight — stroke under cursor when select tool, not dragging
    if (hoveredId && !marqueeStartRef.current) {
      const hovered = actions.find((a) => a.id === hoveredId)
      if (hovered) {
        const hbbox = getBBox(hovered)
        const pad = 10
        ctx.save()
        ctx.fillStyle = 'rgba(59,130,246,0.04)'
        ctx.strokeStyle = 'rgba(59,130,246,0.4)'
        ctx.lineWidth = 1 / scale
        ctx.setLineDash([4 / scale, 3 / scale])
        ctx.fillRect(
          hbbox.minX - pad,
          hbbox.minY - pad,
          hbbox.maxX - hbbox.minX + pad * 2,
          hbbox.maxY - hbbox.minY + pad * 2,
        )
        ctx.strokeRect(
          hbbox.minX - pad,
          hbbox.minY - pad,
          hbbox.maxX - hbbox.minX + pad * 2,
          hbbox.maxY - hbbox.minY + pad * 2,
        )
        ctx.setLineDash([])
        ctx.restore()
        ctx.save()
        ctx.strokeStyle = 'rgba(59,130,246,0.5)'
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        if (hovered.type === 'stroke') {
          ctx.lineWidth = Math.max(2, (hovered.lineWidth || mouseSize) - 2) / scale
          ctx.beginPath()
          ctx.moveTo(hovered.points[0].x, hovered.points[0].y)
          for (let i = 1; i < hovered.points.length; i++)
            ctx.lineTo(hovered.points[i].x, hovered.points[i].y)
          ctx.stroke()
        } else if (hovered.type === 'shape') {
          ctx.lineWidth = (hovered.lineWidth || mouseSize) + 4 / scale
          drawShapePath(ctx, hovered)
          ctx.stroke()
        }
        ctx.restore()
      }
    }

    // marquee rect + preview of what would be selected
    if (marquee) {
      const marqueeBbox: BBox = {
        minX: marquee.x,
        minY: marquee.y,
        maxX: marquee.x + marquee.w,
        maxY: marquee.y + marquee.h,
      }
      const wouldSelect = actions.filter((a) => a.id && bboxesIntersect(getBBox(a), marqueeBbox))
      for (const sel of wouldSelect) {
        ctx.save()
        ctx.strokeStyle = 'rgba(59,130,246,0.5)'
        ctx.lineWidth = (sel.lineWidth || mouseSize) + 6 / scale
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        if (sel.type === 'stroke') {
          ctx.beginPath()
          ctx.moveTo(sel.points[0].x, sel.points[0].y)
          for (let i = 1; i < sel.points.length; i++) ctx.lineTo(sel.points[i].x, sel.points[i].y)
          ctx.stroke()
        } else if (sel.type === 'shape') {
          drawShapePath(ctx, sel)
          ctx.stroke()
        }
        ctx.restore()
      }
      ctx.save()
      ctx.strokeStyle = '#3b82f6'
      ctx.lineWidth = 1 / scale
      ctx.setLineDash([4 / scale, 3 / scale])
      ctx.fillStyle = 'rgba(59,130,246,0.06)'
      ctx.fillRect(marquee.x, marquee.y, marquee.w, marquee.h)
      ctx.strokeRect(marquee.x, marquee.y, marquee.w, marquee.h)
      ctx.setLineDash([])
      ctx.restore()
    }

    // selection outlines + bounding box for all selected strokes
    if (selectedIds.size > 0) {
      const selectedActions = actions.filter((a) => a.id && selectedIds.has(a.id))
      const multiBbox = getMultiBBox(selectedActions)

      for (const sel of selectedActions) {
        ctx.save()
        ctx.setLineDash([6 / scale, 3 / scale])
        ctx.strokeStyle = '#3b82f6'
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        if (sel.type === 'stroke') {
          ctx.lineWidth = Math.max(2, (sel.lineWidth || mouseSize) - 4) / scale
          ctx.beginPath()
          ctx.moveTo(sel.points[0].x, sel.points[0].y)
          for (let i = 1; i < sel.points.length; i++) ctx.lineTo(sel.points[i].x, sel.points[i].y)
          ctx.stroke()
        } else if (sel.type === 'shape') {
          ctx.lineWidth = (sel.lineWidth || mouseSize) + 6 / scale
          drawShapePath(ctx, sel)
          ctx.stroke()
        }
        ctx.setLineDash([])
        ctx.restore()
      }

      if (multiBbox) {
        const pad = 10
        const bbox = {
          minX: multiBbox.minX - pad,
          minY: multiBbox.minY - pad,
          maxX: multiBbox.maxX + pad,
          maxY: multiBbox.maxY + pad,
        }
        ctx.save()
        ctx.fillStyle = 'rgba(59,130,246,0.04)'
        ctx.fillRect(bbox.minX, bbox.minY, bbox.maxX - bbox.minX, bbox.maxY - bbox.minY)
        ctx.strokeStyle = '#3b82f6'
        ctx.lineWidth = 1.5 / scale
        ctx.setLineDash([5 / scale, 4 / scale])
        ctx.strokeRect(bbox.minX, bbox.minY, bbox.maxX - bbox.minX, bbox.maxY - bbox.minY)
        ctx.setLineDash([])
        ctx.restore()
        const hs = HANDLE_SIZE / scale
        ctx.save()
        ctx.lineWidth = 1.5 / scale
        for (const h of getResizeHandles(bbox)) {
          const isHovered = hoveredHandle === h.id
          ctx.fillStyle = isHovered ? '#3b82f6' : 'white'
          ctx.strokeStyle = '#3b82f6'
          const size = isHovered ? hs * 1.4 : hs
          ctx.fillRect(h.x - size / 2, h.y - size / 2, size, size)
          ctx.strokeRect(h.x - size / 2, h.y - size / 2, size, size)
        }
        ctx.restore()
      }
    }

    ctx.restore()
  }

  // effect drives redraw whenever relevant state changes
  useEffect(() => {
    redraw()
  }, [
    actions,
    currentAction,
    panX,
    panY,
    canvasSize,
    scale,
    showGrid,
    gridSize,
    colorScheme,
    customBg,
    selectedIds,
    marquee,
    hoveredId,
    hoveredHandle,
  ])

  // resize listener that updates canvasSize from the element’s
  // client dimensions.  clientWidth/Height reflect the size of the
  // flex-1 container after the toolbar is laid out and never include a
  // scrollbar, so we stop the body from scrolling entirely.
  useEffect(() => {
    const handleResize = () => {
      const canvasEl = canvasRef.current
      if (canvasEl) {
        canvasEl.width = canvasEl.clientWidth
        canvasEl.height = canvasEl.clientHeight
        setCanvasSize({ width: canvasEl.clientWidth, height: canvasEl.clientHeight })
      }
    }
    window.addEventListener('resize', handleResize)
    handleResize() // initial
    return () => window.removeEventListener('resize', handleResize)
  }, [])

  const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left - panRef.current.x) / scaleRef.current
    const y = (e.clientY - rect.top - panRef.current.y) / scaleRef.current

    if (tool === 'select') {
      // Check resize handles on combined bbox
      if (selectedIds.size > 0) {
        const selectedActions = actions.filter((a) => a.id && selectedIds.has(a.id))
        const multiBbox = getMultiBBox(selectedActions)
        if (multiBbox) {
          const pad = 10
          const paddedBbox = {
            minX: multiBbox.minX - pad,
            minY: multiBbox.minY - pad,
            maxX: multiBbox.maxX + pad,
            maxY: multiBbox.maxY + pad,
          }
          const screenTolerance = 12 / scaleRef.current
          for (const h of getResizeHandles(paddedBbox)) {
            if (Math.abs(x - h.x) < screenTolerance && Math.abs(y - h.y) < screenTolerance) {
              setIsResizingSelection(h.id)
              resizeStartRef.current = {
                x,
                y,
                bbox: paddedBbox,
                snapshots: selectedActions.map((a) => ({
                  ...a,
                  points: a.points.map((p) => ({ ...p })),
                })),
              }
              return
            }
          }
          // Drag the whole selection
          if (pointInBBox(x, y, paddedBbox, 0)) {
            setIsDraggingSelection(true)
            dragStartRef.current = {
              x,
              y,
              snapshots: selectedActions.map((a) => ({
                ...a,
                points: a.points.map((p) => ({ ...p })),
              })),
            }
            return
          }
        }
      }
      // Start marquee
      marqueeStartRef.current = { x, y }
      setMarquee({ x, y, w: 0, h: 0 })
      setSelectedIds(new Set())
      setHoveredHandle(null)
      return
    }

    setIsDrawing(true)
    const base = {
      id: crypto.randomUUID(),
      userId: userIdRef.current,
      drawing: true as const,
      lineWidth: mouseSize,
      drawColor,
    }

    if (tool === 'shape') {
      setCurrentAction({
        ...base,
        type: 'shape',
        points: [
          { x, y },
          { x, y },
        ],
        shapeKind,
        shapeFill: shapeFillMode,
      })
    } else {
      setCurrentAction({ ...base, type: 'stroke', points: [{ x, y }] })
    }
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const x = (e.clientX - rect.left - panRef.current.x) / scaleRef.current
    const y = (e.clientY - rect.top - panRef.current.y) / scaleRef.current

    if (tool === 'select') {
      if (isDraggingSelection && dragStartRef.current) {
        const dx = x - dragStartRef.current.x
        const dy = y - dragStartRef.current.y
        const snapshotMap = new Map(dragStartRef.current.snapshots.map((s) => [s.id, s]))
        setActionsAndRef((prev) =>
          prev.map((a) => {
            const snap = a.id ? snapshotMap.get(a.id) : undefined
            if (!snap) return a
            return { ...a, points: snap.points.map((p) => ({ x: p.x + dx, y: p.y + dy })) }
          }),
        )
        return
      }
      if (isResizingSelection && resizeStartRef.current) {
        const { snapshots, x: sx, y: sy } = resizeStartRef.current
        const dx = x - sx
        const dy = y - sy
        const multiBbox = getMultiBBox(snapshots)
        if (!multiBbox) return
        const origW = multiBbox.maxX - multiBbox.minX
        const origH = multiBbox.maxY - multiBbox.minY
        if (origW === 0 || origH === 0) return
        const handle = isResizingSelection
        const newMinX = handle.includes('w') ? multiBbox.minX + dx : multiBbox.minX
        const newMaxX = handle.includes('e') ? multiBbox.maxX + dx : multiBbox.maxX
        const newMinY = handle.includes('n') ? multiBbox.minY + dy : multiBbox.minY
        const newMaxY = handle.includes('s') ? multiBbox.maxY + dy : multiBbox.maxY
        const newW = newMaxX - newMinX
        const newH = newMaxY - newMinY
        if (Math.abs(newW) < 1 || Math.abs(newH) < 1) return
        const snapshotMap = new Map(snapshots.map((s) => [s.id, s]))
        setActionsAndRef((prev) =>
          prev.map((a) => {
            const snap = a.id ? snapshotMap.get(a.id) : undefined
            if (!snap) return a
            const newPoints = snap.points.map((p) => ({
              x: newMinX + ((p.x - multiBbox.minX) / origW) * newW,
              y: newMinY + ((p.y - multiBbox.minY) / origH) * newH,
            }))
            return { ...a, points: newPoints }
          }),
        )
        return
      }
      // Update marquee
      if (marqueeStartRef.current) {
        const mx = marqueeStartRef.current.x
        const my = marqueeStartRef.current.y
        setMarquee({
          x: Math.min(mx, x),
          y: Math.min(my, y),
          w: Math.abs(x - mx),
          h: Math.abs(y - my),
        })
      } else {
        // Check resize handle hover first (fixed 12px screen-space tolerance)
        let foundHandle: string | null = null
        if (selectedIds.size > 0) {
          const selectedActions = actions.filter((a) => a.id && selectedIds.has(a.id))
          const multiBbox = getMultiBBox(selectedActions)
          if (multiBbox) {
            const pad = 10
            const paddedBbox = {
              minX: multiBbox.minX - pad,
              minY: multiBbox.minY - pad,
              maxX: multiBbox.maxX + pad,
              maxY: multiBbox.maxY + pad,
            }
            const screenTolerance = 12 / scaleRef.current
            for (const h of getResizeHandles(paddedBbox)) {
              if (Math.abs(x - h.x) < screenTolerance && Math.abs(y - h.y) < screenTolerance) {
                foundHandle = h.id
                break
              }
            }
          }
        }
        setHoveredHandle(foundHandle)
        // Hover detection — find topmost stroke under cursor
        const hit = foundHandle
          ? null
          : [...actions].reverse().find((a) => a.id && pointInBBox(x, y, getBBox(a), 8))
        setHoveredId(hit?.id ?? null)
      }
      return
    }

    if (!isDrawing || !currentAction) return
    const { x: sx, y: sy } = snapPoint(x, y)
    const startPoint = currentAction.points[0]

    if (currentAction.type === 'shape') {
      setCurrentAction({ ...currentAction, points: [currentAction.points[0], { x: sx, y: sy }] })
      return
    }

    if (e.shiftKey) {
      const dx = sx - startPoint.x
      const dy = sy - startPoint.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      const angle = Math.atan2(dy, dx)
      const snapDegrees = [
        0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5, 180, -157.5, -135, -112.5, -90, -67.5, -45, -22.5,
      ]
      const snapRadians = snapDegrees.map((d) => d * (Math.PI / 180))
      const nearest = snapRadians.reduce((prev, curr) =>
        Math.abs(curr - angle) < Math.abs(prev - angle) ? curr : prev,
      )
      setCurrentAction({
        ...currentAction,
        points: [
          startPoint,
          {
            x: startPoint.x + distance * Math.cos(nearest),
            y: startPoint.y + distance * Math.sin(nearest),
          },
        ],
      })
    } else if (e.altKey) {
      setCurrentAction({ ...currentAction, points: [startPoint, { x: sx, y: sy }] })
    } else {
      setCurrentAction({ ...currentAction, points: [...currentAction.points, { x: sx, y: sy }] })
    }
  }

  const stopDrawing = async () => {
    if (isDraggingSelection || isResizingSelection) {
      setIsDraggingSelection(false)
      setIsResizingSelection(null)
      dragStartRef.current = null
      resizeStartRef.current = null
      const selectedActions = actionsRef.current.filter((a) => a.id && selectedIds.has(a.id))
      for (const updated of selectedActions) {
        await supabase
          .from('strokes')
          .update({ data: updated })
          .eq('data->>id', updated.id)
          .eq('room_id', roomId)
      }
      await broadcastEvent('set_state', { actions: actionsRef.current })
      return
    }

    // Finish marquee — select all strokes whose bbox intersects
    if (marqueeStartRef.current) {
      marqueeStartRef.current = null
      if (marquee && (marquee.w > 4 || marquee.h > 4)) {
        const marqueeBbox: BBox = {
          minX: marquee.x,
          minY: marquee.y,
          maxX: marquee.x + marquee.w,
          maxY: marquee.y + marquee.h,
        }
        const hits = actions.filter((a) => bboxesIntersect(getBBox(a), marqueeBbox))
        setSelectedIds(new Set(hits.map((a) => a.id!).filter(Boolean)))
      } else {
        // Small drag = click, hit test top stroke
        const canvas = canvasRef.current
        if (canvas && marquee) {
          const hit = [...actions]
            .reverse()
            .find((a) => pointInBBox(marquee.x, marquee.y, getBBox(a)))
          setSelectedIds(hit?.id ? new Set([hit.id]) : new Set())
        }
      }
      setMarquee(null)
      return
    }

    if (!currentAction) {
      setIsDrawing(false)
      return
    }
    const action = currentAction
    setCurrentAction(null)
    setIsDrawing(false)
    setActionsAndRef((prev) => [...prev, action])
    myUndoStack.current.push(action)
    myRedoStack.current = []
    myClearRedoStack.current = []
    setCanUndo(true)
    setCanRedo(false)
    supabase.from('strokes').insert({ room_id: roomId, data: action }).then()

    // Auto-select the newly drawn shape and switch to select tool
    if (action.type === 'shape' && action.id) {
      setSelectedIds(new Set([action.id]))
      setTool('select')
    }
  }

  const snapPoint = (x: number, y: number) => {
    if (!snapToGrid) return { x, y }
    return {
      x: Math.round(x / gridSize) * gridSize,
      y: Math.round(y / gridSize) * gridSize,
    }
  }

  const setActionsAndRef = (updater: DrawAction[] | ((prev: DrawAction[]) => DrawAction[])) => {
    if (typeof updater === 'function') {
      setActions((prev) => {
        const next = updater(prev)
        actionsRef.current = next
        return next
      })
    } else {
      actionsRef.current = updater
      setActions(updater)
    }
  }

  const undo = async () => {
    if (myUndoStack.current.length === 0 && myClearStack.current.length > 0) {
      // ... clear undo, unchanged
    }
    if (myUndoStack.current.length === 0) return
    const stroke = myUndoStack.current.pop()!
    myRedoStack.current.push(stroke)
    const existsInActions = actionsRef.current.some((a) => a.id === stroke.id)
    let newActions: DrawAction[]
    if (existsInActions) {
      // undo a draw — remove it
      newActions = actionsRef.current.filter((a) => a.id !== stroke.id)
      await supabase.from('strokes').delete().eq('data->>id', stroke.id).eq('room_id', roomId)
    } else {
      // undo a delete — re-add it
      newActions = [...actionsRef.current, stroke]
      await supabase.from('strokes').insert({ room_id: roomId, data: stroke })
    }
    setActionsAndRef(newActions)
    setCanUndo(myUndoStack.current.length > 0 || myClearStack.current.length > 0)
    setCanRedo(myRedoStack.current.length > 0 || myClearRedoStack.current.length > 0)
    await broadcastEvent('set_state', { actions: newActions })
  }
  const redo = async () => {
    if (myRedoStack.current.length === 0 && myClearRedoStack.current.length > 0) {
      // ... clear redo, unchanged
    }
    if (myRedoStack.current.length === 0) return
    const stroke = myRedoStack.current.pop()!
    myUndoStack.current.push(stroke)
    const existsInActions = actionsRef.current.some((a) => a.id === stroke.id)
    let newActions: DrawAction[]
    if (existsInActions) {
      // redo a delete — remove it again
      newActions = actionsRef.current.filter((a) => a.id !== stroke.id)
      await supabase.from('strokes').delete().eq('data->>id', stroke.id).eq('room_id', roomId)
    } else {
      // redo a draw — re-add it
      newActions = [...actionsRef.current, stroke]
      await supabase.from('strokes').insert({ room_id: roomId, data: stroke })
    }
    setActionsAndRef(newActions)
    setCanRedo(myRedoStack.current.length > 0 || myClearRedoStack.current.length > 0)
    setCanUndo(true)
    await broadcastEvent('set_state', { actions: newActions })
  }
  useEffect(() => {
    const handleKeyDown = async (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds.size > 0) {
        e.preventDefault()
        const toDelete = actionsRef.current.filter((a) => a.id && selectedIds.has(a.id))
        const newActions = actionsRef.current.filter((a) => !a.id || !selectedIds.has(a.id))
        setActionsAndRef(newActions)
        setSelectedIds(new Set())
        for (const stroke of toDelete) {
          myUndoStack.current.push(stroke)
          await supabase.from('strokes').delete().eq('data->>id', stroke.id).eq('room_id', roomId)
        }
        myRedoStack.current = []
        myClearRedoStack.current = []
        setCanUndo(true)
        setCanRedo(false)
        await broadcastEvent('set_state', { actions: newActions })
        return
      }
      if (e.metaKey || e.ctrlKey) {
        if (e.key === 'z' && !e.shiftKey) {
          e.preventDefault()
          undo()
        } else if (e.key === 'z' && e.shiftKey) {
          e.preventDefault()
          redo()
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedIds])

  const clearCanvas = () => {
    myClearStack.current.push({
      actions: [...actionsRef.current],
      undoStack: [...myUndoStack.current],
    })
    myUndoStack.current = []
    myRedoStack.current = []
    myClearRedoStack.current = []
    setActionsAndRef([])
    supabase.from('strokes').delete().eq('room_id', roomId).then()
    broadcastEvent('clear', { clearedBy: userIdRef.current }) // send your userId
    setCanUndo(true)
    setCanRedo(false)
  }
  const resizeDrawWidth = (number: number) => {
    if (!canvasRef.current) return
    if (!mouseSize) return
    if (number < 1) number = 1
    if (number > 50) number = 50
    setMouseSize(number)
    const circle = document.getElementById('mouseSizeCircle')
    const ctx = canvasRef.current.getContext('2d')
    if (circle) {
      circle.setAttribute('r', ((number / 2) * scale).toString())
      ctx!.lineWidth = number
    }
  }
  const setDrawColorAndMore = (color: string) => {
    setDrawColor(color)
    const circle = document.getElementById('mouseSizeCircle')
    if (circle) {
      circle.setAttribute('stroke', color)
    }
  }

  const handlePinchZoomIn = (factor: number, centerX: number, centerY: number) => {
    zoomAtPoint(factor, centerX, centerY)
    resizeDrawWidth(mouseSize)
  }

  const handlePinchZoomOut = (factor: number, centerX: number, centerY: number) => {
    zoomAtPoint(1 / factor, centerX, centerY)
    resizeDrawWidth(mouseSize)
  }

  const getPinchInfo = (touches: TouchList) => {
    const a = touches.item(0)
    const b = touches.item(1)
    if (!a || !b) return { distance: 0, centerX: 0, centerY: 0 }
    const dx = a.clientX - b.clientX
    const dy = a.clientY - b.clientY
    return {
      distance: Math.hypot(dx, dy),
      centerX: (a.clientX + b.clientX) / 2,
      centerY: (a.clientY + b.clientY) / 2,
    }
  }

  useEffect(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const handleTouchMove = (e: TouchEvent) => {
      e.preventDefault()
      if (e.touches.length === 2) {
        const { distance: currentDistance, centerX, centerY } = getPinchInfo(e.touches)
        const initialDistance = pinchStartDistance.current
        if (!initialDistance) {
          pinchStartDistance.current = currentDistance
          return
        }
        const changeRatio = currentDistance / initialDistance
        if (changeRatio > 1.01) {
          handlePinchZoomIn(changeRatio, centerX, centerY)
        } else if (changeRatio < 0.99) {
          handlePinchZoomOut(1 / changeRatio, centerX, centerY)
        }
        pinchStartDistance.current = currentDistance
      }
    }
    const handleTouchStart = (e: TouchEvent) => {
      e.preventDefault()
      if (e.touches.length === 2) {
        const { distance } = getPinchInfo(e.touches)
        pinchStartDistance.current = distance
      }
    }
    const handleWheelPan = (e: WheelEvent) => {
      e.preventDefault()
      // Trackpad pinch emits wheel with ctrlKey; treat as zoom instead of pan
      if (e.ctrlKey) {
        const magnitude = Math.min(Math.abs(e.deltaY) / 200, 0.5) + 1
        const factor = e.deltaY < 0 ? magnitude : 1 / magnitude
        zoomAtPoint(factor, e.clientX, e.clientY)
        return
      }
      updatePan(panRef.current.x - e.deltaX, panRef.current.y - e.deltaY)
    }
    canvas.addEventListener('touchmove', handleTouchMove, { passive: false })
    canvas.addEventListener('touchstart', handleTouchStart, { passive: false })
    canvas.addEventListener('wheel', handleWheelPan, { passive: false })
    return () => {
      canvas.removeEventListener('touchmove', handleTouchMove)
      canvas.removeEventListener('touchstart', handleTouchStart)
      canvas.removeEventListener('wheel', handleWheelPan)
    }
  }, [handlePinchZoomIn, handlePinchZoomOut])

  const handleTouchEnd = () => {
    pinchStartDistance.current = null
  }

  function clamp(arg0: number, arg1: number, arg2: number): number {
    if (arg0 < arg1) return arg1
    if (arg0 > arg2) return arg2
    return arg0
  }
  const roomId = 'room_1' // later make this dynamic per session

  useEffect(() => {
    // Load existing strokes
    const loadStrokes = async () => {
      const { data } = await supabase
        .from('strokes')
        .select('data')
        .eq('room_id', roomId)
        .order('created_at')
      if (data) {
        const loaded = data.map((row) => row.data as DrawAction)
        setActionsAndRef(loaded)
        const myStrokes = loaded.filter((a) => a.userId === userIdRef.current)
        myUndoStack.current = myStrokes
        setCanUndo(myStrokes.length > 0)
      }
    }

    loadStrokes()

    // Subscribe to new strokes from other users
    const channel = supabase
      .channel(`room:${roomId}`, {
        config: { presence: { key: userIdRef.current } },
      })
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'strokes', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const incoming = payload.new.data as DrawAction
          setActionsAndRef((prev) => {
            if (prev.find((a) => a.id === incoming.id)) return prev
            return [...prev, incoming]
          })
        },
      )
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'events', filter: `room_id=eq.${roomId}` },
        (payload) => {
          const { type, data } = payload.new
          if (type === 'clear') {
            if (data?.clearedBy === userIdRef.current) return // ignore your own clear
            setActionsAndRef([])
            myUndoStack.current = []
            myRedoStack.current = []
            setCanUndo(false)
            setCanRedo(false)
          } else if (type === 'set_state') {
            setActionsAndRef(data.actions)
          }
        },
      )
      .on('presence', { event: 'sync' }, () => {
        const state = channel.presenceState<{ x: number; y: number; userId: string }>()
        const others = Object.values(state)
          .flat()
          .filter((c) => c.userId !== userIdRef.current)
        setOtherCursors(others)
      })
      .on('presence', { event: 'join' }, ({ newPresences }) => {
        const typed = (
          newPresences as unknown as { x: number; y: number; userId: string }[]
        ).filter((c) => c.userId !== userIdRef.current)
        setOtherCursors((prev) => {
          const filtered = prev.filter((c) => !typed.find((p) => p.userId === c.userId))
          return [...filtered, ...typed]
        })
      })
      .on('presence', { event: 'leave' }, ({ leftPresences }) => {
        const typed = leftPresences as unknown as { userId: string }[]
        setOtherCursors((prev) => prev.filter((c) => !typed.find((p) => p.userId === c.userId)))
      })
      .subscribe(async (status) => {
        if (status === 'SUBSCRIBED') {
          isSubscribedRef.current = true
          await channel.track({ x: 0, y: 0, userId: userIdRef.current })
        }
      })

    channelRef.current = channel

    return () => {
      isSubscribedRef.current = false
      supabase.removeChannel(channel)
    }
  }, [])
  useEffect(() => {
    otherCursors.forEach((cursor) => {
      const canvas = canvasRef.current
      if (!canvas) return
      const rect = canvas.getBoundingClientRect()
      const screenX = cursor.x * scaleRef.current + panRef.current.x + rect.left
      const screenY = cursor.y * scaleRef.current + panRef.current.y + rect.top
      const sampled = sampleCanvasColor(screenX, screenY)
      otherCursorColors.current.set(cursor.userId, getContrastColor(sampled))
    })
  }, [otherCursors, panX, panY, scale])
  //   useEffect(() => {}, []) // make sure this is empty array
  const broadcastEvent = async (type: string, data?: any) => {
    await supabase.from('events').insert({ room_id: roomId, type, data })
  }

  const hudScale = hudSize === 'small' ? 0.85 : hudSize === 'large' ? 1.15 : 1

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if ((e.key === 'Delete' || e.key === 'Backspace') && selectedIds) {
        const stroke = actionsRef.current.find((a) => selectedIds.has(a.id!))
        if (stroke) {
          const newActions = actionsRef.current.filter((a) => !selectedIds.has(a.id!))
          setActionsAndRef(newActions)
          setSelectedIds(new Set())
          myUndoStack.current.push(stroke)
          setCanUndo(true)
          supabase.from('strokes').delete().eq('data->>id', selectedIds).eq('room_id', roomId)
          broadcastEvent('set_state', { actions: newActions })
        }
      }
    }
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [selectedIds])
  const getContrastColor = (hex: string): string => {
    const num = parseInt(hex.replace('#', ''), 16)
    const r = (num >> 16) & 255
    const g = (num >> 8) & 255
    const b = num & 255
    // Perceived luminance
    const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
    return luminance > 0.5 ? '#000000' : '#ffffff'
  }

  const sampleCanvasColor = (screenX: number, screenY: number): string => {
    const canvas = canvasRef.current
    if (!canvas) return '#ffffff'
    const ctx = canvas.getContext('2d')
    if (!ctx) return '#ffffff'
    const rect = canvas.getBoundingClientRect()
    const x = Math.round(screenX - rect.left)
    const y = Math.round(screenY - rect.top)
    if (x < 0 || y < 0 || x >= canvas.width || y >= canvas.height) return '#ffffff'
    const [r, g, b] = ctx.getImageData(x, y, 1, 1).data
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
  }
  // Helper to darken a hex color for swatch outlines
  const darkenColor = (hex: string, amount = 40): string => {
    const num = parseInt(hex.replace('#', ''), 16)
    const r = Math.max(0, (num >> 16) - amount)
    const g = Math.max(0, ((num >> 8) & 0xff) - amount)
    const b = Math.max(0, (num & 0xff) - amount)
    return `#${[r, g, b].map((v) => v.toString(16).padStart(2, '0')).join('')}`
  }

  return (
    <div className="flex h-screen overflow-hidden" style={{ cursor: 'none' }}>
      {/* Full-screen canvas */}
      <canvas
        ref={canvasRef}
        style={{
          // ← replace the whole style={{ ... }} block here
          position: 'absolute',
          inset: 0,
          width: '100%',
          height: '100%',
          touchAction: 'none',
          cursor: hoveredHandle
            ? hoveredHandle === 'nw' || hoveredHandle === 'se'
              ? 'nw-resize'
              : 'ne-resize'
            : 'none',
        }}
        onMouseDown={(e) => {
          if (e.button === 2) handleCanvasPan(e, true)
          else if (e.button === 0) startDrawing(e)
        }}
        onMouseMove={(e) => {
          cursorTargetRef.current = { x: e.clientX, y: e.clientY }
          const sampled = sampleCanvasColor(e.clientX, e.clientY)
          setCursorColor(getContrastColor(sampled))
          if (channelRef.current && isSubscribedRef.current) {
            const rect = canvasRef.current?.getBoundingClientRect()
            if (rect) {
              const worldX = (e.clientX - rect.left - panRef.current.x) / scaleRef.current
              const worldY = (e.clientY - rect.top - panRef.current.y) / scaleRef.current
              channelRef.current.track({ x: worldX, y: worldY, userId: userIdRef.current })
            }
          }
          if (isPanning) handleCanvasPan(e, false)
          else if (e.buttons === 1) draw(e)
        }}
        onMouseUp={isPanning ? stopPan : stopDrawing}
        onMouseLeave={isPanning ? stopPan : stopDrawing}
        onTouchEnd={handleTouchEnd}
        onContextMenu={(e) => {
          e.preventDefault()
          return false
        }}
      />

      {/* SVG overlay — other cursors only */}
      <svg
        width="100%"
        height="100%"
        className="absolute inset-0 pointer-events-none"
        style={{ zIndex: 10 }}
      >
        {otherCursors
          .filter((c) => c.x !== -1)
          .map((cursor: any) => {
            const rect = canvasRef.current?.getBoundingClientRect()
            const screenX = cursor.x * scaleRef.current + panRef.current.x + (rect?.left ?? 0)
            const screenY = cursor.y * scaleRef.current + panRef.current.y + (rect?.top ?? 0)
            const color = otherCursorColors.current.get(cursor.userId) ?? '#000000'
            return (
              <circle
                key={cursor.userId}
                cx={screenX}
                cy={screenY}
                r="6"
                fill={color}
                opacity={0.7}
              />
            )
          })}
      </svg>

      {/* Custom cursor — only on canvas, hidden when over any popup/footer */}
      {!hideCursorWhileHudClick && !hoveredHandle && (
        <div
          className="pointer-events-none fixed"
          style={{
            left: cursorPos.x,
            top: cursorPos.y,
            zIndex: 1000,
            transform: 'translate(-50%, -50%)',
          }}
        >
          {tool === 'select' ? (
            hoveredHandle ? (
              <svg
                width="20"
                height="20"
                viewBox="0 0 20 20"
                style={{
                  transform:
                    hoveredHandle === 'nw' || hoveredHandle === 'se'
                      ? 'rotate(0deg)'
                      : 'rotate(90deg)',
                  filter: 'drop-shadow(0 1px 2px rgba(0,0,0,0.3))',
                }}
              >
                {/* Double-headed diagonal arrow */}
                <line
                  x1="3"
                  y1="3"
                  x2="17"
                  y2="17"
                  stroke={cursorColor === '#ffffff' ? 'white' : '#1e3a5f'}
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <polyline
                  points="3,9 3,3 9,3"
                  fill="none"
                  stroke={cursorColor === '#ffffff' ? 'white' : '#1e3a5f'}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
                <polyline
                  points="17,11 17,17 11,17"
                  fill="none"
                  stroke={cursorColor === '#ffffff' ? 'white' : '#1e3a5f'}
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              </svg>
            ) : (
              <MousePointer2
                size={22}
                color={cursorColor}
                style={{ fill: cursorColor === '#ffffff' ? 'black' : 'white' }}
              />
            )
          ) : cursorStyle === 'dot' ? (
            <div
              className="w-1.5 h-1.5 rounded-full bg-black"
              style={{ borderColor: cursorColor, borderWidth: 1 }}
            />
          ) : cursorStyle === 'crosshair' ? (
            <svg width="20" height="20" viewBox="0 0 20 20">
              <line x1="10" y1="0" x2="10" y2="20" stroke={cursorColor} strokeWidth="1" />
              <line
                x1="0"
                y1="10"
                x2="20"
                y2="10"
                stroke={colorScheme === 'dark' ? 'white' : 'black'}
                strokeWidth="1"
              />
            </svg>
          ) : (
            <div
              className="rounded-full border"
              style={{
                width: Math.max(6, mouseSize / 2),
                height: Math.max(6, mouseSize / 2),
                borderColor: cursorColor,
                borderWidth: 1,
              }}
            />
          )}
        </div>
      )}

      {/* Size + Color panels — fixed to left side, only when pen tool */}
      {tool === 'pen' && (
        <div
          className="fixed left-4 top-1/2 -translate-y-1/2 flex flex-col gap-3"
          style={{ zIndex: 30, cursor: 'default' }}
        >
          {/* Size panel */}
          <div
            className="bg-white rounded-2xl shadow-lg border border-gray-100 p-3 flex flex-col gap-2"
            style={{ minWidth: '160px' }}
          >
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Size</span>
            <div className="flex items-center gap-2">
              <Minus
                size={12}
                className="text-gray-400 hover:text-gray-800 cursor-pointer flex-shrink-0"
                onClick={() => resizeDrawWidth(clamp(mouseSize - 1, 1, 50))}
              />
              <input
                type="range"
                min="1"
                max="50"
                value={mouseSize}
                onChange={(e) => resizeDrawWidth(parseInt(e.target.value))}
                className="flex-1 accent-gray-800"
              />
              <Plus
                size={12}
                className="text-gray-400 hover:text-gray-800 cursor-pointer flex-shrink-0"
                onClick={() => resizeDrawWidth(clamp(mouseSize + 1, 1, 50))}
              />
              <span className="text-xs text-gray-400 w-5 tabular-nums text-right">{mouseSize}</span>
            </div>
          </div>

          {/* Color panel */}
          <div className="bg-white rounded-2xl shadow-lg border border-gray-100 p-3 flex flex-col gap-2">
            <span className="text-xs font-medium text-gray-400 uppercase tracking-wide">Color</span>
            <HexColorPicker
              color={drawColor}
              onChange={setDrawColorAndMore}
              style={{ width: '100%', height: '110px' }}
            />
            <div className="grid grid-cols-6 gap-1 mt-1">
              {swatches.map((color) => (
                <button
                  key={color}
                  onClick={() => setDrawColorAndMore(color)}
                  className="w-5 h-5 rounded-sm cursor-pointer transition-transform hover:scale-110"
                  style={{
                    backgroundColor: color,
                    outline:
                      drawColor === color
                        ? `2px solid ${darkenColor(color, 60)}`
                        : `1px solid ${darkenColor(color, 30)}`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Floating footer toolbar — centered */}
      <div className="fixed bottom-5 left-1/2 -translate-x-1/2" style={{ zIndex: 20 }}>
        <div
          className="flex items-center gap-1 px-3 py-2 rounded-2xl shadow-xl border select-none"
          style={{
            transform: `scale(${hudScale})`,
            transformOrigin: 'bottom center',
            backgroundColor: colorScheme === 'dark' ? '#1e1e1e' : 'white',
            borderColor: colorScheme === 'dark' ? '#333' : '#e5e7eb',
            color: colorScheme === 'dark' ? 'white' : undefined,
            cursor: 'default',
          }}
          onMouseDown={() => setHideCursorWhileHudClick(true)}
        >
          {/* Tools */}
          <div className="flex items-center gap-1 pr-2 border-r border-gray-200">
            <button
              onClick={() => setTool('select')}
              title="Select"
              className={`p-2 rounded-xl transition-all duration-150 ${tool === 'select' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}
            >
              <MousePointer2 size={16} strokeWidth={2} />
            </button>
            <button
              onClick={() => setTool('pen')}
              title="Pen"
              className={`p-2 rounded-xl transition-all duration-150 ${tool === 'pen' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}
            >
              <Pen size={16} strokeWidth={2} />
            </button>

            {/* Shape button with hover panel */}
            <div className="relative" onMouseEnter={openShapePanel} onMouseLeave={closeShapePanel}>
              <button
                onClick={() => setTool('shape')}
                title="Shapes"
                className={`p-2 rounded-xl transition-all duration-150 ${tool === 'shape' ? 'bg-gray-900 text-white' : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'}`}
              >
                {React.createElement(shapeIcons[shapeKind], { size: 16, strokeWidth: 2 })}
              </button>
              {showShapePanel && (
                <div
                  className="absolute bottom-full mb-2 left-1/2 -translate-x-1/2 bg-white rounded-2xl shadow-xl border border-gray-100 p-3 flex flex-col gap-2 min-w-[160px]"
                  style={{ zIndex: 50 }}
                  onMouseEnter={openShapePanel}
                  onMouseLeave={closeShapePanel}
                >
                  <div className="grid grid-cols-2 gap-2">
                    {(['rectangle', 'circle', 'star', 'heart'] as const).map((shape) => {
                      const Icon = shapeIcons[shape]
                      return (
                        <button
                          key={shape}
                          onClick={() => {
                            setShapeKind(shape)
                            setTool('shape')
                          }}
                          className={`flex flex-col items-center gap-1 p-2 rounded-xl text-xs capitalize transition-all ${shapeKind === shape ? 'bg-gray-900 text-white' : 'text-gray-600 hover:bg-gray-100'}`}
                        >
                          <Icon size={16} strokeWidth={2} />
                          {shape}
                        </button>
                      )
                    })}
                  </div>
                  <div className="flex gap-2 border-t border-gray-100 pt-2">
                    <button
                      onClick={() => setShapeFillMode('outline')}
                      className={`flex-1 py-1.5 rounded-lg text-xs transition-all ${shapeFillMode === 'outline' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      Outline
                    </button>
                    <button
                      onClick={() => setShapeFillMode('fill')}
                      className={`flex-1 py-1.5 rounded-lg text-xs transition-all ${shapeFillMode === 'fill' ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      Fill
                    </button>
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Undo / Redo */}
          <div className="flex items-center gap-1 px-2 border-r border-gray-200">
            <button
              onClick={undo}
              disabled={!canUndo}
              title="Undo (⌘Z)"
              className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
            >
              <Undo2 size={16} strokeWidth={2} />
            </button>
            <button
              onClick={redo}
              disabled={!canRedo}
              title="Redo (⌘⇧Z)"
              className="p-2 rounded-xl text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-25 disabled:cursor-not-allowed transition-all"
            >
              <Redo2 size={16} strokeWidth={2} />
            </button>
          </div>

          {/* Clear */}
          <div className="pl-2">
            <button
              onClick={clearCanvas}
              title="Clear canvas"
              className="p-2 rounded-xl text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all"
            >
              <Trash2 size={16} strokeWidth={2} />
            </button>
          </div>
        </div>
      </div>

      {/* Settings button — fixed bottom right, independent */}
      <button
        onClick={() => setShowSettings(true)}
        title="Settings"
        className="fixed bottom-5 right-5 w-10 h-10 rounded-2xl shadow-xl border flex items-center justify-center transition-all hover:scale-105 cursor-pointer"
        style={{
          zIndex: 20,
          backgroundColor: colorScheme === 'dark' ? '#1e1e1e' : 'white',
          borderColor: colorScheme === 'dark' ? '#333' : '#e5e7eb',
          color: colorScheme === 'dark' ? 'white' : '#6b7280',
        }}
      >
        <Settings size={16} strokeWidth={2} />
      </button>

      {/* Settings modal */}
      {showSettings && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setShowSettings(false)} />
          <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
            <div
              className="bg-white rounded-2xl shadow-2xl w-96 p-6 pointer-events-auto flex flex-col gap-5"
              style={{ cursor: 'default' }}
            >
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-800">Settings</h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"
                >
                  <X size={16} />
                </button>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Color Scheme
                </label>
                <div className="flex gap-2">
                  {(['light', 'dark', 'custom'] as const).map((scheme) => (
                    <button
                      key={scheme}
                      onClick={() => setColorScheme(scheme)}
                      className={`flex-1 py-1.5 rounded-lg text-xs capitalize transition-all ${colorScheme === scheme ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      {scheme}
                    </button>
                  ))}
                </div>
                {colorScheme === 'custom' && (
                  <div className="flex items-center gap-2 mt-1">
                    <span className="text-xs text-gray-500">Background</span>
                    <input
                      type="color"
                      value={customBg}
                      onChange={(e) => setCustomBg(e.target.value)}
                      className="w-8 h-8 rounded cursor-pointer border-0"
                    />
                  </div>
                )}
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  HUD Size
                </label>
                <div className="flex gap-2">
                  {(['small', 'medium', 'large'] as const).map((size) => (
                    <button
                      key={size}
                      onClick={() => setHudSize(size)}
                      className={`flex-1 py-1.5 rounded-lg text-xs capitalize transition-all ${hudSize === size ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      {size}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Cursor Style
                </label>
                <div className="flex gap-2">
                  {(['circle', 'dot', 'crosshair'] as const).map((s) => (
                    <button
                      key={s}
                      onClick={() => setCursorStyle(s)}
                      className={`flex-1 py-1.5 rounded-lg text-xs capitalize transition-all ${cursorStyle === s ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Grid
                </label>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Show grid</span>
                  <button
                    onClick={() => setShowGrid(!showGrid)}
                    className={`w-10 h-5 rounded-full transition-all ${showGrid ? 'bg-gray-900' : 'bg-gray-200'}`}
                  >
                    <div
                      className={`w-4 h-4 bg-white rounded-full shadow transition-all mx-0.5 ${showGrid ? 'translate-x-5' : 'translate-x-0'}`}
                    />
                  </button>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-xs text-gray-600">Snap to grid</span>
                  <button
                    onClick={() => setSnapToGrid(!snapToGrid)}
                    className={`w-10 h-5 rounded-full transition-all ${snapToGrid ? 'bg-gray-900' : 'bg-gray-200'}`}
                  >
                    <div
                      className={`w-4 h-4 bg-white rounded-full shadow transition-all mx-0.5 ${snapToGrid ? 'translate-x-5' : 'translate-x-0'}`}
                    />
                  </button>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-gray-600">Grid size</span>
                  <input
                    type="range"
                    min="10"
                    max="200"
                    value={gridSize}
                    onChange={(e) => setGridSize(parseInt(e.target.value))}
                    className="flex-1 accent-gray-800"
                  />
                  <span className="text-xs text-gray-400 w-8 text-right">{gridSize}px</span>
                </div>
              </div>
            </div>
          </div>
        </>
      )}
    </div>
  )
}
