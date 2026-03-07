import React, { useRef, useEffect, useState, use } from 'react';
import { Pen, Eraser, Trash2, Minus, Plus } from 'lucide-react';

interface DrawAction {
    type: 'stroke' | 'erase';
    drawing: true|false;
    points: { x: number; y: number }[];
    lineWidth?: number;
    eraseRadius?: number;
    drawColor?: string;
}

/**
 * Whiteboard component for drawing and erasing on a canvas.
 * 
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
    const canvasRef = useRef<HTMLCanvasElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
    const [actions, setActions] = useState<DrawAction[]>([]);
    const [currentAction, setCurrentAction] = useState<DrawAction | null>(null);
    const [mouseSize, setMouseSize] = useState(10);
    const [drawColor, setDrawColor] = useState('#000000');
    const [panX, setPanX] = useState(0);
    const [panY, setPanY] = useState(0);
    const [scale, setScale] = useState(1);
    const [cursorPos, setCursorPos] = useState({ x: 0, y: 0 });
    const panRef = useRef({ x: 0, y: 0 });
    const scaleRef = useRef(1);
    const cursorTargetRef = useRef({ x: 0, y: 0 });
    const cursorRef = useRef({ x: 0, y: 0 });
    const [isPanning, setIsPanning] = useState(false);
    const [panStart, setPanStart] = useState({ x: 0, y: 0 });
    const pinchStartDistance = useRef<number | null>(null);

    const updatePan = (x: number, y: number) => {
        panRef.current = { x, y };
        setPanX(x);
        setPanY(y);
    };

    const handleCanvasPan = (e: React.MouseEvent<HTMLCanvasElement> | MouseEvent, isMouseDown: boolean) => {
        if (isMouseDown) {
            // Start pan on right-click
            const canvas = canvasRef.current;
            if (!canvas) return;
            setIsPanning(true);
            setPanStart({ x: e.clientX - panRef.current.x, y: e.clientY - panRef.current.y });
        } else {
            // Update pan position on mouse move
            if (!isPanning) return;
            updatePan(e.clientX - panStart.x, e.clientY - panStart.y);
        }
    };

    const clampScale = (value: number) => Math.max(0.25, Math.min(4, value));

    // Zoom keeping the whiteboard content under the focal point stationary.
    const zoomAtPoint = (factor: number, clientX: number, clientY: number) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const focusX = clientX - rect.left;
        const focusY = clientY - rect.top;
        const prevScale = scaleRef.current;
        const nextScale = clampScale(prevScale * factor);
        const worldX = (focusX - panRef.current.x) / prevScale;
        const worldY = (focusY - panRef.current.y) / prevScale;
        const nextPanX = focusX - worldX * nextScale;
        const nextPanY = focusY - worldY * nextScale;
        scaleRef.current = nextScale;
        setScale(nextScale);
        updatePan(nextPanX, nextPanY);
        resizeDrawWidth(mouseSize);
    };

    const handleWheelPan = (e: React.WheelEvent<HTMLCanvasElement>) => {
        // Trackpad pinch emits wheel with ctrlKey; treat as zoom instead of pan
        if (e.ctrlKey) {
            const magnitude = Math.min(Math.abs(e.deltaY) / 200, 0.5) + 1;
            const factor = e.deltaY < 0 ? magnitude : 1 / magnitude;
            zoomAtPoint(factor, e.clientX, e.clientY);
            return;
        }
        updatePan(panRef.current.x - e.deltaX, panRef.current.y - e.deltaY);
    };

    const stopPan = () => {
        setIsPanning(false);
    };

    // store canvas dimensions so we can drive the SVG overlay and
    // re‑size when the window changes without losing existing drawings
    const [canvasSize, setCanvasSize] = useState({ width: 0, height: 0 });
    // smooth cursor marker that follows pointer
    useEffect(() => {
        let raf: number;
        const tick = () => {
            const lerp = 1;
            const nextX = cursorRef.current.x + (cursorTargetRef.current.x - cursorRef.current.x) * lerp;
            const nextY = cursorRef.current.y + (cursorTargetRef.current.y - cursorRef.current.y) * lerp;
            cursorRef.current = { x: nextX, y: nextY };
            setCursorPos(cursorRef.current);
            raf = requestAnimationFrame(tick);
        };
        raf = requestAnimationFrame(tick);
        return () => cancelAnimationFrame(raf);
    }, []);

    // helper that performs full redraw; can be called from resize handler
    const redraw = () => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;

        // make sure the element attributes match our stored size; setting
        // width/height clears the bitmap but we immediately redraw below
        canvas.width = canvasSize.width;
        canvas.height = canvasSize.height;

        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2;

        // white background
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // draw saved actions
        ctx.save();
        ctx.translate(panX, panY);
        ctx.scale(scale, scale);
        for (const action of actions) {
            if (action.drawing) {
                if (action.type === 'stroke') {
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.strokeStyle = action.drawColor || drawColor;
                } else if (action.type === 'erase') {
                    ctx.globalCompositeOperation = 'destination-out';
                }
                ctx.lineWidth = (action.lineWidth || mouseSize);
                ctx.beginPath();
                ctx.moveTo(action.points[0].x, action.points[0].y);
                for (let i = 1; i < action.points.length; i++) {
                    ctx.lineTo(action.points[i].x, action.points[i].y);
                }
                ctx.stroke();
            }
        }

        // draw current action
        if (currentAction && currentAction.drawing) {
            if (currentAction.type === 'stroke') {
                ctx.globalCompositeOperation = 'source-over';
                ctx.strokeStyle = currentAction.drawColor || drawColor;
            } else if (currentAction.type === 'erase') {
                ctx.globalCompositeOperation = 'destination-out';
            }
            ctx.strokeStyle = currentAction.drawColor || drawColor;
            ctx.lineWidth = (currentAction.lineWidth || mouseSize);
            ctx.beginPath();
            ctx.moveTo(currentAction.points[0].x, currentAction.points[0].y);
            for (let i = 1; i < currentAction.points.length; i++) {
                ctx.lineTo(currentAction.points[i].x, currentAction.points[i].y);
            }
            ctx.stroke();
        }
        ctx.restore();
    };

    // effect drives redraw whenever relevant state changes
    useEffect(() => {
        redraw();
    }, [actions, currentAction, panX, panY, canvasSize, scale]);

    // resize listener that updates canvasSize from the element’s
    // client dimensions.  clientWidth/Height reflect the size of the
    // flex-1 container after the toolbar is laid out and never include a
    // scrollbar, so we stop the body from scrolling entirely.
    useEffect(() => {
        const handleResize = () => {
            const canvasEl = canvasRef.current;
            if (canvasEl) {
                canvasEl.width = canvasEl.clientWidth;
                canvasEl.height = canvasEl.clientHeight;
                setCanvasSize({ width: canvasEl.clientWidth, height: canvasEl.clientHeight });
            }
        };
        window.addEventListener('resize', handleResize);
        handleResize(); // initial
        return () => window.removeEventListener('resize', handleResize);
    }, []);


    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = (e.clientX - rect.left - panRef.current.x) / scaleRef.current;
        const y = (e.clientY - rect.top - panRef.current.y) / scaleRef.current;
        setIsDrawing(true);
        setCurrentAction({
            type: tool === 'pen' ? 'stroke' : 'erase',
            drawing: true,
            points: [{ x, y }],
            lineWidth: mouseSize,
            eraseRadius: undefined,
            drawColor: tool === 'pen' ? drawColor : undefined
        });
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!isDrawing || !currentAction) return;
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const x = (e.clientX - rect.left - panRef.current.x) / scaleRef.current;
    const y = (e.clientY - rect.top - panRef.current.y) / scaleRef.current;

    const startPoint = currentAction.points[0];

    if (e.shiftKey) {
        const dx = x - startPoint.x;
    const dy = y - startPoint.y;
    const distance = Math.sqrt(dx * dx + dy * dy);
    const angle = Math.atan2(dy, dx); // radians

    // Define snap angles (in degrees) — add/remove as needed
    const snapDegrees = [0, 22.5, 45, 67.5, 90, 112.5, 135, 157.5, 180, -157.5, -135, -112.5, -90, -67.5, -45, -22.5];
    const snapRadians = snapDegrees.map(d => d * (Math.PI / 180));

    // Find the closest snap angle
    const nearest = snapRadians.reduce((prev, curr) =>
        Math.abs(curr - angle) < Math.abs(prev - angle) ? curr : prev
    );

    const snappedPoint = {
        x: startPoint.x + distance * Math.cos(nearest),
        y: startPoint.y + distance * Math.sin(nearest),
    };
    setCurrentAction({
        ...currentAction,
        points: [startPoint, snappedPoint]
    });
    } else if (e.altKey) {
        // Option/Alt: straight line from start to current mouse position
        setCurrentAction({
            ...currentAction,
            points: [startPoint, { x, y }]
        });
    } else {
        // Normal freehand drawing
        setCurrentAction({
            ...currentAction,
            points: [...currentAction.points, { x, y }]
        });
    }
};

    const stopDrawing = () => {
        if (currentAction) {
            setActions([...actions, currentAction]);
            setCurrentAction(null);
        }
        setIsDrawing(false);
    };

    const clearCanvas = () => {
        setActions([]);
        setCurrentAction(null);
    };
    const resizeDrawWidth = (number: number) => {
        if (!canvasRef.current) return;
        if (!mouseSize) return;
        if (number < 1) number = 1;
        if (number > 50) number = 50;
        setMouseSize(number);
        const circle = document.getElementById('mouseSizeCircle');
        const ctx = canvasRef.current.getContext('2d');
        if (circle) {
          circle.setAttribute('r', (number/2*scale).toString());
          ctx!.lineWidth = number;
        }
    }
    const setDrawColorAndMore = (color: string) => {
        setDrawColor(color);
        const circle = document.getElementById('mouseSizeCircle');
        if (circle) {
          circle.setAttribute('stroke', color);
        }
    }

    const handlePinchZoomIn = (factor: number, centerX: number, centerY: number) => {
        zoomAtPoint(factor, centerX, centerY);
        resizeDrawWidth(mouseSize);
    };

    const handlePinchZoomOut = (factor: number, centerX: number, centerY: number) => {
        zoomAtPoint(1 / factor, centerX, centerY);
        resizeDrawWidth(mouseSize);
    };

    const getPinchInfo = (touches: React.TouchList) => {
        const a = touches.item(0);
        const b = touches.item(1);
        if (!a || !b) return { distance: 0, centerX: 0, centerY: 0 };
        const dx = a.clientX - b.clientX;
        const dy = a.clientY - b.clientY;
        return {
            distance: Math.hypot(dx, dy),
            centerX: (a.clientX + b.clientX) / 2,
            centerY: (a.clientY + b.clientY) / 2,
        };
    };

    const handleTouchStart = (e: React.TouchEvent<HTMLCanvasElement>) => {
        if (e.touches.length === 2) {
            const { distance } = getPinchInfo(e.touches);
            pinchStartDistance.current = distance;
        }
    };

    const handleTouchMove = (e: React.TouchEvent<HTMLCanvasElement>) => {
        if (e.touches.length === 2) {
            e.preventDefault();
            const { distance: currentDistance, centerX, centerY } = getPinchInfo(e.touches);
            const initialDistance = pinchStartDistance.current;
            if (!initialDistance) {
                pinchStartDistance.current = currentDistance;
                return;
            }
            const changeRatio = currentDistance / initialDistance;
            if (changeRatio > 1.01) {
                handlePinchZoomIn(changeRatio, centerX, centerY);
            } else if (changeRatio < 0.99) {
                handlePinchZoomOut(1 / changeRatio, centerX, centerY);
            }
            pinchStartDistance.current = currentDistance;
        }
    };

    const handleTouchEnd = () => {
        pinchStartDistance.current = null;
    };

    function clamp(arg0: number, arg1: number, arg2: number): number {
        if (arg0 < arg1) return arg1;
        if (arg0 > arg2) return arg2;
        return arg0;
    }

    return (
    <div className="flex flex-col h-screen bg-white overflow-hidden">
        <svg
            width="100%"
            height="100%"
            className="absolute top-0 left-0 pointer-events-none"
            style={{ zIndex: 10 }}
        >
            <circle
                id="mouseSizeCircle"
                cx={cursorPos.x}
                cy={cursorPos.y}
                r="5"
                stroke="black"
                strokeWidth="1"
                fill="none"
            />
        </svg>

        {/* Header toolbar */}
        <div className="flex items-center justify-center gap-1 px-3 py-2 bg-white border-b border-gray-100 shadow-sm select-none" style={{ zIndex: 5 }}>
            
            {/* Tool group */}
            <div className="flex items-center gap-1 pr-3 border-r border-gray-200">
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
                <Minus size={12} className="text-gray-400 hover:bg-gray-100 hover:text-gray-800" onClick={(e)=>resizeDrawWidth(clamp(mouseSize - 1, 1, 50))}/>
                <input
                    type="range"
                    min="1"
                    max="50"
                    value={mouseSize}
                    onChange={(e) => resizeDrawWidth(parseInt(e.target.value))}
                    className="w-20 accent-gray-800"
                    title="Brush size"
                />
                <Plus size={12} className="text-gray-400 hover:bg-gray-100 hover:text-gray-800" onClick={(e)=>resizeDrawWidth(clamp(mouseSize + 1, 1, 50))}/>
                <span className="text-xs text-gray-400 w-5 text-right tabular-nums">{mouseSize}</span>
            </div>

            {/* Color group */}
            <div className="flex items-center gap-2 px-3 border-r border-gray-200">
                <label
                    htmlFor="colorPicker"
                    className="w-6 h-6 rounded-md cursor-pointer border border-gray-200 shadow-inner transition-transform hover:scale-110"
                    style={{ backgroundColor: drawColor }}
                    title="Color"
                />
                <input
                    type="color"
                    id="colorPicker"
                    value={drawColor}
                    onChange={(e) => setDrawColorAndMore(e.target.value)}
                    className="sr-only"
                />
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
        </div>

        <canvas
            ref={canvasRef}
            style={{ width: '100%', height: '100%', touchAction: 'none' }}
            onMouseDown={(e) => {
                if (e.button === 2) {
                    handleCanvasPan(e, true);
                } else if (e.button === 0) {
                    startDrawing(e);
                }
            }}
            onMouseMove={(e) => {
                cursorTargetRef.current = { x: e.clientX, y: e.clientY };
                if (isPanning) {
                    handleCanvasPan(e, false);
                } else if (e.button === 0) {
                    draw(e);
                }
            }}
            onMouseUp={isPanning ? stopPan : stopDrawing}
            onMouseLeave={isPanning ? stopPan : stopDrawing}
            onWheel={handleWheelPan}
            onTouchStart={handleTouchStart}
            onTouchMove={handleTouchMove}
            onTouchEnd={handleTouchEnd}
            onContextMenu={(e) => {
                e.preventDefault();
                return false;
            }}
            className="flex-1 cursor-crosshair bg-white"
        />
    </div>
);
};