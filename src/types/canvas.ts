import { z } from 'zod'

export type SemanticTag = 'note' | 'ui' | 'logic' | 'task'

export type CanvasObjectType =
  | 'frame'
  | 'shape'
  | 'text'
  | 'sticky'
  | 'connector'
  | 'arrow'
  | 'freehand'
  | 'prototype'
  | 'task'
  | 'file'
  | 'ai-suggestion'

export type PrototypeKind = 'button' | 'slider' | 'panel' | 'collider' | 'player' | 'generic'

export interface Vec2 {
  x: number
  y: number
}

export interface Size {
  width: number
  height: number
}

export interface BaseObject {
  id: string
  type: CanvasObjectType
  position: Vec2
  size: Size
  rotation: number
  groupId?: string
  locked?: boolean
  visible?: boolean
  layerIndex: number
  metadata?: {
    semantic?: SemanticTag
    labels?: string[]
    note?: string
  }
}

export interface FrameObject extends BaseObject {
  type: 'frame'
  title?: string
}

export interface ShapeObject extends BaseObject {
  type: 'shape'
  shape: 'rect' | 'ellipse'
  fill: string
  stroke: string
}

export interface TextObject extends BaseObject {
  type: 'text'
  text: string
  fontSize: number
  color: string
  weight?: number
  align?: 'left' | 'center' | 'right'
}

export interface StickyObject extends BaseObject {
  type: 'sticky'
  text: string
  color: string
}

export interface ConnectorObject extends BaseObject {
  type: 'connector' | 'arrow' | 'freehand'
  points: Vec2[]
  stroke: string
}

export interface PrototypeObject extends BaseObject {
  type: 'prototype'
  prototypeType: PrototypeKind
  params: Record<string, unknown>
}

export interface TaskObject extends BaseObject {
  type: 'task'
  title: string
  status: 'backlog' | 'in-progress' | 'blocked' | 'done'
  owner?: string
  priority?: 'low' | 'medium' | 'high'
  due?: string
}

export interface FileObject extends BaseObject {
  type: 'file'
  repoId: string
  path: string
  status?: 'clean' | 'changed'
}

export interface AiSuggestionObject extends BaseObject {
  type: 'ai-suggestion'
  suggestion: string
  targetIds: string[]
}

export type CanvasObject =
  | FrameObject
  | ShapeObject
  | TextObject
  | StickyObject
  | ConnectorObject
  | PrototypeObject
  | TaskObject
  | FileObject
  | AiSuggestionObject

export type CanvasTool =
  | 'select'
  | 'frame'
  | 'shape-rect'
  | 'shape-ellipse'
  | 'text'
  | 'sticky'
  | 'arrow'
  | 'connector'
  | 'freehand'
  | 'prototype-button'
  | 'prototype-slider'
  | 'prototype-panel'
  | 'prototype-collider'
  | 'prototype-player'

export const canvasObjectSchema = z.object({
  id: z.string(),
  type: z.string(),
  position: z.object({ x: z.number(), y: z.number() }),
  size: z.object({ width: z.number(), height: z.number() }),
  rotation: z.number(),
  locked: z.boolean().optional(),
  layerIndex: z.number(),
  metadata: z
    .object({
      semantic: z.union([z.literal('note'), z.literal('ui'), z.literal('logic'), z.literal('task')]).optional(),
      labels: z.array(z.string()).optional(),
      note: z.string().optional(),
    })
    .optional(),
})
