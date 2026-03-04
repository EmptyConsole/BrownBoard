import { useEffect, useRef } from 'react'
import { Application, Container, FederatedPointerEvent, Graphics, Text } from 'pixi.js'
import { Viewport } from 'pixi-viewport'
import { useCanvasStore } from '../store/canvasStore'
import { colors } from '../theme/tokens'
import { GRID_UNIT, snapToGrid } from '../utils/grid'
import type { CanvasObject, CanvasTool, PrototypeKind, Size, Vec2 } from '../types/canvas'
import { executeVeins } from '../logic/veinsRuntime'
import { getPrototypePreset } from '../prototypes/registry'

const GRID_MAJOR = GRID_UNIT * 4

const toPixiColor = (hex: string) => Number.parseInt(hex.replace('#', ''), 16)

const createObjectForTool = (tool: CanvasTool, position: Vec2, layerIndex: number): CanvasObject => {
  const base = {
    position,
    size: { width: 160, height: 96 },
    rotation: 0,
    layerIndex,
    locked: false,
    metadata: { semantic: 'ui' as const },
  }

  switch (tool) {
    case 'frame':
      return {
        id: '',
        type: 'frame' as const,
        ...base,
        size: { width: 480, height: 360 },
        metadata: { semantic: 'ui' as const },
        title: 'Frame',
      }
    case 'shape-ellipse':
      return {
        id: '',
        type: 'shape' as const,
        ...base,
        shape: 'ellipse' as const,
        fill: '#1c2433',
        stroke: colors.accentViolet,
      }
    case 'text':
      return {
        id: '',
        type: 'text' as const,
        ...base,
        size: { width: 180, height: 48 },
        text: 'Text',
        fontSize: 16,
        color: colors.text,
        weight: 600,
        align: 'left' as const,
      }
    case 'sticky':
      return {
        id: '',
        type: 'sticky' as const,
        ...base,
        size: { width: 200, height: 160 },
        text: 'Sticky note',
        color: '#2c2414',
        metadata: { semantic: 'note' as const },
      }
    case 'arrow':
    case 'connector':
    case 'freehand':
      return {
        id: '',
        type: tool,
        ...base,
        metadata: { semantic: 'logic' as const },
        size: { width: 200, height: 1 },
        points: [
          { x: position.x, y: position.y },
          { x: position.x + 160, y: position.y },
        ],
        stroke: colors.accentBlue,
      } as CanvasObject
    case 'prototype-button':
    case 'prototype-slider':
    case 'prototype-panel':
    case 'prototype-collider':
    case 'prototype-player':
      return {
        id: '',
        type: 'prototype' as const,
        ...base,
        size: getPrototypePreset(tool.replace('prototype-', '') as PrototypeKind).size,
        prototypeType: tool.replace('prototype-', '') as PrototypeKind,
        params: {},
      }
    case 'shape-rect':
    default:
      return {
        id: '',
        type: 'shape' as const,
        ...base,
        shape: 'rect' as const,
        fill: '#131822',
        stroke: colors.accentBlue,
      }
  }
}

const drawRect = (g: Graphics, size: Size, options: { fill: string; stroke?: string; alpha?: number }) => {
  g.clear()
  g.lineStyle(1, options.stroke ? toPixiColor(options.stroke) : toPixiColor('#ffffff'), 0.12)
  g.beginFill(toPixiColor(options.fill), options.alpha ?? 1)
  g.drawRoundedRect(0, 0, size.width, size.height, GRID_UNIT * 1.2)
  g.endFill()
}

const drawSelectionOutline = (g: Graphics, size: Size, color: string) => {
  g.lineStyle(2, toPixiColor(color), 0.8)
  g.drawRoundedRect(-4, -4, size.width + 8, size.height + 8, GRID_UNIT)
}

