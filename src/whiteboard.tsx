import React, { useRef, useEffect, useState } from 'react'
import {
  Pen,
  Eraser,
  Trash2,
  Minus,
  Plus,
  Undo2,
  Redo2,
  Settings,
  X,
  MousePointer2,
} from 'lucide-react'
import { HexColorPicker } from 'react-colorful'
import { supabase } from './lib/supabase'

interface DrawAction {
  id?: string
  type: 'stroke' | 'erase'
  userId?: string
  drawing: true | false
  points: { x: number; y: number }[]
  lineWidth?: number
  eraseRadius?: number
  drawColor?: string
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
  const [tool, setTool] = useState<'pen' | 'eraser' | 'select'>('pen')
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
  const [showColorPicker, setShowColorPicker] = useState(false)
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
  const myClearStack = useRef<DrawAction[][]>([])

  //SETTINGS
  const [showSettings, setShowSettings] = useState(false)
  const [colorScheme, setColorScheme] = useState<'light' | 'dark' | 'custom'>('light')
  const [hudSize, setHudSize] = useState<'small' | 'medium' | 'large'>('medium')
  const [cursorStyle, setCursorStyle] = useState<'circle' | 'dot' | 'crosshair'>('circle')
  const [showGrid, setShowGrid] = useState(false)
  const [gridSize, setGridSize] = useState(50)
  const [snapToGrid, setSnapToGrid] = useState(false)
  const [customBg, setCustomBg] = useState('#ffffff')
  const [customToolbar, setCustomToolbar] = useState('#f9fafb')

  const updatePan = (x: number, y: number) => {
    panRef.current = { x, y }
    setPanX(x)
    setPanY(y)
  }

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

  // helper that performs full redraw; can be called from resize handler
  const redraw = () => {
    const canvas = canvasRef.current
    if (!canvas) return
    if (canvasSize.width === 0 || canvasSize.height === 0) return // add this
    const ctx = canvas.getContext('2d')
    if (!ctx) return

    canvas.width = canvasSize.width
    canvas.height = canvasSize.height

    ctx.lineCap = 'round'
    ctx.lineJoin = 'round'

    // 1. background
    ctx.fillStyle =
      colorScheme === 'dark' ? '#1a1a1a' : colorScheme === 'custom' ? customBg : 'white'
    ctx.fillRect(0, 0, canvas.width, canvas.height)

    // 2. grid
    if (showGrid) {
      ctx.save()
      ctx.translate(panX, panY)
      ctx.scale(scale, scale)
      ctx.strokeStyle =
        colorScheme === 'dark'
          ? 'rgba(255,255,255,0.1)'
          : colorScheme === 'custom' || colorScheme === 'light'
            ? 'rgba(0, 0, 0, 0.2)'
            : 'rgba(0,0,0,0.2)'
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

    // 3. draw strokes onto offscreen canvas so destination-out only affects strokes layer
    const offscreen = document.createElement('canvas')
    offscreen.width = canvas.width
    offscreen.height = canvas.height
    const offCtx = offscreen.getContext('2d')!
    offCtx.lineCap = 'round'
    offCtx.lineJoin = 'round'

    const drawActionToCtx = (action: DrawAction, c: CanvasRenderingContext2D) => {
      if (!action.drawing || action.points.length < 1) return
      if (action.type === 'stroke') {
        c.globalCompositeOperation = 'source-over'
        c.strokeStyle = action.drawColor || drawColor
      } else {
        c.globalCompositeOperation = 'destination-out'
        c.strokeStyle = 'rgba(0,0,0,1)'
      }
      c.lineWidth = action.lineWidth || mouseSize
      c.save()
      c.translate(panX, panY)
      c.scale(scale, scale)
      c.beginPath()
      c.moveTo(action.points[0].x, action.points[0].y)
      for (let i = 1; i < action.points.length; i++) {
        c.lineTo(action.points[i].x, action.points[i].y)
      }
      c.stroke()
      c.restore()
    }

    for (const action of actions) drawActionToCtx(action, offCtx)
    if (currentAction) drawActionToCtx(currentAction, offCtx)

    // 4. composite strokes layer on top
    ctx.drawImage(offscreen, 0, 0)
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
    setIsDrawing(true)
    setCurrentAction({
      id: crypto.randomUUID(),
      userId: userIdRef.current,
      type: tool === 'pen' ? 'stroke' : 'erase',
      drawing: true,
      points: [{ x, y }],
      lineWidth: mouseSize,
      eraseRadius: undefined,
      drawColor: tool === 'pen' ? drawColor : undefined,
    })
  }

  const snapPoint = (x: number, y: number) => {
    if (!snapToGrid) return { x, y }
    return {
      x: Math.round(x / gridSize) * gridSize,
      y: Math.round(y / gridSize) * gridSize,
    }
  }

  const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentAction) return
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()

