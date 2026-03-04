import { useMemo, useState } from 'react'
import { useCanvasStore } from '../store/canvasStore'
import type { CanvasObject, PrototypeKind } from '../types/canvas'
import type { ActionVein, VeinAction, VeinTrigger } from '../types/veins'

const semanticOptions = ['note', 'ui', 'logic', 'task'] as const

export function PropertiesPanel() {
  const {
    selected,
    selectionCount,
    veins,
    objects,
    updateObject,
    groupSelection,
    ungroupSelection,
    setLockedForSelection,
    bumpLayer,
    convertToPrototype,
    addVein,
    removeVein,
  } = useCanvasStore((state) => ({
    selected: state.objects.find((obj) => obj.id === state.selection.selectedIds[0]),
    selectionCount: state.selection.selectedIds.length,
    veins: state.veins,
    objects: state.objects,
    updateObject: state.updateObject,
    groupSelection: state.groupSelection,
    ungroupSelection: state.ungroupSelection,
    setLockedForSelection: state.setLockedForSelection,
    bumpLayer: state.bumpLayer,
    convertToPrototype: state.convertToPrototype,
    addVein: state.addVein,
    removeVein: state.removeVein,
  }))

  const selectionLabel = useMemo(() => {
    if (!selected) return 'Nothing selected'
    return `${selected.type} (${selected.metadata?.semantic ?? 'unspecified'})`
  }, [selected])

  const handleChange = (field: keyof CanvasObject, value: unknown) => {
    if (!selected) return
    updateObject(selected.id, { [field]: value } as Partial<CanvasObject>)
  }

  const [veinTarget, setVeinTarget] = useState<string>('')
  const [veinTrigger, setVeinTrigger] = useState<VeinTrigger>('click')
  const [veinAction, setVeinAction] = useState<VeinAction>('set-visibility')

  return (
    <div className="properties-panel">
      <div className="panel-header">
        <div className="panel-title">Properties</div>
        <div className="panel-subtitle">{selectionLabel}</div>
      </div>

      {selectionCount > 1 && (
        <div className="panel-actions">
          <button type="button" onClick={() => groupSelection()}>
            Group
          </button>
          <button type="button" onClick={() => ungroupSelection()}>
            Ungroup
          </button>
        </div>
      )}

      {!selected ? (
        <div className="panel-empty">Select any object to edit its properties.</div>
      ) : (
        <div className="panel-grid">
          <label className="panel-field">
            <span>Width</span>
            <input
              type="number"
              value={Math.round(selected.size.width)}
              onChange={(e) => handleChange('size', { ...selected.size, width: Number(e.target.value) })}
            />
          </label>
          <label className="panel-field">
            <span>Height</span>
            <input
              type="number"
              value={Math.round(selected.size.height)}
              onChange={(e) => handleChange('size', { ...selected.size, height: Number(e.target.value) })}
            />
          </label>
          <label className="panel-field">
            <span>Rotation</span>
            <input
              type="number"
              value={Math.round(selected.rotation)}
              onChange={(e) => handleChange('rotation', Number(e.target.value))}
            />
          </label>
          <label className="panel-field">
            <span>Layer</span>
            <input
              type="number"
              value={selected.layerIndex}
              onChange={(e) => handleChange('layerIndex', Number(e.target.value))}
            />
          </label>
          <label className="panel-field">
            <span>Semantic</span>
            <select
              value={selected.metadata?.semantic ?? ''}
              onChange={(e) =>
                handleChange('metadata', { ...selected.metadata, semantic: e.target.value || undefined })
              }
            >
              <option value="">Not set</option>
              {semanticOptions.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </label>
          <label className="panel-field checkbox">
            <input
              type="checkbox"
              checked={Boolean(selected.locked)}
              onChange={(e) => setLockedForSelection(e.target.checked)}
            />
            <span>Locked</span>
          </label>
          {['shape', 'frame', 'text', 'sticky'].includes(selected.type) && (
            <label className="panel-field">
              <span>Convert to prototype</span>
              <select
                value=""
                onChange={(e) => {
                  if (!e.target.value) return
                  convertToPrototype(selected.id, e.target.value as PrototypeKind)
                }}
              >
                <option value="">Choose type</option>
                <option value="button">Button</option>
                <option value="slider">Slider</option>
                <option value="panel">Panel</option>
                <option value="collider">Collider</option>
                <option value="player">Player</option>
              </select>
            </label>
          )}
          <div className="panel-actions">
            <button type="button" onClick={() => bumpLayer('up')}>
              Bring forward
            </button>
            <button type="button" onClick={() => bumpLayer('down')}>
              Send backward
            </button>
          </div>
          {selected && (
            <div className="panel-field">
              <span>Action Veins</span>
              <div className="vein-row">
                <div className="vein-grid">
                  <select value={veinTrigger} onChange={(e) => setVeinTrigger(e.target.value as VeinTrigger)}>
                    <option value="click">click</option>
                    <option value="hover">hover</option>
                    <option value="value-change">value-change</option>
                    <option value="collision">collision</option>
                    <option value="state-enter">state-enter</option>
                  </select>
                  <select value={veinAction} onChange={(e) => setVeinAction(e.target.value as VeinAction)}>
                    <option value="set-visibility">set-visibility</option>
                    <option value="emit-event">emit-event</option>
                    <option value="update-text">update-text</option>
                    <option value="set-state">set-state</option>
                  </select>
                  <select value={veinTarget} onChange={(e) => setVeinTarget(e.target.value)}>
                    <option value="">target</option>
                    {objects
                      .filter((obj) => obj.id !== selected.id)
                      .map((obj) => (
                        <option key={obj.id} value={obj.id}>
                          {obj.type} ({obj.id.slice(0, 6)})
                        </option>
                      ))}
                  </select>
                  <button
                    type="button"
                    onClick={() => {
                      if (!veinTarget) return
                      const newVein: ActionVein = {
                        id: crypto.randomUUID(),
                        sourceId: selected.id,
                        targetId: veinTarget,
                        trigger: veinTrigger,
                        action: veinAction,
                        payload: veinAction === 'set-visibility' ? { visible: false } : undefined,
                      }
                      addVein(newVein)
                      setVeinTarget('')
                    }}
                  >
                    Add
                  </button>
                </div>
                <div className="vein-list">
                  {veins
                    .filter((vein) => vein.sourceId === selected.id || vein.targetId === selected.id)
                    .map((vein) => (
                      <div key={vein.id} className="vein-chip">
                        {vein.trigger} → {vein.action}
                        <button type="button" onClick={() => removeVein(vein.id)}>
                          ✕
                        </button>
                      </div>
                    ))}
                </div>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )
}