const buildDisplayObject = (object: CanvasObject, selected: boolean) => {
  const container = new Container()
  container.position.set(object.position.x, object.position.y)
  container.rotation = (object.rotation * Math.PI) / 180
  container.eventMode = object.locked ? 'none' : 'static'
  container.cursor = object.locked ? 'not-allowed' : 'pointer'

  const baseFill = '#131822'
  const stroke = object.type === 'prototype' ? colors.accentViolet : colors.border
  const highlight = selected ? colors.accentBlue : undefined

  if (object.type === 'shape') {
    const g = new Graphics()
    drawRect(g, object.size, { fill: object.fill ?? baseFill, stroke: object.stroke ?? stroke })
    if (selected) drawSelectionOutline(g, object.size, highlight ?? colors.accentBlue)
    container.addChild(g)
  }

  if (object.type === 'frame') {
    const g = new Graphics()
    g.lineStyle(1, toPixiColor(colors.text), 0.2)
    g.drawRect(0, 0, object.size.width, object.size.height)
    container.addChild(g)
    if (selected) {
      const outline = new Graphics()
      drawSelectionOutline(outline, object.size, highlight ?? colors.accentBlue)
      container.addChild(outline)
    }
    const label = new Text({ text: object.title ?? 'Frame', style: { fill: colors.text, fontSize: 14, fontWeight: '600' } })
    label.position.set(GRID_UNIT, GRID_UNIT)
    container.addChild(label)
  }

  if (object.type === 'text') {
    const label = new Text({
      text: object.text,
      style: { fill: object.color, fontSize: object.fontSize, wordWrap: true, wordWrapWidth: object.size.width },
    })
    if (object.weight) {
      (label.style as unknown as Record<string, unknown>).fontWeight = object.weight
    }
    container.addChild(label)
    if (selected) {
      const outline = new Graphics()
      drawSelectionOutline(outline, object.size, colors.accentBlue)
      container.addChild(outline)
    }
  }

  if (object.type === 'sticky') {
    const g = new Graphics()
    drawRect(g, object.size, { fill: object.color, stroke: colors.border, alpha: 0.85 })
    const text = new Text({ text: object.text, style: { fill: colors.text, fontSize: 14, wordWrap: true, wordWrapWidth: object.size.width - GRID_UNIT * 2 } })
    text.position.set(GRID_UNIT, GRID_UNIT)
    container.addChild(g, text)
    if (selected) {
      const outline = new Graphics()
      drawSelectionOutline(outline, object.size, colors.accentViolet)
      container.addChild(outline)
    }
  }

  if (object.type === 'connector' || object.type === 'arrow' || object.type === 'freehand') {
    const g = new Graphics()
    g.lineStyle(2, toPixiColor(object.stroke), 0.9)
    const points = object.points ?? [
      { x: object.position.x, y: object.position.y },
      { x: object.position.x + object.size.width, y: object.position.y },
    ]
    const start = points[0]
    g.moveTo(0, 0)
    for (let i = 1; i < points.length; i += 1) {
      const p = points[i]
      g.lineTo(p.x - start.x, p.y - start.y)
    }
    if (selected) {
      g.lineStyle(3, toPixiColor(colors.accentViolet), 0.6)
      g.moveTo(0, 0)
      for (let i = 1; i < points.length; i += 1) {
        const p = points[i]
        g.lineTo(p.x - start.x, p.y - start.y)
      }
    }
    container.addChild(g)
  }

  if (object.type === 'prototype') {
    const g = new Graphics()
    drawRect(g, object.size, { fill: '#162033', stroke, alpha: 0.9 })
    const text = new Text({ text: `Prototype: ${object.prototypeType}`, style: { fill: colors.text, fontSize: 13, fontWeight: '600' } })
    text.position.set(GRID_UNIT, GRID_UNIT)
    container.addChild(g, text)
    if (selected) {
      const outline = new Graphics()
      drawSelectionOutline(outline, object.size, colors.accentViolet)
      container.addChild(outline)
    }
  }

  if (object.type === 'task') {
    const g = new Graphics()
    drawRect(g, object.size, { fill: '#161920', stroke: colors.border, alpha: 0.95 })
    const text = new Text({ text: `${object.title} • ${object.status}`, style: { fill: colors.text, fontSize: 13, fontWeight: '600', wordWrap: true, wordWrapWidth: object.size.width - GRID_UNIT * 2 } })
    text.position.set(GRID_UNIT, GRID_UNIT)
    container.addChild(g, text)
  }

  if (object.type === 'file') {
    const g = new Graphics()
    drawRect(g, object.size, { fill: '#10131a', stroke: colors.border, alpha: 0.8 })
    const text = new Text({ text: `${object.repoId}\n${object.path}`, style: { fill: colors.text, fontSize: 12, fontWeight: '500', wordWrap: true, wordWrapWidth: object.size.width - GRID_UNIT * 2 } })
    text.position.set(GRID_UNIT, GRID_UNIT)
    container.addChild(g, text)
    if (object.status === 'changed') {
      const badge = new Graphics()
      badge.beginFill(toPixiColor(colors.accentBlue), 0.9)
      badge.drawRoundedRect(object.size.width - 56, GRID_UNIT, 48, 20, GRID_UNIT / 2)
      badge.endFill()
      const label = new Text({ text: 'Changed', style: { fill: colors.text, fontSize: 11 } })
      label.position.set(object.size.width - 52, GRID_UNIT + 2)
      container.addChild(badge, label)
    }
  }

  if (object.type === 'ai-suggestion') {
    const outline = new Graphics()
    drawSelectionOutline(outline, object.size, colors.accentBlue)
    outline.alpha = 0.4
    container.addChild(outline)
    const text = new Text({ text: object.suggestion, style: { fill: colors.text, fontSize: 12, fontWeight: '500', wordWrap: true, wordWrapWidth: object.size.width - GRID_UNIT * 2 } })
    text.position.set(GRID_UNIT, GRID_UNIT)
    container.addChild(text)
  }

  return container
}