    const x = (e.clientX - rect.left - panRef.current.x) / scaleRef.current
    const y = (e.clientY - rect.top - panRef.current.y) / scaleRef.current
    const { x: sx, y: sy } = snapPoint(x, y)
    const startPoint = currentAction.points[0]
    if (e.shiftKey) {
      const dx = sx - startPoint.x
      const dy = sy - startPoint.y
      const distance = Math.sqrt(dx * dx + dy * dy)
      const angle = Math.atan2(dy, dx) // radians

      // Define snap angles (in degrees) — add/remove as needed
      const snapDegrees = [
        0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5, 180, -157.5, -135, -112.5, -90, -67.5, -45, -22.5,
      ]
      const snapRadians = snapDegrees.map((d) => d * (Math.PI / 180))

      // Find the closest snap angle
      const nearest = snapRadians.reduce((prev, curr) =>
        Math.abs(curr - angle) < Math.abs(prev - angle) ? curr : prev,
      )

      const snappedPoint = {
        x: startPoint.x + distance * Math.cos(nearest),
        y: startPoint.y + distance * Math.sin(nearest),
      }
      setCurrentAction({
        ...currentAction,
        points: [startPoint, snappedPoint],
      })
    } else if (e.altKey) {
      // Option/Alt: straight line from start to current mouse position
      setCurrentAction({
        ...currentAction,
        points: [startPoint, { x: sx, y: sy }],
      })
    } else {
      // Normal freehand drawing
      setCurrentAction({
        ...currentAction,
        points: [...currentAction.points, { x: sx, y: sy }],
      })
    }
  }

  const stopDrawing = async () => {
    if (!currentAction) {
      setIsDrawing(false)
      return
    }

    const action = currentAction
    setCurrentAction(null)
    setIsDrawing(false)
    setActions((prev) => [...prev, action])

    // Track in personal undo stack
    myUndoStack.current.push(action)
    myRedoStack.current = [] // clear redo on new stroke
    setCanUndo(true)
    setCanRedo(false)

    supabase.from('strokes').insert({ room_id: roomId, data: action }).then()
  }

  const undo = async () => {
    // Check if last action was a clear
    if (myUndoStack.current.length === 0 && myClearStack.current.length > 0) {
      const restored = myClearStack.current.pop()!
      setActions(restored)
      setCanUndo(myUndoStack.current.length > 0 || myClearStack.current.length > 0)
      // Re-insert all restored strokes
      await supabase.from('strokes').insert(restored.map((s) => ({ room_id: roomId, data: s })))
      await broadcastEvent('set_state', { actions: restored })
      return
    }

    if (myUndoStack.current.length === 0) return
    const stroke = myUndoStack.current.pop()!
    myRedoStack.current.push(stroke)
    setCanUndo(myUndoStack.current.length > 0 || myClearStack.current.length > 0)
    setCanRedo(true)

    const newActions = actions.filter((a) => a.id !== stroke.id)
    setActions(newActions)
    await supabase.from('strokes').delete().eq('data->>id', stroke.id).eq('room_id', roomId)
    await broadcastEvent('set_state', { actions: newActions })
  }

  const redo = async () => {
    if (myRedoStack.current.length === 0) return
    const stroke = myRedoStack.current.pop()!
    myUndoStack.current.push(stroke)
    setCanRedo(myRedoStack.current.length > 0)
    setCanUndo(true)

    const newActions = [...actions, stroke]
    setActions(newActions)

    // Re-insert to Supabase
    await supabase.from('strokes').insert({ room_id: roomId, data: stroke })
    await broadcastEvent('set_state', { actions: newActions })
  }
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
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
  }, [undo, redo])

  const clearCanvas = () => {
    myClearStack.current.push([...actions]) // save full state
    myUndoStack.current = []
    myRedoStack.current = []
    setCanUndo(true) // can undo the clear
    setCanRedo(false)

    setActions([])
    supabase.from('strokes').delete().eq('room_id', roomId).then()
    broadcastEvent('clear')
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
        setActions(loaded)

        // Restore personal undo stack from strokes that belong to this user
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
          setActions((prev) => {
            // skip if we already have this stroke locally
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
            setActions([])
            myUndoStack.current = []
            myRedoStack.current = []
            setCanUndo(false)
            setCanRedo(false)
          } else if (type === 'set_state') {
            setActions(data.actions)
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

  //   useEffect(() => {}, []) // make sure this is empty array
  const broadcastEvent = async (type: string, data?: any) => {
    await supabase.from('events').insert({ room_id: roomId, type, data })
  }

  const hudScale = hudSize === 'small' ? 0.85 : hudSize === 'large' ? 1.15 : 1

  return (
    <div
      className="flex flex-col h-screen overflow-hidden"
      style={{ backgroundColor: colorScheme === 'dark' ? '#1a1a1a' : 'white' }}
    >
      <svg
        width="100%"
        height="100%"
        className="absolute top-0 left-0 pointer-events-none"
        style={{ zIndex: 10 }}
      >
        {tool !== 'select' && (
          <circle
            id="mouseSizeCircle"
            cx={cursorPos.x}
            cy={cursorPos.y}
            r={cursorStyle === 'dot' ? 2 : 5}
            stroke={cursorStyle === 'crosshair' ? 'none' : 'black'}
            strokeWidth="1"
            fill={cursorStyle === 'dot' ? 'black' : 'none'}
          />
        )}
        {otherCursors
          .filter((c) => c.x !== -1)
          .map((cursor: any) => {
            const canvas = canvasRef.current
            const rect = canvas?.getBoundingClientRect()
            const screenX = cursor.x * scaleRef.current + panRef.current.x + (rect?.left ?? 0)
            const screenY = cursor.y * scaleRef.current + panRef.current.y + (rect?.top ?? 0)
            return (
              <circle
                key={cursor.userId}
                cx={screenX}
                cy={screenY}
                r="6"
                fill="blue"
                opacity={0.6}
              />
            )
          })}
      </svg>

      {/* Header toolbar */}
      <div
        className="flex items-center justify-center gap-1 px-3 py-2 border-b shadow-sm select-none"
        style={{
          zIndex: 5,
          transform: `scale(${hudScale})`,
          transformOrigin: 'top center',
          backgroundColor:
            colorScheme === 'dark' ? '#1a1a1a' : colorScheme === 'custom' ? customToolbar : 'white',
          borderColor: colorScheme === 'dark' ? '#333' : undefined,
          color: colorScheme === 'dark' ? 'white' : undefined,
        }}
      >
        {/* Tool group */}
        <div className="flex items-center gap-1 pr-3 border-r border-gray-200">
          <button
            onClick={() => setTool('select')}
            title="Select (V)"
            className={`p-2 rounded-lg transition-all duration-150 ${
              tool === 'select'
                ? 'bg-gray-900 text-white shadow-sm'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
            }`}
          >
            <MousePointer2 size={16} strokeWidth={2} />
          </button>
          <button
            onClick={() => setTool('pen')}
            title="Pen (P)"
            className={`p-2 rounded-lg transition-all duration-150 ${
              tool === 'pen'
                ? 'bg-gray-900 text-white shadow-sm'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
            }`}
          >
            <Pen size={16} strokeWidth={2} />
          </button>

          <button
            onClick={() => setTool('eraser')}
            title="Eraser (E)"
            className={`p-2 rounded-lg transition-all duration-150 ${
              tool === 'eraser'
                ? 'bg-gray-900 text-white shadow-sm'
                : 'text-gray-500 hover:bg-gray-100 hover:text-gray-800'
            }`}
          >
            <Eraser size={16} strokeWidth={2} />
          </button>
        </div>

        {/* Size group */}
        <div className="flex items-center gap-2 px-3 border-r border-gray-200">
          <Minus
            size={12}
            className="text-gray-400 hover:bg-gray-100 hover:text-gray-800"
            onClick={() => resizeDrawWidth(clamp(mouseSize - 1, 1, 50))}
          />
          <input
            type="range"
            min="1"
            max="50"
            value={mouseSize}
            onChange={(e) => resizeDrawWidth(parseInt(e.target.value))}
            className="w-20 accent-gray-800"
            title="Brush size"
          />
          <Plus
            size={12}
            className="text-gray-400 hover:bg-gray-100 hover:text-gray-800"
            onClick={() => resizeDrawWidth(clamp(mouseSize + 1, 1, 50))}
          />
          <span className="text-xs text-gray-400 w-5 text-right tabular-nums">{mouseSize}</span>
        </div>

        {/* Color group */}
        <div className="relative flex items-center gap-2 px-3 border-r border-gray-200">
          <button
            onClick={() => setShowColorPicker(!showColorPicker)}
            className="w-6 h-6 rounded-md cursor-pointer border border-gray-200 shadow-inner transition-transform hover:scale-110"
            style={{ backgroundColor: drawColor }}
            title="Color"
          />
          {showColorPicker && (
            <>
              {/* backdrop to close on click outside */}
              <div className="fixed inset-0" onClick={() => setShowColorPicker(false)} />
              <div className="absolute top-10 left-0 z-50 rounded-xl shadow-xl overflow-hidden">
                <HexColorPicker color={drawColor} onChange={setDrawColorAndMore} />
              </div>
            </>
          )}
        </div>
        <div className="grid grid-cols-6 gap-2 p-3">
          {swatches.map((color) => (
            <button
              key={color}
              onClick={() => setDrawColorAndMore(color)}
              className="w-4 h-4 rounded-md cursor-pointer border border-gray-200 shadow-inner transition-transform hover:scale-110 outline outline-1 outline-gray-200"
              style={{
                backgroundColor: color,
                borderColor: drawColor === color ? '#3b82f6' : 'transparent',
              }}
            />
          ))}
        </div>
        {/* Actions */}
        <div className="flex items-center gap-1 pl-1">
          <button
            onClick={clearCanvas}
            title="Clear canvas"
            className="p-2 rounded-lg text-gray-400 hover:bg-red-50 hover:text-red-500 transition-all duration-150"
          >
            <Trash2 size={16} strokeWidth={2} />
          </button>
        </div>
        <div className="flex items-center gap-1 px-3 border-r border-gray-200">
          <button
            onClick={undo}
            disabled={!canUndo}
            title="Undo (⌘Z)"
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-25 disabled:cursor-not-allowed transition-all duration-150"
          >
            <Undo2 size={16} strokeWidth={2} />
          </button>
          <button
            onClick={redo}
            disabled={!canRedo}
            title="Redo (⌘⇧Z)"
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 disabled:opacity-25 disabled:cursor-not-allowed transition-all duration-150"
          >
            <Redo2 size={16} strokeWidth={2} />
          </button>
        </div>
        <div className="flex items-center top-2 right-4">
          <button
            onClick={() => setShowSettings(true)}
            title="Settings"
            className="p-2 rounded-lg text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-all duration-150"
          >
            <Settings size={16} strokeWidth={2} />
          </button>
        </div>
      </div>

      <canvas
        ref={canvasRef}
        style={{
          width: '100%',
          height: '100%',
          touchAction: 'none',
          cursor: tool === 'select' ? 'none' : cursorStyle === 'crosshair' ? 'crosshair' : 'none',
        }}
        onMouseDown={(e) => {
          if (e.button === 2) {
            handleCanvasPan(e, true)
          } else if (e.button === 0) {
            startDrawing(e)
          }
        }}
        onMouseMove={(e) => {
          cursorTargetRef.current = { x: e.clientX, y: e.clientY }

          // Track cursor for collaboration
          if (channelRef.current && isSubscribedRef.current) {
            const rect = canvasRef.current?.getBoundingClientRect()
            if (rect) {
              const worldX = (e.clientX - rect.left - panRef.current.x) / scaleRef.current
              const worldY = (e.clientY - rect.top - panRef.current.y) / scaleRef.current
              channelRef.current.track({
                x: worldX,
                y: worldY,
                userId: userIdRef.current,
              })
            }
          }

          if (isPanning) {
            handleCanvasPan(e, false)
          } else if (e.buttons === 1) {
            draw(e)
          }
        }}
        onMouseUp={isPanning ? stopPan : stopDrawing}
        onMouseLeave={isPanning ? stopPan : stopDrawing}
        // onWheel={handleWheelPan}
        // onTouchStart={handleTouchStart}
        // onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
        onContextMenu={(e) => {
          e.preventDefault()
          return false
        }}
        className="flex-1 cursor-crosshair bg-white"
      />
      {tool === 'select' && (
        <div
          style={{
            position: 'fixed',
            top: cursorPos.y,
            left: cursorPos.x,
            // Centers the icon precisely on the cursor tip
            transform: 'translate(-10%, -10%)',
            pointerEvents: 'none', // Allows clicks to pass through the custom cursor
            zIndex: 1000,
          }}
        >
          <MousePointer2 size={24} color={colorScheme === 'dark' ? 'white' : 'black'} />{' '}
          {/* Customize size and color */}
        </div>
      )}
      {showSettings && (
        <>
          <div className="fixed inset-0 bg-black/40 z-50" onClick={() => setShowSettings(false)} />
          <div className="fixed inset-0 flex items-center justify-center z-50 pointer-events-none">
            <div className="bg-white rounded-2xl shadow-2xl w-96 p-6 pointer-events-auto flex flex-col gap-5">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold text-gray-800">Settings</h2>
                <button
                  onClick={() => setShowSettings(false)}
                  className="p-1 rounded-lg hover:bg-gray-100 text-gray-400"
                >
                  <X size={16} />
                </button>
              </div>

              {/* Color Scheme */}
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

              {/* HUD Size */}
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

              {/* Cursor Style */}
              <div className="flex flex-col gap-2">
                <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">
                  Cursor Style
                </label>
                <div className="flex gap-2">
                  {(['circle', 'dot', 'crosshair'] as const).map((style) => (
                    <button
                      key={style}
                      onClick={() => setCursorStyle(style)}
                      className={`flex-1 py-1.5 rounded-lg text-xs capitalize transition-all ${cursorStyle === style ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}`}
                    >
                      {style}
                    </button>
                  ))}
                </div>
              </div>

              {/* Grid */}
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
