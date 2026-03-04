export type VeinTrigger = 'click' | 'hover' | 'collision' | 'value-change' | 'state-enter'
export type VeinAction =
  | 'set-state'
  | 'set-visibility'
  | 'navigate'
  | 'emit-event'
  | 'update-text'
  | 'play-animation'

export interface ActionVein {
  id: string
  sourceId: string
  targetId: string
  trigger: VeinTrigger
  action: VeinAction
  payload?: {
    text?: string
    visible?: boolean
    labels?: string[]
  }
}
