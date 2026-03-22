import React, { useCallback, useEffect, useMemo, useState } from 'react'
import { Pencil, Plus, Trash2 } from 'lucide-react'
import { supabase } from './lib/supabase'

type DefaultStatus = 'not_started' | 'in_progress' | 'completed' | 'tabled'
type DefaultUrgency = 'critical' | 'high' | 'medium' | 'low' | 'tabled'
type TaskStatus = DefaultStatus | string
type TaskUrgency = DefaultUrgency | string
type TaskOptionType = 'status' | 'urgency'

interface TaskOption {
  id?: string
  value: string
  label: string
  color: string
  badgeClass?: string
  dotClass?: string
  type: TaskOptionType
  isCustom?: boolean
}

type DbCategory = {
  id: string
  name: string
  position: number | null
}

type DbTask = {
  id: string
  title: string
  description: string | null
  status: TaskStatus
  urgency?: TaskUrgency | null
  category_id: string
  position: number | null
}

interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  urgency: TaskUrgency
  categoryId: string
  position: number
}

interface Category {
  id: string
  name: string
  position: number
  tasks: Task[]
}

const toTitleCase = (value: string) =>
  value
    .replace(/[_-]+/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .replace(/\b\w/g, (c) => c.toUpperCase())

const slugify = (value: string) => {
  const base = value.trim().toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '')
  return base || `custom_${Date.now()}`
}

const hexToRgba = (hex: string, alpha: number) => {
  let clean = hex.replace('#', '')
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (clean.length !== 6) return `rgba(107, 114, 128, ${alpha})`
  const num = parseInt(clean, 16)
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  return `rgba(${r}, ${g}, ${b}, ${alpha})`
}

const getContrastTextColor = (hex: string) => {
  let clean = hex.replace('#', '')
  if (clean.length === 3) {
    clean = clean
      .split('')
      .map((c) => c + c)
      .join('')
  }
  if (clean.length !== 6) return '#111827'
  const num = parseInt(clean, 16)
  const r = (num >> 16) & 255
  const g = (num >> 8) & 255
  const b = num & 255
  const luminance = (0.299 * r + 0.587 * g + 0.114 * b) / 255
  return luminance > 0.6 ? '#111827' : '#ffffff'
}

const DEFAULT_STATUS_OPTIONS: TaskOption[] = [
  {
    value: 'not_started',
    label: 'Not started',
    color: '#6b7280',
    badgeClass: 'bg-gray-200 text-gray-700',
    dotClass: 'bg-gray-500',
    type: 'status',
  },
  {
    value: 'in_progress',
    label: 'In progress',
    color: '#f59e0b',
    badgeClass: 'bg-amber-100 text-amber-800',
    dotClass: 'bg-amber-500',
    type: 'status',
  },
  {
    value: 'completed',
    label: 'Completed',
    color: '#10b981',
    badgeClass: 'bg-emerald-100 text-emerald-800',
    dotClass: 'bg-emerald-500',
    type: 'status',
  },
  {
    value: 'tabled',
    label: 'Tabled',
    color: '#3b82f6',
    badgeClass: 'bg-blue-100 text-blue-800',
    dotClass: 'bg-blue-500',
    type: 'status',
  },
]

const DEFAULT_URGENCY_OPTIONS: TaskOption[] = [
  {
    value: 'critical',
    label: 'Critical',
    color: '#ef4444',
    badgeClass: 'bg-red-100 text-red-800',
    dotClass: 'bg-red-500',
    type: 'urgency',
  },
  {
    value: 'high',
    label: 'High',
    color: '#f97316',
    badgeClass: 'bg-orange-100 text-orange-800',
    dotClass: 'bg-orange-500',
    type: 'urgency',
  },
  {
    value: 'medium',
    label: 'Medium',
    color: '#eab308',
    badgeClass: 'bg-yellow-100 text-yellow-800',
    dotClass: 'bg-yellow-500',
    type: 'urgency',
  },
  {
    value: 'low',
    label: 'Low',
    color: '#22c55e',
    badgeClass: 'bg-green-100 text-green-800',
    dotClass: 'bg-green-500',
    type: 'urgency',
  },
  {
    value: 'tabled',
    label: 'Tabled',
    color: '#3b82f6',
    badgeClass: 'bg-blue-100 text-blue-800',
    dotClass: 'bg-blue-500',
    type: 'urgency',
  },
]