export function CanvasSurface() {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const appRef = useRef<Application | null>(null)
  const viewportRef = useRef<Viewport | null>(null)
  const objectLayerRef = useRef<Container | null>(null)
  const guideLayerRef = useRef<Graphics | null>(null)
  const dragState = useRef<{
    start: Vec2
    selectionIds: string[]
    originPositions: Record<string, Vec2>
  } | null>(null)
  const drawingRef = useRef<{ id: string } | null>(null)

  const objects = useCanvasStore((state) => state.objects)
  const selection = useCanvasStore((state) => state.selection.selectedIds)
  const addObject = useCanvasStore((state) => state.addObject)
  const updateObject = useCanvasStore((state) => state.updateObject)
  const setSelection = useCanvasStore((state) => state.setSelection)
  const clearSelection = useCanvasStore((state) => state.clearSelection)

  // Initialize Pixi + viewport
  useEffect(() => {
    if (!containerRef.current) return

    const container = containerRef.current
    const app = new Application()
    appRef.current = app

    let isMounted = true
    let grid: Graphics | null = null

    const init = async () => {
      try {
        await app.init({
          resizeTo: container,
          background: colors.background,
          antialias: true,
          powerPreference: 'high-performance',
        })
        if (!isMounted) {
          app.destroy()
          return
        }

      app.canvas.style.width = '100%'
      app.canvas.style.height = '100%'
      app.canvas.style.display = 'block'

      const viewport = new Viewport({
        events: app.renderer.events,
        ticker: app.ticker,
        screenWidth: app.renderer.width,
        screenHeight: app.renderer.height,
        worldWidth: 100000,
        worldHeight: 100000,
      })

      viewport.drag({ pressDrag: true })
      viewport.pinch()
      viewport.wheel()
      viewport.decelerate()
      viewport.clampZoom({ minScale: 0.25, maxScale: 4 })

      const gridLayer = new Graphics()
      grid = gridLayer
      const objectLayer = new Container()
      objectLayerRef.current = objectLayer
      const guideLayer = new Graphics()
      guideLayerRef.current = guideLayer

      viewport.addChild(gridLayer)
      viewport.addChild(guideLayer)
      viewport.addChild(objectLayer)
      app.stage.addChild(viewport)

      const drawGrid = () => {
        if (!grid) return
        grid.clear()
        const bounds = viewport.getVisibleBounds()
        const startX = Math.floor(bounds.left / GRID_MAJOR) * GRID_MAJOR - GRID_MAJOR
        const endX = Math.ceil(bounds.right / GRID_MAJOR) * GRID_MAJOR + GRID_MAJOR
        const startY = Math.floor(bounds.top / GRID_MAJOR) * GRID_MAJOR - GRID_MAJOR
        const endY = Math.ceil(bounds.bottom / GRID_MAJOR) * GRID_MAJOR + GRID_MAJOR

        grid.lineStyle(1, toPixiColor('#ffffff'), 0.04)
        for (let x = startX; x <= endX; x += GRID_MAJOR) {
          grid.moveTo(x, startY)
          grid.lineTo(x, endY)
        }
        for (let y = startY; y <= endY; y += GRID_MAJOR) {
          grid.moveTo(startX, y)
          grid.lineTo(endX, y)
        }

        grid.lineStyle(1, toPixiColor('#ffffff'), 0.02)
        for (let x = startX; x <= endX; x += GRID_UNIT) {
          grid.moveTo(x, startY)
          grid.lineTo(x, endY)
        }
        for (let y = startY; y <= endY; y += GRID_UNIT) {
          grid.moveTo(startX, y)
          grid.lineTo(endX, y)
        }
      }

      viewport.on('moved', drawGrid)

      viewport.on('pointerdown', (event) => {
        if (event.target !== viewport) return
        const world = viewport.toWorld(event.global)
        const snapped: Vec2 = { x: snapToGrid(world.x), y: snapToGrid(world.y) }
        const tool = useCanvasStore.getState().activeTool
        if (tool === 'select') {
          clearSelection()
          return
        }
        if (tool === 'freehand') {
          const created = createObjectForTool(tool, snapped, useCanvasStore.getState().objects.length)
          const object = {
            ...created,
            points: [snapped],
            size: { width: 1, height: 1 },
          } as CanvasObject
          const id = addObject(object)
          drawingRef.current = { id }
          setSelection([id])
          return
        }
        const object = createObjectForTool(tool, snapped, useCanvasStore.getState().objects.length)
        const id = addObject(object)
        setSelection([id])
      })

      viewport.on('pointermove', (event) => {
        if (drawingRef.current) {
          const world = viewport.toWorld(event.global)
          const snapped: Vec2 = { x: snapToGrid(world.x), y: snapToGrid(world.y) }
          const state = useCanvasStore.getState()
          const existing = state.objects.find((obj) => obj.id === drawingRef.current?.id)
          if (existing && 'points' in existing) {
            const nextPoints = [...(existing.points ?? []), snapped]
            const minX = Math.min(...nextPoints.map((p) => p.x))
            const maxX = Math.max(...nextPoints.map((p) => p.x))
            const minY = Math.min(...nextPoints.map((p) => p.y))
            const maxY = Math.max(...nextPoints.map((p) => p.y))
            updateObject(existing.id, {
              points: nextPoints,
              position: { x: minX, y: minY },
              size: { width: maxX - minX, height: maxY - minY },
            })
          }
        }
        if (!dragState.current) return
        const world = viewport.toWorld(event.global)
        const delta = {
          x: snapToGrid(world.x - dragState.current.start.x),
          y: snapToGrid(world.y - dragState.current.start.y),
        }
        const guideLayer = guideLayerRef.current
        guideLayer?.clear()

        const currentObjects = useCanvasStore.getState().objects
        const primaryId = dragState.current.selectionIds[0]
        const origin = dragState.current.originPositions[primaryId]
        const primary = currentObjects.find((obj) => obj.id === primaryId)
        if (primary && origin && guideLayer) {
          const newPos = { x: snapToGrid(origin.x + delta.x), y: snapToGrid(origin.y + delta.y) }
          const center = {
            x: newPos.x + primary.size.width / 2,
            y: newPos.y + primary.size.height / 2,
          }
          const bounds = viewport.getVisibleBounds()
          currentObjects.forEach((obj) => {
            if (dragState.current?.selectionIds.includes(obj.id)) return
            const otherCenter = {
              x: obj.position.x + obj.size.width / 2,
              y: obj.position.y + obj.size.height / 2,
            }
            if (Math.abs(center.x - otherCenter.x) <= GRID_UNIT / 2) {
              guideLayer.lineStyle(1, toPixiColor(colors.accentBlue), 0.5)
              guideLayer.moveTo(center.x, bounds.top)
              guideLayer.lineTo(center.x, bounds.bottom)
            }
            if (Math.abs(center.y - otherCenter.y) <= GRID_UNIT / 2) {
              guideLayer.lineStyle(1, toPixiColor(colors.accentViolet), 0.5)
              guideLayer.moveTo(bounds.left, center.y)
              guideLayer.lineTo(bounds.right, center.y)
            }
          })
        }

        dragState.current.selectionIds.forEach((id) => {
          const origin = dragState.current?.originPositions[id]
          if (!origin) return
          updateObject(id, {
            position: {
              x: snapToGrid(origin.x + delta.x),
              y: snapToGrid(origin.y + delta.y),
            },
          })
        })

        dragState.current.selectionIds.forEach((id) => {
          const moved = useCanvasStore.getState().objects.find((obj) => obj.id === id)
          if (!moved) return
          useCanvasStore
            .getState()
            .objects.filter((obj) => obj.id !== id)
            .forEach((other) => {
              const intersect =
                moved.position.x < other.position.x + other.size.width &&
                moved.position.x + moved.size.width > other.position.x &&
                moved.position.y < other.position.y + other.size.height &&
                moved.position.y + moved.size.height > other.position.y
              if (intersect) {
                executeVeins(id, 'collision')
              }
            })
        })
      })

      const stopDrag = () => {
        dragState.current = null
        guideLayerRef.current?.clear()
        drawingRef.current = null
      }

      viewport.on('pointerup', stopDrag)
      viewport.on('pointerupoutside', stopDrag)

      containerRef.current?.appendChild(app.canvas)
      drawGrid()
      viewportRef.current = viewport
      } catch (err) {
        console.error('Error during canvas initialization:', err)
        if (isMounted) {
          app.destroy(false)
        }
      }
    }

    init().catch((err) => {
      console.error('Failed to initialize canvas:', err)
    })

    return () => {
      isMounted = false
      dragState.current = null
      try {
        if (container && app?.canvas?.parentElement === container) {
          container.removeChild(app.canvas)
        }
        viewportRef.current?.destroy()
        app?.destroy(false)
      } catch (err) {
        console.error('Error during cleanup:', err)
      }
    }
  }, [addObject, clearSelection, setSelection, updateObject])

  // Render objects when state changes
  useEffect(() => {
    const viewport = viewportRef.current
    const objectLayer = objectLayerRef.current
    if (!viewport || !objectLayer) return
    objectLayer.removeChildren()

    const sorted = [...objects].sort((a, b) => a.layerIndex - b.layerIndex)
    sorted.forEach((object) => {
      if (object.visible === false) return
      const display = buildDisplayObject(object, selection.includes(object.id))
      display.on('pointerdown', (event: FederatedPointerEvent) => {
        event.stopPropagation()
        const original = event.originalEvent
        const multi = Boolean(original && 'shiftKey' in original && (original as unknown as PointerEvent).shiftKey)
        if (multi) {
          setSelection([...new Set([...selection, object.id])])
        } else {
          setSelection([object.id])
        }
        executeVeins(object.id, 'click')
        if (object.locked) return
        const world = viewport.toWorld(event.global)
        dragState.current = {
          start: world,
          selectionIds: multi ? [...new Set([...selection, object.id])] : [object.id],
          originPositions: Object.fromEntries(
            (multi ? [...new Set([...selection, object.id])] : [object.id]).map((id) => {
              const target = objects.find((obj) => obj.id === id)
              return [id, target?.position ?? { x: 0, y: 0 }]
            }),
          ),
        }
      })
      display.on('pointerover', () => {
        executeVeins(object.id, 'hover')
      })

      objectLayer.addChild(display)
    })
  }, [objects, selection, setSelection])

  return <div className="canvas-surface" ref={containerRef} />
}
