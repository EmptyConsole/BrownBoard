import React, { useRef, useEffect, useState } from 'react';

interface DrawAction {
    type: 'stroke' | 'erase';
    drawing: true|false;
    points: { x: number; y: number }[];
    lineWidth?: number;
    eraseRadius?: number;
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

    useEffect(() => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const ctx = canvas.getContext('2d');
        if (!ctx) return;
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = 2;

        // Clear canvas
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        // Redraw all saved actions
        for (const action of actions) {
            if (action.drawing) {
                if (action.type === 'stroke') {
                    ctx.globalCompositeOperation = 'source-over';
                    ctx.strokeStyle = '#000000';
                } else if (action.type === 'erase') {
                    ctx.globalCompositeOperation = 'destination-out';
                    // Don't set strokeStyle for erase—it doesn't matter visually
                    // but keep lineWidth consistent
                }
                ctx.lineWidth = action.lineWidth || mouseSize;
                ctx.beginPath();
                ctx.moveTo(action.points[0].x, action.points[0].y);
                for (let i = 1; i < action.points.length; i++) {
                    ctx.lineTo(action.points[i].x, action.points[i].y);
                }
                ctx.stroke();
            }
        }

        // Redraw current action being drawn
        if (currentAction && currentAction.drawing) {
            if (currentAction.type === 'stroke') {
                ctx.globalCompositeOperation = 'source-over';
                    ctx.strokeStyle = '#000000';
            } 
            else if (currentAction.type === 'erase') {
                ctx.globalCompositeOperation = 'destination-out';
                // const radius = currentAction.eraseRadius || 5;
                // for (const point of currentAction.points) {
                //     ctx.save();
                //     ctx.beginPath();
                //     ctx.arc(point.x, point.y, radius, 0, Math.PI * 2);
                //     ctx.clearRect(point.x - radius, point.y - radius, radius * 2, radius * 2);
                //     ctx.restore();
                // }
            }
            ctx.strokeStyle = '#000000';
                ctx.lineWidth = currentAction.lineWidth || mouseSize;
                ctx.beginPath();
                ctx.moveTo(currentAction.points[0].x, currentAction.points[0].y);
                for (let i = 1; i < currentAction.points.length; i++) {
                    ctx.lineTo(currentAction.points[i].x, currentAction.points[i].y);
                }
                ctx.stroke();
        }
    }, [actions, currentAction]);

    const startDrawing = (e: React.MouseEvent<HTMLCanvasElement>) => {
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        setIsDrawing(true);
        setCurrentAction({
            type: tool === 'pen' ? 'stroke' : 'erase',
            drawing: true,
            points: [{ x, y }],
            lineWidth: mouseSize,
            eraseRadius: undefined
        });
        
        // Erase immediately on click if using eraser
        // if (tool === 'eraser' && eraseRadius) {
        //     const canvas = canvasRef.current;
        //     if (canvas) {
        //         const ctx = canvas.getContext('2d');
        //         if (ctx) {
        //             const radius = eraseRadius;
        //             ctx.save();
        //             ctx.beginPath();
        //             ctx.arc(x, y, radius, 0, Math.PI * 2);
        //             ctx.clip();
        //             ctx.clearRect(x - radius, y - radius, radius * 2, radius * 2);
        //             ctx.restore();
        //         }
        //     }
        // }
    };

    const draw = (e: React.MouseEvent<HTMLCanvasElement>) => {
        if (!isDrawing || !currentAction) return;
        const canvas = canvasRef.current;
        if (!canvas) return;
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

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
          console.log(`Mouse size set to: ${number}`);
        }
    }

    window.addEventListener('mousemove', (event) => {
  const x = event.clientX; 
  const y = event.clientY; 
  const circle = document.getElementById('mouseSizeCircle');
  if (circle) {
    circle.setAttribute('cx', x.toString());
    circle.setAttribute('cy', y.toString());
  }
});

    return (
        <div className="flex flex-col h-screen bg-white">
            <svg width={canvasRef.current?.width.toString() || "0"} height={canvasRef.current?.height.toString() || "0"} className="absolute top-0 left-0 pointer-events-none">
  <circle id = "mouseSizeCircle" cx="10" cy="10" r="10" stroke="black" strokeWidth="1" fill="none" />
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
                <span>{mouseSize}</span>
            </div>
            <canvas
                ref={canvasRef}
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                className="flex-1 cursor-crosshair bg-white"
            />
        </div>
    );
};