const mapTask = (task: DbTask): Task => ({
  id: task.id,
  title: task.title,
  description: task.description || '',
  status: task.status,
  urgency: task.urgency ?? 'medium',
  categoryId: task.category_id,
  position: task.position ?? 0,
})

const buildBoard = (categories: DbCategory[], tasks: DbTask[]): Category[] => {
  const sortedCats = [...categories].sort((a, b) => (a.position ?? 0) - (b.position ?? 0))
  const buckets = new Map<string, Task[]>()
  sortedCats.forEach((cat) => buckets.set(cat.id, []))

  tasks
    .map(mapTask)
    .sort((a, b) => a.position - b.position)
    .forEach((task) => {
      const bucket = buckets.get(task.categoryId)
      if (bucket) bucket.push(task)
    })

  return sortedCats.map((cat) => ({
    id: cat.id,
    name: cat.name,
    position: cat.position ?? 0,
    tasks: buckets.get(cat.id) ?? [],
  }))
}

export const KanbanBoard: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([])
  const [newCategoryName, setNewCategoryName] = useState('')
  const [newTaskInputs, setNewTaskInputs] = useState<Record<string, string>>({})
  const [statusMenu, setStatusMenu] = useState<{ taskId: string; categoryId: string } | null>(null)
  const [urgencyMenu, setUrgencyMenu] = useState<{ taskId: string; categoryId: string } | null>(null)
  const [draggedTask, setDraggedTask] = useState<{ taskId: string; fromCategoryId: string } | null>(null)
  const [editingTask, setEditingTask] = useState<{
    taskId: string
    categoryId: string
    title: string
    description: string
  } | null>(null)
  const [customStatusOptions, setCustomStatusOptions] = useState<TaskOption[]>([])
  const [customUrgencyOptions, setCustomUrgencyOptions] = useState<TaskOption[]>([])
  const [addOptionForm, setAddOptionForm] = useState<{
    open: boolean
    type: TaskOptionType
    label: string
    color: string
    anchorTaskId?: string
    anchorCategoryId?: string
  }>({ open: false, type: 'status', label: '', color: '#3b82f6' })
  const [savingOption, setSavingOption] = useState(false)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const maxCategoryPosition = useMemo(
    () => Math.max(0, ...(categories.map((c) => c.position).filter((p) => typeof p === 'number') as number[])),
    [categories],
  )

  const mapOptionRow = (row: any): TaskOption => ({
    id: row.id,
    value: row.value,
    label: row.label,
    color: row.color || '#6b7280',
    type: row.type as TaskOptionType,
    isCustom: true,
  })

  const loadTaskOptions = useCallback(async () => {
    const { data, error: optionsError } = await supabase
      .from('task_options')
      .select('*')
      .order('created_at', { ascending: true })

    if (optionsError) {
      setError(optionsError.message)
      return
    }

    if (data) {
      const defaultStatusValues = new Set(DEFAULT_STATUS_OPTIONS.map((o) => o.value))
      const defaultUrgencyValues = new Set(DEFAULT_URGENCY_OPTIONS.map((o) => o.value))
      const customStatus = data.filter((row) => row.type === 'status' && !defaultStatusValues.has(row.value)).map(mapOptionRow)
      const customUrgency = data
        .filter((row) => row.type === 'urgency' && !defaultUrgencyValues.has(row.value))
        .map(mapOptionRow)

      setCustomStatusOptions(customStatus)
      setCustomUrgencyOptions(customUrgency)
    }
  }, [])

  const statusOptions = useMemo(
    () => [...DEFAULT_STATUS_OPTIONS, ...customStatusOptions],
    [customStatusOptions],
  )

  const urgencyOptions = useMemo(
    () => [...DEFAULT_URGENCY_OPTIONS, ...customUrgencyOptions],
    [customUrgencyOptions],
  )

  const resetAddOptionForm = useCallback(() => {
    setAddOptionForm({ open: false, type: 'status', label: '', color: '#3b82f6' })
    setSavingOption(false)
  }, [])

  const ensureOption = useCallback(
    (options: TaskOption[], value: string | null | undefined, type: TaskOptionType): TaskOption => {
      if (!value) return { value: '', label: 'Unknown', color: '#6b7280', type }
      const found = options.find((o) => o.value === value)
      if (found) return found
      return {
        value,
        label: toTitleCase(value),
        color: '#6b7280',
        type,
        isCustom: true,
      }
    },
    [],
  )

  const getBadgeClass = (option: TaskOption) => option.badgeClass ?? ''
  const getBadgeStyle = (option: TaskOption) =>
    option.badgeClass
      ? undefined
      : {
          backgroundColor: hexToRgba(option.color, 0.16),
          color: getContrastTextColor(option.color),
        }
  const getDotClass = (option: TaskOption) => option.dotClass ?? ''
  const getDotStyle = (option: TaskOption) => (option.dotClass ? undefined : { backgroundColor: option.color })

  const loadBoard = useCallback(async () => {
    setLoading(true)
    setError(null)
    const [{ data: categoryData, error: categoryError }, { data: taskData, error: taskError }] = await Promise.all([
      supabase.from('categories').select('*').order('position', { ascending: true }),
      supabase.from('tasks').select('*').order('position', { ascending: true }),
    ])

    if (categoryError || taskError) {
      setError(categoryError?.message || taskError?.message || 'Unable to load board')
      setLoading(false)
      return
    }

    setCategories(buildBoard(categoryData || [], taskData || []))
    setLoading(false)
  }, [])

  useEffect(() => {
    loadBoard()
    loadTaskOptions()
  }, [loadBoard, loadTaskOptions])

  const addCategory = async () => {
    const trimmed = newCategoryName.trim()
    if (!trimmed) return

    const position = maxCategoryPosition + 1
    const { data, error: insertError } = await supabase
      .from('categories')
      .insert({ name: trimmed, position })
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      return
    }

    if (data) {
      setCategories((prev) => [...prev, { id: data.id, name: data.name, position: data.position ?? position, tasks: [] }])
      setNewCategoryName('')
    }
  }

  const addTask = async (categoryId: string) => {
    const title = newTaskInputs[categoryId]?.trim()
    if (!title) return

    const category = categories.find((c) => c.id === categoryId)
    const position = category ? category.tasks.length : 0

    const { data, error: insertError } = await supabase
      .from('tasks')
      .insert({ title, status: 'not_started', urgency: 'medium', category_id: categoryId, position })
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      return
    }

    if (data) {
      const mapped = mapTask(data)
      setCategories((prev) =>
        prev.map((cat) => (cat.id === categoryId ? { ...cat, tasks: [...cat.tasks, mapped] } : cat)),
      )
      setNewTaskInputs((prev) => {
        const next = { ...prev }
        delete next[categoryId]
        return next
      })
    }
  }

  const updateTaskStatus = async (categoryId: string, taskId: string, status: TaskStatus) => {
    setCategories((prev) =>
      prev.map((cat) =>
        cat.id === categoryId
          ? { ...cat, tasks: cat.tasks.map((t) => (t.id === taskId ? { ...t, status } : t)) }
          : cat,
      ),
    )

    const { error: updateError } = await supabase.from('tasks').update({ status }).eq('id', taskId)
    if (updateError) {
      setError(updateError.message)
      loadBoard()
    }

    setStatusMenu(null)
  }

  const updateTaskUrgency = async (categoryId: string, taskId: string, urgency: TaskUrgency) => {
    setCategories((prev) =>
      prev.map((cat) =>
        cat.id === categoryId
          ? { ...cat, tasks: cat.tasks.map((t) => (t.id === taskId ? { ...t, urgency } : t)) }
          : cat,
      ),
    )

    const { error: updateError } = await supabase.from('tasks').update({ urgency }).eq('id', taskId)
    if (updateError) {
      setError(updateError.message)
      loadBoard()
    }

    setUrgencyMenu(null)
  }

  const openAddOptionForm = (type: TaskOptionType, categoryId: string, taskId: string) => {
    setAddOptionForm({
      open: true,
      type,
      label: '',
      color: '#3b82f6',
      anchorCategoryId: categoryId,
      anchorTaskId: taskId,
    })
  }

  const saveNewOption = async () => {
    if (!addOptionForm.open) return
    const trimmedLabel = addOptionForm.label.trim()
    if (!trimmedLabel) return
    const color = addOptionForm.color || '#3b82f6'
    setSavingOption(true)

    const { data, error: insertError } = await supabase
      .from('task_options')
      .insert({
        type: addOptionForm.type,
        value: slugify(trimmedLabel),
        label: trimmedLabel,
        color,
      })
      .select()
      .single()

    if (insertError) {
      setError(insertError.message)
      setSavingOption(false)
      return
    }

    const mapped = data ? mapOptionRow(data) : null
    if (mapped) {
      if (mapped.type === 'status') {
        setCustomStatusOptions((prev) => [...prev, mapped])
      } else {
        setCustomUrgencyOptions((prev) => [...prev, mapped])
      }

      if (addOptionForm.anchorCategoryId && addOptionForm.anchorTaskId) {
        if (mapped.type === 'status') {
          updateTaskStatus(addOptionForm.anchorCategoryId, addOptionForm.anchorTaskId, mapped.value)
        } else {
          updateTaskUrgency(addOptionForm.anchorCategoryId, addOptionForm.anchorTaskId, mapped.value as TaskUrgency)
        }
      }
    }

    setSavingOption(false)
    resetAddOptionForm()
  }

  const updateTaskDetails = async (categoryId: string, taskId: string, title: string, description: string) => {
    const trimmedTitle = title.trim()
    if (!trimmedTitle) return

    setCategories((prev) =>
      prev.map((cat) =>
        cat.id === categoryId
          ? {
              ...cat,
              tasks: cat.tasks.map((t) =>
                t.id === taskId ? { ...t, title: trimmedTitle, description: description.trim() } : t,
              ),
            }
          : cat,
      ),
    )

    const { error: updateError } = await supabase
      .from('tasks')
      .update({ title: trimmedTitle, description: description.trim() || null })
      .eq('id', taskId)

    if (updateError) {
      setError(updateError.message)
      loadBoard()
    }

    setEditingTask(null)
  }

  const deleteTask = async (taskId: string, categoryId: string) => {
    setCategories((prev) =>
      prev.map((cat) => (cat.id === categoryId ? { ...cat, tasks: cat.tasks.filter((t) => t.id !== taskId) } : cat)),
    )
    const { error: deleteError } = await supabase.from('tasks').delete().eq('id', taskId)
    if (deleteError) {
      setError(deleteError.message)
      loadBoard()
    }
  }

  const deleteCategory = async (categoryId: string) => {
    setCategories((prev) => prev.filter((cat) => cat.id !== categoryId))
    setNewTaskInputs((prev) => {
      const next = { ...prev }
      delete next[categoryId]
      return next
    })
    setEditingTask((prev) => (prev?.categoryId === categoryId ? null : prev))
    setStatusMenu((prev) => (prev?.categoryId === categoryId ? null : prev))
    setUrgencyMenu((prev) => (prev?.categoryId === categoryId ? null : prev))

    const { error: deleteTasksError } = await supabase.from('tasks').delete().eq('category_id', categoryId)
    if (deleteTasksError) {
      setError(deleteTasksError.message)
      loadBoard()
      return
    }

    const { error: deleteCategoryError } = await supabase.from('categories').delete().eq('id', categoryId)
    if (deleteCategoryError) {
      setError(deleteCategoryError.message)
      loadBoard()
    }
  }

  const handleDragStart = (taskId: string, categoryId: string, e: React.DragEvent<HTMLDivElement>) => {
    e.dataTransfer.effectAllowed = 'move'
    e.dataTransfer.setData('text/plain', taskId)
    setDraggedTask({ taskId, fromCategoryId: categoryId })
  }

  const handleColumnDragOver = (e: React.DragEvent<HTMLDivElement>, categoryId: string) => {
    e.preventDefault()
    if (!draggedTask) return
    if (draggedTask.fromCategoryId === categoryId) return
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    e.currentTarget.classList.add('bg-blue-50')
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.classList.remove('bg-blue-50')
  }

  const handleTaskDragOver = (e: React.DragEvent<HTMLDivElement>, categoryId: string, targetTaskId: string) => {
    e.preventDefault()
    if (!draggedTask) return
    if (e.dataTransfer) e.dataTransfer.dropEffect = 'move'
    const isSameCategory = draggedTask.fromCategoryId === categoryId

    setCategories((prev) => {
      const sourceIndex = prev.findIndex((cat) => cat.id === draggedTask.fromCategoryId)
      const targetIndex = prev.findIndex((cat) => cat.id === categoryId)
      if (sourceIndex === -1 || targetIndex === -1) return prev

      const sourceCat = prev[sourceIndex]
      const targetCat = prev[targetIndex]

      const sourceTasks = [...sourceCat.tasks]
      const fromIdx = sourceTasks.findIndex((t) => t.id === draggedTask.taskId)
      if (fromIdx === -1) return prev

      const [movedTask] = sourceTasks.splice(fromIdx, 1)
      const targetTasks = isSameCategory ? sourceTasks : [...targetCat.tasks]

      const targetIdx = targetTasks.findIndex((t) => t.id === targetTaskId)
      const insertIdx = targetIdx === -1 ? targetTasks.length : targetIdx

      // Avoid no-op reorders
      if (isSameCategory && insertIdx === fromIdx) return prev

      targetTasks.splice(insertIdx, 0, { ...movedTask, categoryId })

      const next = [...prev]
      next[sourceIndex] = { ...sourceCat, tasks: isSameCategory ? targetTasks : sourceTasks }
      next[targetIndex] = { ...targetCat, tasks: targetTasks }

      return next
    })
  }

  const handleDrop = async (categoryId: string, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.classList.remove('bg-blue-50')
    if (!draggedTask) return

    let sourceOrder: Task[] = []
    let destinationOrder: Task[] = []

    setCategories((prev) => {
      const destination = prev.find((cat) => cat.id === categoryId)
      const destinationHasTask = destination?.tasks.some((t) => t.id === draggedTask.taskId)

      if (destinationHasTask) {
        const next = prev.map((cat) =>
          cat.id === categoryId ? cat : { ...cat, tasks: cat.tasks.filter((t) => t.id !== draggedTask.taskId) },
        )
        sourceOrder = next.find((c) => c.id === draggedTask.fromCategoryId)?.tasks ?? []
        destinationOrder = next.find((c) => c.id === categoryId)?.tasks ?? []
        return next
      }

      let taskToMove: Task | undefined
      const stripped = prev.map((cat) => {
        const remaining = cat.tasks.filter((t) => {
          if (t.id === draggedTask.taskId) {
            taskToMove = t
            return false
          }
          return true
        })
        return { ...cat, tasks: remaining }
      })

      const next = stripped.map((cat) =>
        cat.id === categoryId && taskToMove
          ? { ...cat, tasks: [...cat.tasks, { ...taskToMove, categoryId }] }
          : cat,
      )

      sourceOrder = next.find((c) => c.id === draggedTask.fromCategoryId)?.tasks ?? []
      destinationOrder = next.find((c) => c.id === categoryId)?.tasks ?? []

      return next
    })

    const updates: Array<PromiseLike<{ error: any }>> = destinationOrder.map(
      (task, index) =>
        supabase
          .from('tasks')
          .update({ position: index, category_id: categoryId })
          .eq('id', task.id) as unknown as PromiseLike<{ error: any }>,
    )

    if (categoryId !== draggedTask.fromCategoryId) {
      updates.push(
        ...sourceOrder.map(
          (task, index) =>
            supabase
              .from('tasks')
              .update({ position: index, category_id: task.categoryId })
              .eq('id', task.id) as unknown as PromiseLike<{ error: any }>,
        ),
      )
    }

    const results = await Promise.all(updates)
    const updateError = (results as Array<{ error?: any }>).find((r) => r.error)?.error

    if (updateError) {
      setError(updateError.message)
      loadBoard()
    }

    setDraggedTask(null)
  }

  const isAddCategoryDisabled = newCategoryName.trim().length === 0

  if (loading) {
    return (
      <div className="flex h-screen items-center justify-center bg-gray-50">
        <p className="text-sm text-gray-500">Loading board...</p>
      </div>
    )
  }

  return (
    <div className="flex h-screen min-h-0 bg-gray-50 overflow-hidden">
      <div className="flex-1 min-h-0 overflow-x-auto p-6 space-y-4 flex flex-col">
        <div className="flex items-center gap-3">
          <input
            type="text"
            placeholder="Add a category..."
            value={newCategoryName}
            onChange={(e) => setNewCategoryName(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') addCategory()
            }}
            className="w-64 px-3 py-2 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500 bg-white"
          />
          <button
            onClick={addCategory}
            disabled={isAddCategoryDisabled}
            className={`inline-flex items-center gap-2 px-3 py-2 rounded transition-colors text-sm ${
              isAddCategoryDisabled
                ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                : 'bg-blue-600 text-white hover:bg-blue-700'
            }`}
            title="Add category"
          >
            <Plus size={16} />
            Add List
          </button>
          {error && <span className="text-sm text-red-600">{error}</span>}
        </div>

        <div className="flex gap-6 h-full min-h-0 flex-1 min-w-min">
          {categories.map((category) => {
            const taskInputValue = newTaskInputs[category.id] || ''
            const isAddTaskDisabled = taskInputValue.trim().length === 0

            return (
              <div
                key={category.id}
                className="flex flex-col h-full bg-white rounded-lg shadow-sm border border-gray-200 w-80 flex-shrink-0"
              >
              <div className="px-4 py-4 border-b border-gray-200 bg-gray-50 rounded-t-lg flex items-start justify-between gap-2">
                <div>
                  <h2 className="text-sm font-semibold text-gray-800">{category.name}</h2>
                  <p className="text-xs text-gray-500 mt-1">{category.tasks.length} tasks</p>
                </div>
                <button
                  onClick={() => deleteCategory(category.id)}
                  className="text-gray-400 hover:text-red-600 p-1 rounded hover:bg-red-50"
                  title="Delete category"
                >
                  <Trash2 size={16} />
                </button>
              </div>

              <div
                className="flex-1 min-h-0 overflow-y-auto p-3 space-y-2 transition-colors"
                onDragOver={(e) => handleColumnDragOver(e, category.id)}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(category.id, e)}
              >
                {category.tasks.map((task) => {
                  const isEditing = editingTask?.taskId === task.id && editingTask?.categoryId === category.id
                  const statusMeta = ensureOption(statusOptions, task.status, 'status')
                  const urgencyMeta = ensureOption(urgencyOptions, task.urgency, 'urgency')

                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={(e) => handleDragStart(task.id, category.id, e)}
                      onDragOver={(e) => handleTaskDragOver(e, category.id, task.id)}
                      className="relative bg-white border border-gray-200 rounded-lg p-3 cursor-move hover:shadow-md transition-shadow hover:border-gray-300 group"
                    >
                      {!isEditing ? (
                        <>
                          <div className="flex items-start justify-between gap-2">
                            <h3 className="text-sm font-medium text-gray-800">
                              {task.title}
                            </h3>
                            {statusMeta && (
                              <button
                                type="button"
                                onClick={() => {
                                  setUrgencyMenu(null)
                                  setStatusMenu((prev) =>
                                    prev?.taskId === task.id && prev?.categoryId === category.id
                                      ? null
                                      : { taskId: task.id, categoryId: category.id },
                                  )
                                }}
                                className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-full transition-colors hover:brightness-95 ${getBadgeClass(statusMeta)}`}
                                style={getBadgeStyle(statusMeta)}
                                title="Change status"
                              >
                                <span
                                  className={`inline-block h-2 w-2 rounded-full ${getDotClass(statusMeta)}`}
                                  style={getDotStyle(statusMeta)}
                                />
                                {statusMeta.label}
                              </button>
                            )}
                          </div>
                          {urgencyMeta && (
                            <div className="flex items-start justify-between gap-2 mt-2">
                              <span className="text-[11px] text-gray-500">Urgency</span>
                              <button
                                type="button"
                                onClick={() => {
                                  setStatusMenu(null)
                                  setUrgencyMenu((prev) =>
                                    prev?.taskId === task.id && prev?.categoryId === category.id
                                      ? null
                                      : { taskId: task.id, categoryId: category.id },
                                  )
                                }}
                                className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-full transition-colors hover:brightness-95 ${getBadgeClass(urgencyMeta)}`}
                                style={getBadgeStyle(urgencyMeta)}
                                title="Change urgency"
                              >
                                <span
                                  className={`inline-block h-2 w-2 rounded-full ${getDotClass(urgencyMeta)}`}
                                  style={getDotStyle(urgencyMeta)}
                                />
                                {urgencyMeta.label}
                              </button>
                            </div>
                          )}
                          {task.description && (
                            <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{task.description}</p>
                          )}
                          <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity justify-start">
                            <button
                              onClick={() =>
                                setEditingTask({
                                  taskId: task.id,
                                  categoryId: category.id,
                                  title: task.title,
                                  description: task.description || '',
                                })
                              }
                              className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                              title="Edit task"
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              onClick={() => deleteTask(task.id, category.id)}
                              className="text-gray-400 hover:text-red-600 p-1 rounded hover:bg-red-50"
                              title="Delete task"
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>

                          {statusMenu?.taskId === task.id && statusMenu?.categoryId === category.id && (
                            <div className="absolute right-2 top-10 z-20 w-44 rounded-md border border-gray-200 bg-white shadow-md">
                              <div className="px-3 py-2 text-xs font-semibold text-gray-500">Set status</div>
                              <div className="flex flex-col divide-y divide-gray-100">
                                {statusOptions.map((option) => (
                                  <button
                                    key={option.value}
                                    onClick={() => updateTaskStatus(category.id, task.id, option.value)}
                                    className={`flex items-center justify-between px-3 py-2 text-left text-xs hover:bg-gray-50 ${
                                      task.status === option.value ? 'text-blue-600 font-semibold' : 'text-gray-700'
                                    }`}
                                  >
                                    <span className="flex items-center gap-2">
                                      <span
                                        className={`h-2 w-2 rounded-full ${getDotClass(option)}`}
                                        style={getDotStyle(option)}
                                      />
                                      {option.label}
                                    </span>
                                    {task.status === option.value && <span className="text-[10px]">Selected</span>}
                                  </button>
                                ))}
                                <button
                                  onClick={() => openAddOptionForm('status', category.id, task.id)}
                                  className="flex items-center justify-between px-3 py-2 text-left text-xs text-blue-600 hover:bg-blue-50"
                                >
                                  <span className="flex items-center gap-2">
                                    <Plus size={12} />
                                    Add status
                                  </span>
                                </button>
                                <button
                                  onClick={() => setStatusMenu(null)}
                                  className="flex items-center justify-between px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
                                >
                                  <span className="flex items-center gap-2">Cancel</span>
                                </button>
                              </div>
                              {addOptionForm.open &&
                                addOptionForm.type === 'status' &&
                                addOptionForm.anchorTaskId === task.id &&
                                addOptionForm.anchorCategoryId === category.id && (
                                  <div className="absolute left-full top-0 ml-2 w-56 rounded-md border border-gray-200 bg-white shadow-md p-3">
                                    <p className="text-xs font-semibold text-gray-700 mb-2">Add status</p>
                                    <div className="space-y-2">
                                      <input
                                        type="text"
                                        value={addOptionForm.label}
                                        onChange={(e) => setAddOptionForm((prev) => ({ ...prev, label: e.target.value }))}
                                        placeholder="Status name"
                                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:border-blue-500"
                                      />
                                      <label className="flex items-center justify-between text-xs text-gray-600">
                                        <span>Color</span>
                                        <input
                                          type="color"
                                          value={addOptionForm.color}
                                          onChange={(e) => setAddOptionForm((prev) => ({ ...prev, color: e.target.value }))}
                                          className="h-7 w-12 cursor-pointer border border-gray-200 rounded"
                                        />
                                      </label>
                                      <div className="flex justify-end gap-2 pt-1">
                                        <button
                                          onClick={resetAddOptionForm}
                                          className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded hover:bg-gray-200"
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          onClick={saveNewOption}
                                          disabled={savingOption || addOptionForm.label.trim().length === 0}
                                          className={`px-2 py-1 text-xs rounded ${
                                            savingOption || addOptionForm.label.trim().length === 0
                                              ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                              : 'bg-blue-600 text-white hover:bg-blue-700'
                                          }`}
                                        >
                                          Done
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                            </div>
                          )}

                          {urgencyMenu?.taskId === task.id && urgencyMenu?.categoryId === category.id && (
                            <div className="absolute right-2 top-28 z-20 w-44 rounded-md border border-gray-200 bg-white shadow-md">
                              <div className="px-3 py-2 text-xs font-semibold text-gray-500">Set urgency</div>
                              <div className="flex flex-col divide-y divide-gray-100">
                                {urgencyOptions.map((option) => (
                                  <button
                                    key={option.value}
                                    onClick={() => updateTaskUrgency(category.id, task.id, option.value)}
                                    className={`flex items-center justify-between px-3 py-2 text-left text-xs hover:bg-gray-50 ${
                                      task.urgency === option.value ? 'text-blue-600 font-semibold' : 'text-gray-700'
                                    }`}
                                  >
                                    <span className="flex items-center gap-2">
                                      <span
                                        className={`h-2 w-2 rounded-full ${getDotClass(option)}`}
                                        style={getDotStyle(option)}
                                      />
                                      {option.label}
                                    </span>
                                    {task.urgency === option.value && <span className="text-[10px]">Selected</span>}
                                  </button>
                                ))}
                                <button
                                  onClick={() => openAddOptionForm('urgency', category.id, task.id)}
                                  className="flex items-center justify-between px-3 py-2 text-left text-xs text-blue-600 hover:bg-blue-50"
                                >
                                  <span className="flex items-center gap-2">
                                    <Plus size={12} />
                                    Add status
                                  </span>
                                </button>
                                <button
                                  onClick={() => setUrgencyMenu(null)}
                                  className="flex items-center justify-between px-3 py-2 text-left text-xs text-gray-700 hover:bg-gray-50"
                                >
                                  <span className="flex items-center gap-2">Cancel</span>
                                </button>
                              </div>
                              {addOptionForm.open &&
                                addOptionForm.type === 'urgency' &&
                                addOptionForm.anchorTaskId === task.id &&
                                addOptionForm.anchorCategoryId === category.id && (
                                  <div className="absolute left-full top-0 ml-2 w-56 rounded-md border border-gray-200 bg-white shadow-md p-3">
                                    <p className="text-xs font-semibold text-gray-700 mb-2">Add status</p>
                                    <div className="space-y-2">
                                      <input
                                        type="text"
                                        value={addOptionForm.label}
                                        onChange={(e) => setAddOptionForm((prev) => ({ ...prev, label: e.target.value }))}
                                        placeholder="Status name"
                                        className="w-full px-2 py-1.5 border border-gray-300 rounded text-xs focus:outline-none focus:border-blue-500"
                                      />
                                      <label className="flex items-center justify-between text-xs text-gray-600">
                                        <span>Color</span>
                                        <input
                                          type="color"
                                          value={addOptionForm.color}
                                          onChange={(e) => setAddOptionForm((prev) => ({ ...prev, color: e.target.value }))}
                                          className="h-7 w-12 cursor-pointer border border-gray-200 rounded"
                                        />
                                      </label>
                                      <div className="flex justify-end gap-2 pt-1">
                                        <button
                                          onClick={resetAddOptionForm}
                                          className="px-2 py-1 bg-gray-100 text-gray-700 text-xs rounded hover:bg-gray-200"
                                        >
                                          Cancel
                                        </button>
                                        <button
                                          onClick={saveNewOption}
                                          disabled={savingOption || addOptionForm.label.trim().length === 0}
                                          className={`px-2 py-1 text-xs rounded ${
                                            savingOption || addOptionForm.label.trim().length === 0
                                              ? 'bg-gray-200 text-gray-500 cursor-not-allowed'
                                              : 'bg-blue-600 text-white hover:bg-blue-700'
                                          }`}
                                        >
                                          Done
                                        </button>
                                      </div>
                                    </div>
                                  </div>
                                )}
                            </div>
                          )}
                        </>
                      ) : (
                        <div className="space-y-2">
                          <input
                            type="text"
                            value={editingTask.title}
                            onChange={(e) =>
                              setEditingTask((prev) => (prev ? { ...prev, title: e.target.value } : prev))
                            }
                            placeholder="Task title"
                            className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
                            autoFocus
                            onKeyDown={(e) => {
                              if (e.key === 'Enter') {
                                updateTaskDetails(category.id, task.id, editingTask.title, editingTask.description)
                              } else if (e.key === 'Escape') {
                                setEditingTask(null)
                              }
                            }}
                          />
                          <textarea
                            value={editingTask.description}
                            onChange={(e) =>
                              setEditingTask((prev) => (prev ? { ...prev, description: e.target.value } : prev))
                            }
                            placeholder="Description (optional)"
                            className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:border-blue-500 resize-none"
                            rows={3}
                            onKeyDown={(e) => {
                              if (e.key === 'Escape') {
                                setEditingTask(null)
                              }
                            }}
                          />
                          <div className="flex gap-2 justify-end">
                            <button
                              onClick={() =>
                                updateTaskDetails(category.id, task.id, editingTask.title, editingTask.description)
                              }
                              className="px-2 py-1 bg-blue-500 text-white text-xs rounded hover:bg-blue-600"
                            >
                              Save
                            </button>
                            <button
                              onClick={() => setEditingTask(null)}
                              className="px-2 py-1 bg-gray-200 text-gray-700 text-xs rounded hover:bg-gray-300"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })}

                {category.tasks.length === 0 && (
                  <div className="flex items-center justify-center h-32 text-gray-400">
                    <p className="text-xs">No tasks yet</p>
                  </div>
                )}
              </div>

              <div className="px-3 py-3 border-t border-gray-200 bg-gray-50 rounded-b-lg">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add a task..."
                    value={taskInputValue}
                    onChange={(e) =>
                      setNewTaskInputs((prev) => ({
                        ...prev,
                        [category.id]: e.target.value,
                      }))
                    }
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        addTask(category.id)
                      }
                    }}
                    className="flex-1 px-2 py-1.5 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
                  />
                  <button
                    onClick={() => addTask(category.id)}
                    disabled={isAddTaskDisabled}
                    className={`p-1.5 rounded transition-colors ${
                      isAddTaskDisabled ? 'bg-gray-200 text-gray-500 cursor-not-allowed' : 'bg-blue-500 text-white hover:bg-blue-600'
                    }`}
                    title="Add task"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
