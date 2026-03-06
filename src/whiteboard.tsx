import React, { useRef, useEffect, useState } from 'react';

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
            const lerp = 0.2;
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

        setCurrentAction({
            ...currentAction,
            points: [...currentAction.points, { x, y }]
        });
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
          circle.setAttribute('r', (number/2).toString());
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
    };

    const handlePinchZoomOut = (factor: number, centerX: number, centerY: number) => {
        zoomAtPoint(1 / factor, centerX, centerY);
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

    return (
        <div className="flex flex-col h-screen bg-white overflow-hidden">
            <svg
                width="100%"
                height="100%"
                className="absolute top-0 left-0 pointer-events-none"
            >
            <circle
                id="mouseSizeCircle"
                cx={cursorPos.x}
                cy={cursorPos.y}
                r="10"
                stroke="black"
                strokeWidth="1"
                fill="none"
            />
        </svg>
            <div className="p-4 bg-gray-100 flex gap-10 items-center">
                <button
                    onClick={() => setTool('pen')}
                    className={`px-4 py-2 rounded ${tool === 'pen' ? 'bg-blue-500 text-white border-gray-400 border' : 'bg-gray-300'}`}
                >
                    Pen
                </button>
                <button
                    onClick={() => setTool('eraser')}
                    className={`px-4 py-2 rounded ${tool === 'eraser' ? 'bg-blue-500 text-white border-gray-400 border' : 'bg-gray-300'}`}
                >
                    Eraser
                </button>
                <button onClick={clearCanvas} className="px-4 py-2 rounded bg-red-500 text-white">
                    Clear
                </button>
                <input 
                    type="range" 
                    min="1" 
                    max="50" 
                    value={mouseSize} 
                    onChange={(e) => resizeDrawWidth(parseInt(e.target.value))} 
                    className="ml-4" 
                />
                <input type="color" id="colorPicker" value={drawColor} onChange={(e) => setDrawColorAndMore(e.target.value)} />
                <span>{mouseSize}</span>
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