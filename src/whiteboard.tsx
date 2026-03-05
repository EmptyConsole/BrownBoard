import React, { useRef, useState } from 'react';

interface Path {
    points: { x: number; y: number }[];
    color: string;
}

export const Whiteboard: React.FC = () => {
    const svgRef = useRef<SVGSVGElement>(null);
    const [isDrawing, setIsDrawing] = useState(false);
    const [tool, setTool] = useState<'pen' | 'eraser'>('pen');
    const [currentPath, setCurrentPath] = useState<Path | null>(null);
    const [paths, setPaths] = useState<Path[]>([]);

    const eraseAt = (x: number, y: number) => {
        setPaths(paths.map(path => ({
            ...path,
            points: path.points.filter(point => Math.sqrt((point.x - x) ** 2 + (point.y - y) ** 2) > 10)
        })));
    };

    const startDrawing = (e: React.MouseEvent<SVGSVGElement>) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (tool === 'eraser') {
            eraseAt(x, y);
        } else {
            const newPath: Path = { points: [{ x, y }], color: '#000000' };
            setCurrentPath(newPath);
            setIsDrawing(true);
        }
    };

    const draw = (e: React.MouseEvent<SVGSVGElement>) => {
        const rect = svgRef.current?.getBoundingClientRect();
        if (!rect) return;

        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (tool === 'eraser') {
            eraseAt(x, y);
        } else if (isDrawing && currentPath) {
            setCurrentPath({ ...currentPath, points: [...currentPath.points, { x, y }] });
        }
    };

    const stopDrawing = () => {
        if (currentPath && tool !== 'eraser') {
            setPaths([...paths, currentPath]);
            setCurrentPath(null);
        }
        setIsDrawing(false);
    };

    const clearCanvas = () => {
        setPaths([]);
    };

    const pathToD = (points: { x: number; y: number }[]) => {
        if (points.length === 0) return '';
        let d = `M ${points[0].x} ${points[0].y}`;
        for (let i = 1; i < points.length; i++) {
            d += ` L ${points[i].x} ${points[i].y}`;
        }
        return d;
    };

    return (
        <div className="flex flex-col h-screen bg-white">
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
            </div>
            <svg
                ref={svgRef}
                width={window.innerWidth}
                height={window.innerHeight - 80} // Adjust for toolbar height
                onMouseDown={startDrawing}
                onMouseMove={draw}
                onMouseUp={stopDrawing}
                onMouseLeave={stopDrawing}
                className="flex-1 bg-white cursor-crosshair"
            >
                {paths.map((path, index) => (
                    <path
                        key={index}
                        d={pathToD(path.points)}
                        stroke={path.color}
                        strokeWidth="2"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                ))}
                {currentPath && (
                    <path
                        d={pathToD(currentPath.points)}
                        stroke={currentPath.color}
                        strokeWidth="2"
                        fill="none"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                    />
                )}
            </svg>
        </div>
    );
};