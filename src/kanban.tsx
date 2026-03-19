import React, { useState } from 'react'
import { Plus, Trash2, X } from 'lucide-react'

interface Task {
  id: string
  title: string
  description?: string
}

interface Category {
  id: string
  name: string
  tasks: Task[]
}

export const KanbanBoard: React.FC = () => {
  const [categories, setCategories] = useState<Category[]>([
    {
      id: 'todo',
      name: 'To Do',
      tasks: [
        { id: '1', title: 'Design wireframes', description: 'Create initial mockups' },
        { id: '2', title: 'Setup database', description: 'Configure Supabase' },
      ],
    },
    {
      id: 'inprogress',
      name: 'In Progress',
      tasks: [{ id: '3', title: 'Build API', description: 'Create REST endpoints' }],
    },
    {
      id: 'done',
      name: 'Done',
      tasks: [{ id: '4', title: 'Project setup', description: 'Initialize repo' }],
    },
  ])

  const [draggedTask, setDraggedTask] = useState<{
    taskId: string
    fromCategoryId: string
  } | null>(null)
  const [newTaskInputs, setNewTaskInputs] = useState<Record<string, string>>({})
  const [editingTask, setEditingTask] = useState<{ taskId: string; categoryId: string } | null>(null)

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

  const handleDrop = (categoryId: string, e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault()
    e.currentTarget.classList.remove('bg-blue-50')

    if (!draggedTask) return

    setCategories((prev) => {
      const newCategories = prev.map((cat) => ({ ...cat }))
      const fromCategory = newCategories.find((cat) => cat.id === draggedTask.fromCategoryId)
      const toCategory = newCategories.find((cat) => cat.id === categoryId)

      if (!fromCategory || !toCategory) return prev

      const task = fromCategory.tasks.find((t) => t.id === draggedTask.taskId)
      if (!task) return prev

      fromCategory.tasks = fromCategory.tasks.filter((t) => t.id !== draggedTask.taskId)
      toCategory.tasks.push(task)

      return newCategories
    })

    setDraggedTask(null)
  }

  const addTask = (categoryId: string) => {
    const title = newTaskInputs[categoryId]?.trim()
    if (!title) return

    setCategories((prev) =>
      prev.map((cat) => {
        if (cat.id === categoryId) {
          return {
            ...cat,
            tasks: [
              ...cat.tasks,
              {
                id: crypto.randomUUID(),
                title,
                description: '',
              },
            ],
          }
        }
        return cat
      }),
    )

    setNewTaskInputs((prev) => {
      const next = { ...prev }
      delete next[categoryId]
      return next
    })
  }

  const deleteTask = (taskId: string, categoryId: string) => {
    setCategories((prev) =>
      prev.map((cat) => {
        if (cat.id === categoryId) {
          return {
            ...cat,
            tasks: cat.tasks.filter((t) => t.id !== taskId),
          }
        }
        return cat
      }),
    )
  }

  const updateTask = (taskId: string, categoryId: string, newTitle: string, newDescription: string) => {
    setCategories((prev) =>
      prev.map((cat) => {
        if (cat.id === categoryId) {
          return {
            ...cat,
            tasks: cat.tasks.map((t) => {
              if (t.id === taskId) {
                return { ...t, title: newTitle, description: newDescription }
              }
              return t
            }),
          }
        }
        return cat
      }),
    )
    setEditingTask(null)
  }

  return (
    <div className="flex h-screen bg-gray-50 overflow-hidden">
      {/* Kanban board */}
      <div className="flex-1 overflow-x-auto p-6">
        <div className="flex gap-6 h-full min-w-min">
          {categories.map((category) => (
            <div
              key={category.id}
              className="flex flex-col bg-white rounded-lg shadow-sm border border-gray-200 w-80 flex-shrink-0"
            >
              {/* Category header */}
              <div className="px-4 py-4 border-b border-gray-200 bg-gray-50 rounded-t-lg">
                <h2 className="text-sm font-semibold text-gray-800">{category.name}</h2>
                <p className="text-xs text-gray-500 mt-1">{category.tasks.length} tasks</p>
              </div>

              {/* Tasks list */}
              <div
                className="flex-1 overflow-y-auto p-3 space-y-2 transition-colors"
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={(e) => handleDrop(category.id, e)}
              >
                {category.tasks.map((task) => (
                  <div
                    key={task.id}
                    draggable
                    onDragStart={() => handleDragStart(task.id, category.id)}
                    className="bg-white border border-gray-200 rounded-lg p-3 cursor-move hover:shadow-md transition-shadow hover:border-gray-300 group"
                  >
                    {editingTask?.taskId === task.id && editingTask?.categoryId === category.id ? (
                      <div className="space-y-2">
                        <input
                          type="text"
                          defaultValue={task.title}
                          placeholder="Task title"
                          className="w-full px-2 py-1 border border-gray-300 rounded text-sm focus:outline-none focus:border-blue-500"
                          autoFocus
                          onKeyDown={(e) => {
                            if (e.key === 'Enter') {
                              const title = (e.target as HTMLInputElement).value
                              const description = task.description || ''
                              updateTask(task.id, category.id, title, description)
                            } else if (e.key === 'Escape') {
                              setEditingTask(null)
                            }
                          }}
                        />
                        <textarea
                          defaultValue={task.description || ''}
                          placeholder="Description (optional)"
                          className="w-full px-2 py-1 border border-gray-300 rounded text-xs focus:outline-none focus:border-blue-500 resize-none"
                          rows={2}
                          onKeyDown={(e) => {
                            if (e.key === 'Escape') {
                              setEditingTask(null)
                            }
                          }}
                        />
                        <div className="flex gap-2 justify-end">
                          <button
                            onClick={() => {
                              const titleInput = document.querySelector(
                                `input[placeholder="Task title"]`,
                              ) as HTMLInputElement
                              const descInput = document.querySelector(
                                `textarea[placeholder="Description (optional)"]`,
                              ) as HTMLTextAreaElement
                              if (titleInput) {
                                updateTask(task.id, category.id, titleInput.value, descInput?.value || '')
                              }
                            }}
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
                    ) : (
                      <>
                        <h3
                          className="text-sm font-medium text-gray-800 cursor-pointer hover:text-blue-600"
                          onClick={() => setEditingTask({ taskId: task.id, categoryId: category.id })}
                        >
                          {task.title}
                        </h3>
                        {task.description && (
                          <p className="text-xs text-gray-600 mt-1 line-clamp-2">{task.description}</p>
                        )}
                        <div className="flex gap-1 mt-2 opacity-0 group-hover:opacity-100 transition-opacity">
                          <button
                            onClick={() =>
                              setEditingTask({ taskId: task.id, categoryId: category.id })
                            }
                            className="text-gray-400 hover:text-gray-600 p-1 rounded hover:bg-gray-100"
                            title="Edit task"
                          >
                            <X size={14} />
                          </button>
                          <button
                            onClick={() => deleteTask(task.id, category.id)}
                            className="text-gray-400 hover:text-red-600 p-1 rounded hover:bg-red-50"
                            title="Delete task"
                          >
                            <Trash2 size={14} />
                          </button>
                        </div>
                      </>
                    )}
                  </div>
                ))}

                {/* Empty state */}
                {category.tasks.length === 0 && (
                  <div className="flex items-center justify-center h-32 text-gray-400">
                    <p className="text-xs">No tasks yet</p>
                  </div>
                )}
              </div>

              {/* Add task input */}
              <div className="px-3 py-3 border-t border-gray-200 bg-gray-50 rounded-b-lg">
                <div className="flex gap-2">
                  <input
                    type="text"
                    placeholder="Add a task..."
                    value={newTaskInputs[category.id] || ''}
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
                    className="p-1.5 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
                    title="Add task"
                  >
                    <Plus size={16} />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
