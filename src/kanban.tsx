import React, { useEffect, useMemo, useState } from 'react'
import { MoreVertical, Plus, Trash2 } from 'lucide-react'
import { supabase } from './lib/supabase'

type TaskStatus = 'not_started' | 'in_progress' | 'completed'

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
  category_id: string
  position: number | null
}

interface Task {
  id: string
  title: string
  description: string
  status: TaskStatus
  categoryId: string
  position: number
}

interface Category {
  id: string
  name: string
  position: number
  tasks: Task[]
}

const STATUS_OPTIONS: Array<{ value: TaskStatus; label: string; badge: string; dot: string }> = [
  { value: 'not_started', label: 'Not started', badge: 'bg-gray-200 text-gray-700', dot: 'bg-gray-500' },
  { value: 'in_progress', label: 'In progress', badge: 'bg-amber-100 text-amber-800', dot: 'bg-amber-500' },
  { value: 'completed', label: 'Completed', badge: 'bg-emerald-100 text-emerald-800', dot: 'bg-emerald-500' },
]

const mapTask = (task: DbTask): Task => ({
  id: task.id,
  title: task.title,
  description: task.description || '',
  status: task.status,
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
  const [draggedTask, setDraggedTask] = useState<{ taskId: string; fromCategoryId: string } | null>(null)
  const [editingTask, setEditingTask] = useState<{
    taskId: string
    categoryId: string
    title: string
    description: string
  } | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  const maxCategoryPosition = useMemo(
    () => Math.max(0, ...(categories.map((c) => c.position).filter((p) => typeof p === 'number') as number[])),
    [categories],
  )

  const loadBoard = async () => {
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
  }

  useEffect(() => {
    loadBoard()
  }, [])

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
      .insert({ title, status: 'not_started', category_id: categoryId, position })
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

  const handleDragStart = (taskId: string, categoryId: string) => {
    setDraggedTask({ taskId, fromCategoryId: categoryId })
  }

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.classList.add('bg-blue-50')
  }

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.currentTarget.classList.remove('bg-blue-50')
  }

  const handleDrop = async (categoryId: string, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.classList.remove('bg-blue-50')
    if (!draggedTask) return

    let movedTask: Task | undefined
    setCategories((prev) => {
      const withoutTask = prev.map((cat) => {
        if (cat.id !== draggedTask.fromCategoryId) return cat
        const remaining = cat.tasks.filter((t) => {
          if (t.id === draggedTask.taskId) {
            movedTask = t
            return false
          }
          return true
        })
        return { ...cat, tasks: remaining }
      })

      return withoutTask.map((cat) => {
        if (cat.id === categoryId && movedTask) {
          return { ...cat, tasks: [...cat.tasks, { ...movedTask, categoryId }] }
        }
        return cat
      })
    })

    const newPosition = categories.find((c) => c.id === categoryId)?.tasks.length ?? 0
    const { error: updateError } = await supabase
      .from('tasks')
      .update({ category_id: categoryId, position: newPosition })
      .eq('id', draggedTask.taskId)

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
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(category.id, e)}
              >
                {category.tasks.map((task) => {
                  const isEditing = editingTask?.taskId === task.id && editingTask?.categoryId === category.id
                  const statusMeta = STATUS_OPTIONS.find((s) => s.value === task.status)

                  return (
                    <div
                      key={task.id}
                      draggable
                      onDragStart={() => handleDragStart(task.id, category.id)}
                      className="relative bg-white border border-gray-200 rounded-lg p-3 cursor-move hover:shadow-md transition-shadow hover:border-gray-300 group"
                    >
                      {!isEditing ? (
                        <>
                          <div className="flex items-start justify-between gap-2">
                            <h3
                              className="text-sm font-medium text-gray-800 cursor-pointer hover:text-blue-600"
                              onClick={() =>
                                setEditingTask({
                                  taskId: task.id,
                                  categoryId: category.id,
                                  title: task.title,
                                  description: task.description || '',
                                })
                              }
                            >
                              {task.title}
                            </h3>
                            {statusMeta && (
                              <button
                                type="button"
                                onClick={() =>
                                  setStatusMenu((prev) =>
                                    prev?.taskId === task.id && prev?.categoryId === category.id
                                      ? null
                                      : { taskId: task.id, categoryId: category.id },
                                  )
                                }
                                className={`inline-flex items-center gap-1 px-2 py-1 text-[11px] font-medium rounded-full transition-colors ${statusMeta.badge} hover:brightness-95`}
                                title="Change status"
                              >
                                <span className={`inline-block h-2 w-2 rounded-full ${statusMeta.dot}`} />
                                {statusMeta.label}
                              </button>
                            )}
                          </div>
                          {task.description && (
                            <p className="text-xs text-gray-600 mt-1 whitespace-pre-wrap">{task.description}</p>
                          )}
                          <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
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
                              <MoreVertical size={14} />
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
                                {STATUS_OPTIONS.map((option) => (
                                  <button
                                    key={option.value}
                                    onClick={() => updateTaskStatus(category.id, task.id, option.value)}
                                    className={`flex items-center justify-between px-3 py-2 text-left text-xs hover:bg-gray-50 ${
                                      task.status === option.value ? 'text-blue-600 font-semibold' : 'text-gray-700'
                                    }`}
                                  >
                                    <span className="flex items-center gap-2">
                                      <span className={`h-2 w-2 rounded-full ${option.dot}`} />
                                      {option.label}
                                    </span>
                                    {task.status === option.value && <span className="text-[10px]">Selected</span>}
                                  </button>
                                ))}
                              </div>
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
